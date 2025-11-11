/**
 * NetworkedQueueManager - Offline Transaction Queue Manager
 * ES6 Module - Browser Only
 *
 * Responsibilities:
 * - Offline transaction queue (localStorage persistence)
 * - Auto-sync on reconnect
 * - Queue management (add, retry, clear)
 * - Transaction replay via WebSocket for proper scoring
 *
 * Does NOT handle:
 * - WebSocket connection (OrchestratorClient)
 * - Event emission (managed by NetworkedSession)
 * - Transaction processing (backend)
 */

import OrchestratorClient from './orchestratorClient.js';

export class NetworkedQueueManager extends EventTarget {
  constructor(config = {}) {
    super();

    this.client = config.client; // OrchestratorClient instance (dependency injection)
    this.debug = config.debug || console; // Debug utility (dependency injection)
    this.deviceId = config.deviceId || 'GM_STATION_UNKNOWN';

    this.tempQueue = [];
    this.syncing = false;
    this.activeHandlers = new Map(); // Track active replay handlers for cleanup

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
          this.debug.log('Merging orphaned transactions', { count: orphaned.length });

          // Add to main queue
          this.tempQueue.push(...orphaned);

          // Clear fallback queue
          localStorage.removeItem('pendingNetworkedTransactions');

          // Save merged queue
          this.saveQueue();

          this.debug.log('Orphaned transactions merged successfully', {
            totalQueueSize: this.tempQueue.length
          });
        }
      }
    } catch (error) {
      this.debug.error?.('Failed to merge orphaned transactions', error);
    }
  }

  /**
   * Queue a transaction for submission
   * @param {Object} transaction - Transaction to queue
   * @emits queue:changed - Queue status updated
   */
  queueTransaction(transaction) {
    // Check if we have a connection and it's connected
    if (!this.client || !this.client.isConnected) {
      // Not connected - add to temp queue
      this.tempQueue.push(transaction);
      this.saveQueue();
      this.debug.log('Transaction queued for later submission', {
        tokenId: transaction.tokenId,
        queueSize: this.tempQueue.length
      });

      // Emit event for UI updates (event-driven, no polling needed)
      this.dispatchEvent(new CustomEvent('queue:changed', {
        detail: this.getStatus()
      }));
    } else {
      // Connected - send immediately via OrchestratorClient
      this.client.send('transaction:submit', transaction);

      this.debug.log('Transaction sent immediately', {
        tokenId: transaction.tokenId
      });
    }
  }

  /**
   * Sync queued transactions when connection restored
   * Replays each transaction via WebSocket for proper scoring/game mechanics
   *
   * NOTE: GM offline scans MUST use transaction:submit (not batch endpoint)
   * Batch endpoint has NO SCORING OR GAME MECHANICS (player-only)
   * Replay ensures duplicate detection, scoring, bonuses all work correctly
   *
   * @returns {Promise<void>}
   */
  async syncQueue() {
    if (this.syncing || this.tempQueue.length === 0 || !this.client || !this.client.isConnected) {
      return;
    }

    this.syncing = true;
    this.debug.log('Starting queue sync via WebSocket replay', { queueSize: this.tempQueue.length });

    const batch = [...this.tempQueue]; // Copy for sending
    const results = [];

    try {
      // Replay each transaction via WebSocket (transaction:submit)
      // This ensures proper scoring, duplicate detection, and game mechanics
      for (let i = 0; i < batch.length; i++) {
        const transaction = batch[i];

        this.debug.log(`Replaying transaction ${i + 1}/${batch.length}`, {
          tokenId: transaction.tokenId,
          teamId: transaction.teamId
        });

        try {
          // Replay via WebSocket (same path as live scans)
          const result = await this.replayTransaction(transaction);
          results.push({ success: true, transaction, result });
        } catch (error) {
          // Categorize error type for future retry logic (case-insensitive)
          let errorType = 'unknown';
          const message = error.message.toLowerCase();
          if (message.includes('timeout')) {
            errorType = 'timeout';
          } else if (message.includes('validation') || message.includes('invalid')) {
            errorType = 'validation';
          } else if (message.includes('network') || message.includes('connection')) {
            errorType = 'network';
          }

          this.debug.error?.(`Transaction replay failed (${errorType})`, {
            tokenId: transaction.tokenId,
            error: error.message,
            errorType: errorType
          });

          results.push({
            success: false,
            transaction,
            error: error.message,
            errorType: errorType  // Enables future retry logic per error type
          });
        }
      }

      // Summary with error type breakdown
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      const errorTypes = results
        .filter(r => !r.success)
        .reduce((acc, r) => {
          acc[r.errorType] = (acc[r.errorType] || 0) + 1;
          return acc;
        }, {});

      this.debug.log('Queue sync complete', {
        total: batch.length,
        success: successCount,
        failed: failCount,
        errorBreakdown: errorTypes  // e.g., { timeout: 2, validation: 1 }
      });

      // Clear queue after ALL transactions processed (even if some failed)
      // Failed transactions are lost but logged - operator can manually re-scan
      // This prevents infinite retry loops for permanently invalid transactions
      this.tempQueue = [];
      this.saveQueue();

    } catch (error) {
      this.debug.error?.('Queue sync failed - keeping queue for retry', {
        error: error.message,
        queueSize: this.tempQueue.length
      });
      // Queue preserved for retry on failure
    } finally {
      this.syncing = false;

      // Emit event to update UI AFTER syncing flag is reset
      this.dispatchEvent(new CustomEvent('queue:changed', {
        detail: this.getStatus()
      }));
    }
  }

  /**
   * Replay a single transaction via WebSocket
   * Returns Promise that resolves with result or rejects on error/timeout
   *
   * @param {Object} transaction - Transaction to replay
   * @returns {Promise<Object>} - Transaction result
   * @private
   */
  replayTransaction(transaction) {
    return new Promise((resolve, reject) => {
      const handlerKey = `${transaction.tokenId}-${transaction.teamId}`;

      // Helper to cleanup handler and timeout
      const cleanup = (timeout, handler) => {
        clearTimeout(timeout);
        this.client.removeEventListener('message:received', handler);
        this.activeHandlers.delete(handlerKey);
      };

      const timeout = setTimeout(() => {
        const handler = this.activeHandlers.get(handlerKey);
        if (handler) {
          cleanup(timeout, handler);
        }
        reject(new Error(`Transaction replay timeout after 30s: ${transaction.tokenId}`));
      }, 30000);

      const handler = (event) => {
        const { type, payload } = event.detail;

        // Only process transaction:result events
        if (type !== 'transaction:result') return;

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

      // Track handler for cleanup
      this.activeHandlers.set(handlerKey, handler);

      // Register listener for transaction:result (via OrchestratorClient's message:received)
      this.client.addEventListener('message:received', handler);

      // Send transaction via OrchestratorClient
      this.client.send('transaction:submit', transaction);

      this.debug.log('Transaction submitted for replay', {
        tokenId: transaction.tokenId,
        teamId: transaction.teamId
      });
    });
  }

  /**
   * Generate unique batch ID for idempotency
   * @returns {string} Unique batch ID
   * @private
   */
  generateBatchId() {
    // Use timestamp + random for uniqueness
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${this.deviceId}-${timestamp}-${random}`;
  }

  /**
   * Wait for batch:ack WebSocket event
   * Returns Promise that resolves when ACK received, rejects on timeout
   *
   * @param {string} batchId - Batch ID to wait for
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} - Batch ACK payload
   * @private
   */
  waitForBatchAck(batchId, timeout = 60000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove listener on timeout
        this.client.removeEventListener('message:received', handler);
        reject(new Error(`Batch ACK timeout after ${timeout}ms: ${batchId}`));
      }, timeout);

      const handler = (event) => {
        const { type, payload } = event.detail;

        // Only process batch:ack events
        if (type !== 'batch:ack') return;

        if (payload.batchId === batchId) {
          clearTimeout(timer);
          // Remove this specific listener
          this.client.removeEventListener('message:received', handler);
          this.debug.log('Received batch:ack from server', {
            batchId: payload.batchId,
            count: payload.count
          });
          resolve(payload);
        }
        // If batchId doesn't match, keep listening (might be from another device)
      };

      // Register listener for batch:ack
      this.client.addEventListener('message:received', handler);
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
        this.debug.error?.('localStorage quota exceeded - unable to save queue', {
          queueSize: this.tempQueue.length,
          error: error.message
        });
        // Attempt to clear oldest items or notify user
        alert('Storage full: Unable to queue transactions offline. Please sync or clear data.');
      } else {
        this.debug.error?.('Failed to save queue to localStorage', error);
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
        this.debug.log('Loaded queued transactions', { count: this.tempQueue.length });
      }
    } catch (error) {
      this.debug.error?.('Failed to load queue', error);
      this.tempQueue = [];
    }
  }

  /**
   * Clear the queue (only after successful sync)
   */
  clearQueue() {
    this.tempQueue = [];
    localStorage.removeItem('networkedTempQueue');
    this.debug.log('Queue cleared');
  }

  /**
   * Get queue status
   * @returns {Object} Queue status { queuedCount, syncing }
   */
  getStatus() {
    return {
      queuedCount: this.tempQueue.length,
      syncing: this.syncing
    };
  }

  /**
   * Cleanup handlers (call on destroy)
   */
  destroy() {
    // Clear all active handlers
    for (const [key, handler] of this.activeHandlers.entries()) {
      this.client.removeEventListener('message:received', handler);
    }
    this.activeHandlers.clear();

    // Remove all event listeners
    this.client = null;
  }
}

// Default export for convenience
export default NetworkedQueueManager;
