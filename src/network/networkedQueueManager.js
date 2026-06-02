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
  }

  /**
   * Queue a transaction for submission
   * @param {Object} transaction - Transaction to queue
   * @emits queue:changed - Queue status updated
   */
  queueTransaction(transaction) {
    // Stamp a per-submission correlation id so results/replays match unambiguously
    // (tokenId+teamId aliases across concurrent submissions). TQ-3.
    const clientTxId = transaction.clientTxId
      || `${this.deviceId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const tx = { ...transaction, clientTxId };

    // ALWAYS persist first (durability) — even on the connected path. A scan
    // emitted during the reconnect window (isConnected still true but the socket
    // dropping) would otherwise be fire-and-forget and permanently lost; now it
    // survives as a persisted entry and is retried by syncQueue on reconnect. TQ-1.
    this.tempQueue.push(tx);
    this.saveQueue();
    this.dispatchEvent(new CustomEvent('queue:changed', {
      detail: this.getStatus()
    }));

    if (this.client && this.client.isConnected) {
      // Connected: submit now and remove only on a definitive result. A fresh
      // connected scan is submitted immediately here; offline-enqueued entries are
      // flushed by syncQueue() on reconnect. No overlap for a given entry —
      // syncQueue processes only the entries present at its start, and this one is
      // already in-flight via _submitDurable.
      this._submitDurable(tx);
    } else {
      this.debug.log('Transaction queued (offline)', {
        tokenId: tx.tokenId,
        clientTxId,
        queueSize: this.tempQueue.length
      });
    }
    return clientTxId;
  }

  /**
   * Submit a persisted transaction and remove it only on a definitive result
   * (accepted/duplicate/rejected/error). Transient failures (timeout/connection
   * error) and 'queued' leave it persisted for the next syncQueue. TQ-1/TQ-2.
   * @private
   */
  _submitDurable(tx) {
    this.replayTransaction(tx)
      .then((result) => {
        const status = result?.status;
        if (status === 'accepted' || status === 'duplicate' ||
            status === 'rejected' || status === 'error') {
          this._removeByClientTxId(tx.clientTxId);
          if (status === 'rejected' || status === 'error') {
            this.dispatchEvent(new CustomEvent('transaction:failed', {
              detail: { transaction: tx, status, message: result?.message }
            }));
          }
        }
        // queued/unknown: leave persisted for the next reconnect
      })
      .catch((err) => {
        // timeout / connection error: leave persisted; syncQueue retries on reconnect
        this.debug.error?.('Durable submit failed - keeping for retry', {
          tokenId: tx.tokenId,
          error: err.message
        });
      });
  }

  /**
   * Remove a persisted entry by its correlation id after a definitive result.
   * @private
   */
  _removeByClientTxId(clientTxId) {
    const before = this.tempQueue.length;
    this.tempQueue = this.tempQueue.filter(t => t.clientTxId !== clientTxId);
    if (this.tempQueue.length !== before) {
      this.saveQueue();
      this.dispatchEvent(new CustomEvent('queue:changed', {
        detail: this.getStatus()
      }));
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
      // Replay each transaction via WebSocket (transaction:submit). Branch on the
      // backend's actual result status: accepted/duplicate -> done (remove);
      // rejected/error -> permanent failure (surface via transaction:failed, then
      // remove — no infinite retry of an invalid tx); queued/timeout/connection-
      // error -> keep for the next reconnect (TQ-2). Replaced the old behavior
      // that cleared the WHOLE queue unconditionally (silently lost failures).
      const survivors = [];
      for (let i = 0; i < batch.length; i++) {
        const transaction = batch[i];

        this.debug.log(`Replaying transaction ${i + 1}/${batch.length}`, {
          tokenId: transaction.tokenId,
          clientTxId: transaction.clientTxId
        });

        try {
          // Replay via WebSocket (same path as live scans)
          const result = await this.replayTransaction(transaction);
          const status = result?.status;
          if (status === 'accepted' || status === 'duplicate') {
            results.push({ success: true, transaction, result });
            // durable result — removed (not pushed to survivors)
          } else if (status === 'rejected' || status === 'error') {
            // Permanent failure: do NOT silently drop — surface, then remove.
            this.debug.error?.('Transaction permanently rejected', {
              tokenId: transaction.tokenId,
              clientTxId: transaction.clientTxId,
              status,
              message: result?.message
            });
            this.dispatchEvent(new CustomEvent('transaction:failed', {
              detail: { transaction, status, message: result?.message }
            }));
            results.push({ success: false, transaction, result });
          } else {
            // queued or unknown transient: keep for next reconnect
            survivors.push(transaction);
            results.push({ success: false, transaction, result });
          }
        } catch (error) {
          // Timeout / connection error: keep for next reconnect (TQ-2)
          this.debug.error?.('Transaction replay failed', {
            tokenId: transaction.tokenId,
            error: error.message
          });

          survivors.push(transaction);
          results.push({ success: false, transaction, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;

      this.debug.log('Queue sync complete', {
        total: batch.length,
        success: successCount,
        failed: results.length - successCount,
        kept: survivors.length
      });

      // Keep only transient/queued survivors for the next reconnect
      this.tempQueue = survivors;
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

        // Backend validation/QUEUE_FULL errors arrive as 'error', NOT
        // transaction:result. Match by correlation id when available so a
        // rejected tx fails fast instead of hanging the full 30s timeout (TQ-2/CC-4).
        if (type === 'error') {
          if (!transaction.clientTxId || payload.clientTxId === transaction.clientTxId) {
            cleanup(timeout, handler);
            const err = new Error(payload.message || 'Transaction failed');
            err.code = payload.code;
            reject(err);
          }
          return;
        }

        // Only process transaction:result events
        if (type !== 'transaction:result') return;

        // Match by clientTxId when present (unambiguous across concurrent
        // submissions), else fall back to tokenId+teamId.
        const matches = transaction.clientTxId
          ? payload.clientTxId === transaction.clientTxId
          : (payload.tokenId === transaction.tokenId &&
             payload.teamId === transaction.teamId);

        if (matches) {
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
