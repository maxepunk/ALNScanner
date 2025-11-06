        /**
         * NetworkedQueueManager - Handles offline transaction queueing
         * Extends EventTarget for event-driven queue status updates
         *
         * Events:
         * - 'queue:changed' - Fired when queue count changes (detail contains status)
         */
        class NetworkedQueueManager extends EventTarget {
            constructor(connection) {
                super();  // Initialize EventTarget
                this.connection = connection;
                this.tempQueue = [];
                this.syncing = false;
                this.activeHandlers = new Map();  // FIX: Track active replay handlers for cleanup

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

                    // Emit event for UI updates (event-driven, no polling needed)
                    const event = new Event('queue:changed');
                    event.detail = this.getStatus();
                    this.dispatchEvent(event);
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
             * BUG #4 FIX: Replay via WebSocket for proper scoring/game mechanics
             * - GM offline scans MUST use transaction:submit (not batch endpoint)
             * - Batch endpoint has NO SCORING OR GAME MECHANICS (player-only)
             * - Replay ensures duplicate detection, scoring, bonuses all work correctly
             */
            async syncQueue() {
                if (this.syncing || this.tempQueue.length === 0 || !this.connection || !this.connection.socket?.connected) {
                    return;
                }

                this.syncing = true;
                Debug.log('Starting queue sync via WebSocket replay', { queueSize: this.tempQueue.length });

                const batch = [...this.tempQueue]; // Copy for sending
                const results = [];

                try {
                    // BUG #4 FIX: Replay each transaction via WebSocket (transaction:submit)
                    // This ensures proper scoring, duplicate detection, and game mechanics
                    for (let i = 0; i < batch.length; i++) {
                        const transaction = batch[i];

                        Debug.log(`Replaying transaction ${i + 1}/${batch.length}`, {
                            tokenId: transaction.tokenId,
                            teamId: transaction.teamId
                        });

                        try {
                            // Replay via WebSocket (same path as live scans)
                            const result = await this.replayTransaction(transaction);
                            results.push({ success: true, transaction, result });
                        } catch (error) {
                            Debug.error(`Transaction replay failed`, {
                                tokenId: transaction.tokenId,
                                error: error.message
                            });
                            results.push({ success: false, transaction, error: error.message });
                        }
                    }

                    // Summary
                    const successCount = results.filter(r => r.success).length;
                    const failCount = results.filter(r => !r.success).length;

                    Debug.log('Queue sync complete', {
                        total: batch.length,
                        success: successCount,
                        failed: failCount
                    });

                    // Clear queue after ALL transactions processed (even if some failed)
                    // Failed transactions are lost but logged - operator can manually re-scan
                    // This prevents infinite retry loops for permanently invalid transactions
                    this.tempQueue = [];
                    this.saveQueue();

                    // Emit event to update UI
                    const event = new Event('queue:changed');
                    event.detail = this.getStatus();
                    this.dispatchEvent(event);

                } catch (error) {
                    Debug.error('Queue sync failed - keeping queue for retry', {
                        error: error.message,
                        queueSize: this.tempQueue.length
                    });
                    // Queue preserved for retry on failure
                } finally {
                    this.syncing = false;
                }
            }

            /**
             * BUG #4 FIX: Replay a single transaction via WebSocket
             * Returns Promise that resolves with result or rejects on error/timeout
             *
             * BUG #3 FIX: Track active handlers in Map for proper cleanup
             */
            replayTransaction(transaction) {
                return new Promise((resolve, reject) => {
                    const handlerKey = `${transaction.tokenId}-${transaction.teamId}`;

                    // Helper to cleanup handler and timeout
                    const cleanup = (timeout, handler) => {
                        clearTimeout(timeout);
                        this.connection.socket.off('transaction:result', handler);
                        this.activeHandlers.delete(handlerKey);
                    };

                    const timeout = setTimeout(() => {
                        const handler = this.activeHandlers.get(handlerKey);
                        if (handler) {
                            cleanup(timeout, handler);
                        }
                        reject(new Error(`Transaction replay timeout after 30s: ${transaction.tokenId}`));
                    }, 30000);

                    const handler = (eventData) => {
                        // Extract payload from wrapped event (AsyncAPI envelope)
                        const payload = eventData.data || eventData;

                        // Check if this result matches our transaction
                        // (tokenId + teamId should be unique enough for matching)
                        if (payload.tokenId === transaction.tokenId &&
                            payload.teamId === transaction.teamId) {
                            cleanup(timeout, handler);

                            if (payload.status === 'error') {
                                reject(new Error(payload.message || 'Transaction failed'));
                            } else {
                                resolve(payload);
                            }
                        }
                        // If doesn't match, keep listening (might be from another concurrent scan)
                    };

                    // Track handler for cleanup (BUG #3 FIX)
                    this.activeHandlers.set(handlerKey, handler);

                    // Register listener for transaction:result
                    this.connection.socket.on('transaction:result', handler);

                    // Send transaction via WebSocket (AsyncAPI envelope)
                    this.connection.socket.emit('transaction:submit', {
                        event: 'transaction:submit',
                        data: transaction,
                        timestamp: new Date().toISOString()
                    });

                    Debug.log('Transaction submitted for replay', {
                        tokenId: transaction.tokenId,
                        teamId: transaction.teamId
                    });
                });
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
