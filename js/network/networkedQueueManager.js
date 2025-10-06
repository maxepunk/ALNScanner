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
             */
            async syncQueue() {
                if (this.syncing || this.tempQueue.length === 0 || !this.connection || !this.connection.socket?.connected) {
                    return;
                }

                this.syncing = true;
                Debug.log('Starting queue sync', { queueSize: this.tempQueue.length });

                // Send all queued transactions
                for (const transaction of this.tempQueue) {
                    // Wrap per AsyncAPI contract: {event, data, timestamp}
                    this.connection.socket.emit('transaction:submit', {
                        event: 'transaction:submit',
                        data: transaction,
                        timestamp: new Date().toISOString()
                    });
                }

                Debug.log('Queue sync complete - sent all transactions', {
                    count: this.tempQueue.length
                });

                // Clear queue after sending (backend handles duplicates)
                this.tempQueue = [];
                this.saveQueue();

                this.syncing = false;
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
