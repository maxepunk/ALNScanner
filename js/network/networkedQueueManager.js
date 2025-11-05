        class NetworkedQueueManager {
            constructor(connection) {
                this.connection = connection;
                this.tempQueue = [];
                this.syncing = false;

                // Load any persisted queue
                this.loadQueue();

                // Merge orphaned transactions from fallback queue
                this.mergeOrphanedTransactions();
            }

            /**
             * Merge transactions from fallback queue into main queue
             * This rescues transactions that were saved during connection wizard
             */
            mergeOrphanedTransactions() {
                try {
                    const fallbackQueue = localStorage.getItem('pendingNetworkedTransactions');
                    if (fallbackQueue) {
                        const orphaned = JSON.parse(fallbackQueue);
                        if (Array.isArray(orphaned) && orphaned.length > 0) {
                            Debug.log('Merging orphaned transactions', { count: orphaned.length });

                            // Add to main queue
                            this.tempQueue.push(...orphaned);

                            // Clear fallback queue
                            localStorage.removeItem('pendingNetworkedTransactions');

                            // Save merged queue
                            this.saveQueue();

                            Debug.log('Orphaned transactions merged successfully', {
                                totalQueueSize: this.tempQueue.length
                            });
                        }
                    }
                } catch (error) {
                    Debug.error('Failed to merge orphaned transactions', error);
                }
            }

            /**
             * Queue a transaction for submission
             */
            queueTransaction(transaction) {
                // Check if we have a connection and it's connected
                if (!this.connection || !this.connection.socket?.connected) {
                    // Not connected - add to temp queue
                    this.tempQueue.push(transaction);
                    this.saveQueue();
                    Debug.log('Transaction queued for later submission', {
                        tokenId: transaction.tokenId,
                        queueSize: this.tempQueue.length
                    });
                } else {
                    // Connected - send immediately
                    // Wrap per AsyncAPI contract: {event, data, timestamp}
                    this.connection.socket.emit('transaction:submit', {
                        event: 'transaction:submit',
                        data: transaction,
                        timestamp: new Date().toISOString()
                    });

                    // Listen for result to confirm processing
                    this.connection.socket.once('transaction:result', (result) => {
                        Debug.log('Transaction processed', {
                            status: result.status,
                            tokenId: transaction.tokenId
                        });
                    });
                }
            }

            /**
             * Sync queued transactions when connection restored
             * PHASE 2 (P0.2): Wait for batch:ack before clearing queue
             */
            async syncQueue() {
                if (this.syncing || this.tempQueue.length === 0 || !this.connection || !this.connection.socket?.connected) {
                    return;
                }

                this.syncing = true;
                Debug.log('Starting queue sync', { queueSize: this.tempQueue.length });

                // PHASE 2 (P0.2): Generate batchId for idempotency
                const batchId = this.generateBatchId();
                const batch = [...this.tempQueue]; // Copy for sending

                try {
                    // PHASE 2 (P0.2): Send batch via HTTP POST (not WebSocket)
                    const response = await fetch(`${this.connection.config.url}/api/scan/batch`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            batchId: batchId,
                            transactions: batch
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`Batch upload failed: ${response.status} ${response.statusText}`);
                    }

                    const result = await response.json();
                    Debug.log('Batch uploaded successfully', {
                        batchId,
                        processedCount: result.processedCount,
                        totalCount: result.totalCount
                    });

                    // PHASE 2 (P0.2): Wait for batch:ack WebSocket event before clearing
                    await this.waitForBatchAck(batchId, 60000);

                    Debug.log('Batch acknowledged by server - clearing queue', { batchId });

                    // PHASE 2 (P0.2): Only clear queue AFTER server confirms receipt
                    this.tempQueue = [];
                    this.saveQueue();

                } catch (error) {
                    Debug.error('Queue sync failed - keeping queue for retry', {
                        batchId,
                        error: error.message,
                        queueSize: this.tempQueue.length
                    });
                    // PHASE 2 (P0.2): Queue preserved for retry on failure
                } finally {
                    this.syncing = false;
                }
            }

            /**
             * PHASE 2 (P0.2): Generate unique batch ID for idempotency
             */
            generateBatchId() {
                // Use timestamp + random for uniqueness
                const timestamp = Date.now();
                const random = Math.random().toString(36).substring(2, 15);
                const deviceId = this.connection?.config?.deviceId || 'unknown';
                return `${deviceId}-${timestamp}-${random}`;
            }

            /**
             * PHASE 2 (P0.2): Wait for batch:ack WebSocket event
             * Returns Promise that resolves when ACK received, rejects on timeout
             */
            waitForBatchAck(batchId, timeout = 60000) {
                return new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        // Remove listener on timeout
                        if (this.connection?.socket) {
                            this.connection.socket.off('batch:ack', handler);
                        }
                        reject(new Error(`Batch ACK timeout after ${timeout}ms: ${batchId}`));
                    }, timeout);

                    const handler = (eventData) => {
                        // Extract payload from wrapped event (AsyncAPI envelope)
                        const payload = eventData.data || eventData;

                        if (payload.batchId === batchId) {
                            clearTimeout(timer);
                            // Remove this specific listener
                            if (this.connection?.socket) {
                                this.connection.socket.off('batch:ack', handler);
                            }
                            Debug.log('Received batch:ack from server', {
                                batchId: payload.batchId,
                                count: payload.count
                            });
                            resolve(payload);
                        }
                        // If batchId doesn't match, keep listening (might be from another device)
                    };

                    // Register listener for batch:ack
                    if (this.connection?.socket) {
                        this.connection.socket.on('batch:ack', handler);
                    } else {
                        clearTimeout(timer);
                        reject(new Error('No socket connection available'));
                    }
                });
            }

            /**
             * Save queue to localStorage
             */
            saveQueue() {
                try {
                    if (this.tempQueue.length > 0) {
                        localStorage.setItem('networkedTempQueue', JSON.stringify(this.tempQueue));
                    } else {
                        localStorage.removeItem('networkedTempQueue');
                    }
                } catch (error) {
                    // Handle QuotaExceededError or other storage errors
                    if (error.name === 'QuotaExceededError') {
                        Debug.error('localStorage quota exceeded - unable to save queue', {
                            queueSize: this.tempQueue.length,
                            error: error.message
                        });
                        // Attempt to clear oldest items or notify user
                        alert('Storage full: Unable to queue transactions offline. Please sync or clear data.');
                    } else {
                        Debug.error('Failed to save queue to localStorage', error);
                    }
                }
            }

            /**
             * Load queue from localStorage
             */
            loadQueue() {
                try {
                    const saved = localStorage.getItem('networkedTempQueue');
                    if (saved) {
                        this.tempQueue = JSON.parse(saved);
                        Debug.log('Loaded queued transactions', { count: this.tempQueue.length });
                    }
                } catch (error) {
                    Debug.error('Failed to load queue', error);
                    this.tempQueue = [];
                }
            }

            /**
             * Clear the queue (only after successful sync)
             */
            clearQueue() {
                this.tempQueue = [];
                localStorage.removeItem('networkedTempQueue');
                Debug.log('Queue cleared');
            }

            /**
             * Get queue status
             */
            getStatus() {
                return {
                    queuedCount: this.tempQueue.length,
                    syncing: this.syncing
                };
            }
        }

// Export for Node.js testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NetworkedQueueManager;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.NetworkedQueueManager = NetworkedQueueManager;
}
