# PR #2 Code Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address all critical and medium priority issues identified in PR #2 code review before merging to production.

**Architecture:** Fix memory leaks in WebSocket event handlers, convert polling to event-driven architecture, resolve race conditions in state synchronization, and improve error handling and code maintainability.

**Tech Stack:** Vanilla JavaScript (ES6+), Socket.io, DOM APIs, CSS3

---

## Task 1: Fix Event Listener Leak in replayTransaction()

**Priority:** 🚨 HIGH (BLOCKING)

**Files:**
- Modify: `js/network/networkedQueueManager.js:149-204`
- Test: `tests/unit/networkedQueueManager.test.js` (new file)

**Problem:** Event listeners accumulate without cleanup when transactions timeout or fail to match, causing memory leaks during queue sync operations.

**Step 1: Write failing test for event listener cleanup**

Create: `tests/unit/networkedQueueManager.test.js`

```javascript
/**
 * Unit tests for NetworkedQueueManager
 * Tests critical memory leak and error handling scenarios
 */

describe('NetworkedQueueManager', () => {
    let manager;
    let mockConnection;
    let eventListeners;

    beforeEach(() => {
        // Track event listeners for leak detection
        eventListeners = new Map();

        mockConnection = {
            socket: {
                on: jest.fn((event, handler) => {
                    if (!eventListeners.has(event)) {
                        eventListeners.set(event, []);
                    }
                    eventListeners.get(event).push(handler);
                }),
                off: jest.fn((event, handler) => {
                    if (eventListeners.has(event)) {
                        const handlers = eventListeners.get(event);
                        const index = handlers.indexOf(handler);
                        if (index > -1) {
                            handlers.splice(index, 1);
                        }
                    }
                }),
                emit: jest.fn(),
                connected: true
            },
            config: { url: 'https://test:3000' }
        };

        // Mock localStorage
        global.localStorage = {
            getItem: jest.fn(() => '[]'),
            setItem: jest.fn()
        };
    });

    afterEach(() => {
        eventListeners.clear();
    });

    test('replayTransaction cleans up event listener on timeout', async () => {
        // This test should FAIL initially - manager doesn't clean up listeners
        const transaction = { tokenId: 'test1', teamId: '001' };

        // Trigger timeout by not emitting response
        await expect(manager.replayTransaction(transaction))
            .rejects.toThrow('timeout');

        // Verify listener was removed after timeout
        const handlers = eventListeners.get('transaction:result') || [];
        expect(handlers.length).toBe(0); // Should have no lingering handlers
    });

    test('replayTransaction cleans up event listener on success', async () => {
        const transaction = { tokenId: 'test2', teamId: '002' };

        // Simulate success response after 100ms
        setTimeout(() => {
            const handlers = eventListeners.get('transaction:result') || [];
            handlers.forEach(h => h({
                data: {
                    tokenId: 'test2',
                    teamId: '002',
                    status: 'accepted'
                }
            }));
        }, 100);

        await manager.replayTransaction(transaction);

        // Verify listener was removed after success
        const handlers = eventListeners.get('transaction:result') || [];
        expect(handlers.length).toBe(0);
    });

    test('concurrent replays do not accumulate listeners', async () => {
        const transactions = [
            { tokenId: 'test3', teamId: '003' },
            { tokenId: 'test4', teamId: '004' },
            { tokenId: 'test5', teamId: '005' }
        ];

        // Start all replays concurrently (simulating queue sync)
        const promises = transactions.map(tx =>
            manager.replayTransaction(tx).catch(() => {}) // Ignore errors
        );

        // Wait 100ms then check listener count
        await new Promise(resolve => setTimeout(resolve, 100));
        const handlers = eventListeners.get('transaction:result') || [];

        // Should have exactly 3 active handlers (one per transaction)
        // NOT accumulating extras from failed matches
        expect(handlers.length).toBe(3);

        // Clean up
        await Promise.allSettled(promises);
    });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- networkedQueueManager
```

Expected: FAIL with "Cannot read property 'replayTransaction' of undefined" or similar

**Step 3: Implement activeHandlers tracking in NetworkedQueueManager**

Modify: `js/network/networkedQueueManager.js:20` (in constructor)

```javascript
constructor(connection) {
    this.connection = connection;
    this.tempQueue = [];
    this.syncing = false;
    this.batchAckCallbacks = new Map(); // PHASE 2 (P0.2)
    this.activeHandlers = new Map();  // FIX: Track active replay handlers for cleanup
    this.loadQueue();
}
```

**Step 4: Refactor replayTransaction() with proper cleanup**

Replace: `js/network/networkedQueueManager.js:149-204`

```javascript
/**
 * BUG #4 FIX: Replay a single transaction via WebSocket
 * Returns Promise that resolves with result or rejects on error/timeout
 *
 * CRITICAL: Properly cleans up event listeners to prevent memory leaks
 */
replayTransaction(transaction) {
    return new Promise((resolve, reject) => {
        // Generate unique handler ID for tracking
        const handlerId = `${transaction.tokenId}-${transaction.teamId}-${Date.now()}`;

        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error(`Transaction replay timeout after 30s: ${transaction.tokenId}`));
        }, 30000);

        const handler = (eventData) => {
            // Extract payload from wrapped event (AsyncAPI envelope)
            const payload = eventData.data || eventData;

            // Check if this result matches our transaction
            // (tokenId + teamId should be unique enough for matching)
            if (payload.tokenId === transaction.tokenId &&
                payload.teamId === transaction.teamId) {
                cleanup();

                if (payload.status === 'error') {
                    reject(new Error(payload.message || 'Transaction failed'));
                } else {
                    resolve(payload);
                }
            }
            // If doesn't match, keep listening (might be from another concurrent scan)
        };

        // Cleanup function: Remove listener and tracking entries
        const cleanup = () => {
            clearTimeout(timeout);
            if (this.activeHandlers.has(handlerId)) {
                const storedHandler = this.activeHandlers.get(handlerId);
                this.connection.socket.off('transaction:result', storedHandler);
                this.activeHandlers.delete(handlerId);
            }
        };

        // Register listener and track it
        this.activeHandlers.set(handlerId, handler);
        this.connection.socket.on('transaction:result', handler);

        // Send transaction via WebSocket (AsyncAPI envelope)
        this.connection.socket.emit('transaction:submit', {
            event: 'transaction:submit',
            data: transaction,
            timestamp: new Date().toISOString()
        });

        Debug.log('Transaction submitted for replay', {
            tokenId: transaction.tokenId,
            teamId: transaction.teamId,
            handlerId: handlerId
        });
    });
}
```

**Step 5: Run tests to verify they pass**

```bash
npm test -- networkedQueueManager
```

Expected: PASS (all 3 tests green)

**Step 6: Commit**

```bash
git add js/network/networkedQueueManager.js tests/unit/networkedQueueManager.test.js
git commit -m "fix: prevent event listener leak in replayTransaction()

- Add activeHandlers Map to track replay event listeners
- Implement cleanup() helper to remove listeners on success/timeout
- Add unit tests for listener cleanup in all scenarios
- Prevents memory leak during offline queue sync operations

Fixes memory leak identified in PR #2 code review"
```

---

## Task 2: Convert Queue Indicator from Polling to Event-Driven

**Priority:** ⚠️ MEDIUM

**Files:**
- Modify: `js/network/networkedQueueManager.js:35-45`
- Modify: `index.html:2218-2252`
- Test: `tests/integration/queueIndicator.test.js` (new file)

**Problem:** 1-second polling interval is aggressive and wastes CPU cycles. Event-driven approach is more efficient.

**Step 1: Write failing integration test for event-driven updates**

Create: `tests/integration/queueIndicator.test.js`

```javascript
/**
 * Integration tests for queue indicator UI
 * Tests event-driven updates without polling
 */

describe('Queue Indicator', () => {
    let manager;
    let indicatorElement;
    let countElement;

    beforeEach(() => {
        // Setup DOM
        document.body.innerHTML = `
            <div id="queueStatusIndicator" class="queue-indicator">
                <span class="queue-icon">📤</span>
                <span class="queue-count" id="queueCount">0</span>
                <span>queued</span>
            </div>
        `;

        indicatorElement = document.getElementById('queueStatusIndicator');
        countElement = document.getElementById('queueCount');

        // Mock connection
        const mockConnection = {
            socket: { on: jest.fn(), off: jest.fn(), emit: jest.fn(), connected: false },
            config: { url: 'https://test:3000' }
        };

        manager = new NetworkedQueueManager(mockConnection);
    });

    test('indicator updates immediately when transaction queued', () => {
        // Should FAIL initially - no event emission exists

        // Listen for queue change event
        let eventFired = false;
        manager.on('queue:changed', () => {
            eventFired = true;
        });

        // Queue a transaction
        manager.queueTransaction({
            tokenId: 'test1',
            teamId: '001'
        });

        // Event should fire immediately (no polling delay)
        expect(eventFired).toBe(true);
    });

    test('indicator hides when queue empties', async () => {
        // Queue transaction
        manager.queueTransaction({ tokenId: 'test1', teamId: '001' });

        // Manually trigger UI update (simulating event handler)
        updateQueueIndicator();
        expect(indicatorElement.classList.contains('visible')).toBe(true);

        // Clear queue
        manager.tempQueue = [];
        manager.saveQueue();
        manager.emit('queue:changed', manager.getStatus());

        // Update UI
        updateQueueIndicator();
        expect(indicatorElement.classList.contains('visible')).toBe(false);
    });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- queueIndicator
```

Expected: FAIL with "manager.on is not a function" or "eventFired is false"

**Step 3: Make NetworkedQueueManager extend EventTarget**

Modify: `js/network/networkedQueueManager.js:15-25`

```javascript
/**
 * NetworkedQueueManager - Handles offline transaction queueing
 * Extends EventTarget for event-driven queue status updates
 *
 * Events:
 * - 'queue:changed' - Fired when queue count changes
 */
class NetworkedQueueManager extends EventTarget {
    constructor(connection) {
        super();  // Initialize EventTarget
        this.connection = connection;
        this.tempQueue = [];
        this.syncing = false;
        this.batchAckCallbacks = new Map();
        this.activeHandlers = new Map();
        this.loadQueue();
    }
```

**Step 4: Emit queue:changed events in queueTransaction() and syncQueue()**

Modify: `js/network/networkedQueueManager.js:60-75` (in queueTransaction)

```javascript
queueTransaction(transaction) {
    this.tempQueue.push(transaction);
    this.saveQueue();
    Debug.log('Transaction queued for offline sync', {
        tokenId: transaction.tokenId,
        queueSize: this.tempQueue.length
    });

    // Emit event for UI updates (event-driven, no polling needed)
    this.dispatchEvent(new CustomEvent('queue:changed', {
        detail: this.getStatus()
    }));

    // Auto-sync if connection available
    if (this.connection && this.connection.socket?.connected) {
        this.syncQueue();
    }
}
```

Modify: `js/network/networkedQueueManager.js:135-145` (after queue clear in syncQueue)

```javascript
// Clear queue after ALL transactions processed (even if some failed)
this.tempQueue = [];
this.saveQueue();

// Emit event to update UI
this.dispatchEvent(new CustomEvent('queue:changed', {
    detail: this.getStatus()
}));
```

**Step 5: Replace polling with event listener in HTML**

Replace: `index.html:2218-2252`

```html
    <!-- P2.2.3: Queue Status Indicator Update Logic (Event-Driven) -->
    <script>
        /**
         * Update the queue status indicator with current queue count
         * P2.2.3: Event-driven updates (no polling)
         */
        function updateQueueIndicator() {
            const indicator = document.getElementById('queueStatusIndicator');
            const countSpan = document.getElementById('queueCount');

            if (!indicator || !countSpan) return;

            // Get queue count from NetworkedQueueManager
            const queueStatus = window.queueManager?.getStatus();
            const queueCount = queueStatus ? queueStatus.queuedCount : 0;

            // Update count display
            countSpan.textContent = queueCount;

            // Show/hide indicator based on queue count
            if (queueCount > 0) {
                indicator.classList.add('visible');
            } else {
                indicator.classList.remove('visible');
            }
        }

        // Event-driven updates: Listen to queue changes
        window.addEventListener('DOMContentLoaded', () => {
            updateQueueIndicator(); // Initial update

            // Register event listener for queue changes (no polling)
            if (window.queueManager) {
                window.queueManager.addEventListener('queue:changed', (event) => {
                    console.log('Queue changed:', event.detail);
                    updateQueueIndicator();
                });
            }
        });
    </script>

    <!-- P2.2.3: Queue Status Indicator -->
    <div id="queueStatusIndicator" class="queue-indicator" title="Offline scans queued for upload">
        <span class="queue-icon">📤</span>
        <span class="queue-count" id="queueCount">0</span>
        <span>queued</span>
    </div>
```

**Step 6: Run tests to verify they pass**

```bash
npm test -- queueIndicator
```

Expected: PASS

**Step 7: Manual verification**

1. Open scanner in browser console
2. Execute: `window.queueManager.queueTransaction({tokenId:'test',teamId:'001'})`
3. Verify indicator appears IMMEDIATELY (no 1-second delay)
4. Execute: `window.queueManager.tempQueue = []; window.queueManager.dispatchEvent(new CustomEvent('queue:changed'))`
5. Verify indicator disappears IMMEDIATELY

**Step 8: Commit**

```bash
git add js/network/networkedQueueManager.js index.html tests/integration/queueIndicator.test.js
git commit -m "refactor: convert queue indicator from polling to events

- NetworkedQueueManager now extends EventTarget
- Emit 'queue:changed' event on queue modifications
- Replace setInterval polling with event listeners
- Reduces CPU usage and improves responsiveness

Performance improvement identified in PR #2 code review"
```

---

## Task 3: Fix Race Condition in Token Restoration

**Priority:** ⚠️ MEDIUM

**Files:**
- Modify: `js/network/orchestratorClient.js:386-391`
- Test: `tests/integration/tokenRestoration.test.js` (new file)

**Problem:** If a transaction is being processed during `sync:full` reception, local `scannedTokens` could be overwritten before the new scan is added.

**Step 1: Write failing test for race condition**

Create: `tests/integration/tokenRestoration.test.js`

```javascript
/**
 * Integration tests for token restoration race condition
 * Tests merge behavior during concurrent scan and sync:full
 */

describe('Token Restoration', () => {
    let client;
    let mockSocket;

    beforeEach(() => {
        // Mock DataManager
        window.DataManager = {
            scannedTokens: new Set(['token1', 'token2']),
            saveScannedTokens: jest.fn()
        };

        // Mock socket
        mockSocket = {
            on: jest.fn(),
            off: jest.fn(),
            emit: jest.fn(),
            connected: true
        };

        client = new OrchestratorClient();
        client.socket = mockSocket;
    });

    test('sync:full merges server tokens with local scans', () => {
        // Should FAIL initially - current code replaces instead of merging

        // Simulate local scan happening
        window.DataManager.scannedTokens.add('token3');

        // Server sends sync:full with partial list (doesn't know about token3 yet)
        const syncPayload = {
            deviceScannedTokens: ['token1', 'token2', 'token4']
        };

        // Trigger sync:full handler
        const syncHandler = mockSocket.on.mock.calls.find(
            call => call[0] === 'sync:full'
        )?.[1];

        syncHandler({ data: syncPayload });

        // Should have ALL tokens (merge, not replace)
        expect(window.DataManager.scannedTokens.has('token1')).toBe(true);
        expect(window.DataManager.scannedTokens.has('token2')).toBe(true);
        expect(window.DataManager.scannedTokens.has('token3')).toBe(true); // Local scan preserved
        expect(window.DataManager.scannedTokens.has('token4')).toBe(true); // Server token added
    });

    test('sync:full validates deviceScannedTokens is an array', () => {
        // Malformed data should not crash
        const syncPayload = {
            deviceScannedTokens: null  // Invalid
        };

        const syncHandler = mockSocket.on.mock.calls.find(
            call => call[0] === 'sync:full'
        )?.[1];

        expect(() => {
            syncHandler({ data: syncPayload });
        }).not.toThrow();

        // Original tokens preserved
        expect(window.DataManager.scannedTokens.has('token1')).toBe(true);
    });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tokenRestoration
```

Expected: FAIL with "expect(received).toBe(expected)" for token3

**Step 3: Implement merge logic with validation**

Replace: `js/network/orchestratorClient.js:386-391`

```javascript
// BUG #5 FIX: Restore scanned tokens from backend for immediate duplicate detection
// CRITICAL: Merge with local tokens to prevent race condition during concurrent scans
if (window.DataManager) {
    // Validate deviceScannedTokens is an array
    if (Array.isArray(payload.deviceScannedTokens)) {
        // Get existing local tokens (may include recent scans not yet synced)
        const existingTokens = window.DataManager.scannedTokens || new Set();

        // Merge server tokens with local tokens (union)
        const serverTokens = new Set(payload.deviceScannedTokens);
        window.DataManager.scannedTokens = new Set([
            ...existingTokens,
            ...serverTokens
        ]);

        window.DataManager.saveScannedTokens();

        console.log(`Merged scanned tokens: ${existingTokens.size} local + ${serverTokens.size} server = ${window.DataManager.scannedTokens.size} total`);
    } else if (payload.deviceScannedTokens !== undefined) {
        // Log warning if field exists but is invalid
        console.warn('deviceScannedTokens is not an array:', typeof payload.deviceScannedTokens);
    }
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test -- tokenRestoration
```

Expected: PASS

**Step 5: Commit**

```bash
git add js/network/orchestratorClient.js tests/integration/tokenRestoration.test.js
git commit -m "fix: merge tokens on sync:full to prevent race condition

- Merge server tokens with local scannedTokens (union)
- Validate deviceScannedTokens is array before processing
- Prevents overwriting tokens from concurrent scans
- Log detailed merge statistics

Fixes race condition identified in PR #2 code review"
```

---

## Task 4: Improve Error Handling in Queue Sync

**Priority:** ⚠️ MEDIUM

**Files:**
- Modify: `js/network/networkedQueueManager.js:105-115`

**Problem:** Error handling doesn't differentiate error types (timeout vs validation vs network), making retry logic difficult to implement in future.

**Step 1: Add error type categorization**

Modify: `js/network/networkedQueueManager.js:105-115`

```javascript
try {
    // Replay via WebSocket (same path as live scans)
    const result = await this.replayTransaction(transaction);
    results.push({
        success: true,
        transaction,
        result
    });
} catch (error) {
    // Categorize error type for future retry logic
    let errorType = 'unknown';
    if (error.message.includes('timeout')) {
        errorType = 'timeout';
    } else if (error.message.includes('validation') || error.message.includes('invalid')) {
        errorType = 'validation';
    } else if (error.message.includes('network') || error.message.includes('connection')) {
        errorType = 'network';
    }

    Debug.error(`Transaction replay failed (${errorType})`, {
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
```

**Step 2: Update summary logging to include error type breakdown**

Modify: `js/network/networkedQueueManager.js:120-130`

```javascript
// Summary with error type breakdown
const successCount = results.filter(r => r.success).length;
const failCount = results.filter(r => !r.success).length;
const errorTypes = results
    .filter(r => !r.success)
    .reduce((acc, r) => {
        acc[r.errorType] = (acc[r.errorType] || 0) + 1;
        return acc;
    }, {});

Debug.log('Queue sync complete', {
    total: batch.length,
    success: successCount,
    failed: failCount,
    errorBreakdown: errorTypes  // e.g., { timeout: 2, validation: 1 }
});
```

**Step 3: Commit**

```bash
git add js/network/networkedQueueManager.js
git commit -m "refactor: add error type categorization in queue sync

- Categorize errors as timeout/validation/network/unknown
- Log error type breakdown in sync summary
- Enables future retry logic per error category

Code quality improvement from PR #2 code review"
```

---

## Task 5: Document Status Field Values

**Priority:** 🔵 LOW

**Files:**
- Modify: `js/core/dataManager.js:158-161`

**Problem:** Valid status values are undocumented, making maintenance difficult.

**Step 1: Add JSDoc documentation for status field**

Modify: `js/core/dataManager.js:150-165`

```javascript
/**
 * Add a transaction to the local store
 *
 * @param {Object} transaction - Transaction object
 * @param {string} transaction.rfid - RFID tag value
 * @param {string} transaction.tokenId - Token identifier
 * @param {string} transaction.teamId - Team identifier
 * @param {string} transaction.memoryType - Memory type (Personal/Business/Technical)
 * @param {number} transaction.valueRating - Star rating (1-5)
 * @param {string} [transaction.status='accepted'] - Transaction status
 *   Valid values:
 *     - 'accepted' - Transaction processed successfully
 *     - 'duplicate' - Duplicate token scan attempt
 *     - 'error' - Transaction processing failed
 *     - 'pending' - Queued for processing
 * @param {boolean} [transaction.isUnknown=false] - Whether token is unknown
 */
addTransaction(transaction) {
    // Ensure required fields
    if (!transaction.teamId || !transaction.rfid) {
        console.warn('Invalid transaction - missing required fields');
        return;
    }

    // Get token data if available
    const tokenData = window.TokenManager?.findToken(transaction.rfid);

    const tx = {
        rfid: transaction.rfid,
        tokenId: transaction.tokenId || transaction.rfid,
        teamId: transaction.teamId,
        timestamp: transaction.timestamp || new Date().toISOString(),
        memoryType: transaction.memoryType ||
                    (tokenData?.SF_MemoryType !== undefined ? tokenData.SF_MemoryType : 'UNKNOWN'),
        // Use valueRating if explicitly provided (even if 0), otherwise use token data
        valueRating: transaction.valueRating !== undefined ? transaction.valueRating :
                     (tokenData?.SF_ValueRating !== undefined ? tokenData.SF_ValueRating : 0),
        isUnknown: transaction.isUnknown !== undefined ? transaction.isUnknown : !tokenData,
        // Status field with documented valid values (see JSDoc above)
        status: transaction.status || 'accepted'
        // Note: 'synced' flag removed - NetworkedQueueManager handles sync status
    };
```

**Step 2: Commit**

```bash
git add js/core/dataManager.js
git commit -m "docs: document valid status field values

- Add comprehensive JSDoc for addTransaction method
- Document all 4 valid status values with descriptions
- Improves maintainability and developer experience

Documentation improvement from PR #2 code review"
```

---

## Task 6: Consolidate Duplicate CSS with Variables

**Priority:** 🔵 LOW

**Files:**
- Modify: `index.html:200-1373` (CSS section)

**Problem:** Duplicate-related styles are scattered and repetitive. CSS variables would improve maintainability.

**Step 1: Add CSS variables in :root**

Modify: `index.html:200-220`

```css
        /* ============================================
           ROOT VARIABLES
           ============================================ */
        :root {
            /* Color palette */
            --color-primary: #4CAF50;
            --color-secondary: #2196F3;
            --color-warning: #ffc107;
            --color-error: #ff6b6b;
            --color-background: #f5f5f5;

            /* Duplicate marker styles (P2.2.4) */
            --duplicate-bg: #fff3cd;
            --duplicate-border: var(--color-warning);
            --duplicate-badge-bg: var(--color-error);
            --duplicate-opacity: 0.7;
            --duplicate-opacity-card: 0.65;
            --duplicate-opacity-detail: 0.8;
        }
```

**Step 2: Replace duplicate-related CSS with variable references**

Replace: `index.html:750-782` (duplicate markers section)

```css
        /* P2.2.4: Duplicate markers - Consolidated with CSS variables */
        .transaction-card.duplicate {
            opacity: var(--duplicate-opacity);
            background: var(--duplicate-bg);
            border-left-color: var(--duplicate-border);
        }

        .transaction-item.duplicate {
            opacity: var(--duplicate-opacity-card);
            background: var(--duplicate-bg);
        }

        .token-detail-card.duplicate {
            border-left-color: var(--duplicate-border);
            background: var(--duplicate-bg);
            opacity: var(--duplicate-opacity-detail);
        }

        .token-detail-card.duplicate .token-detail-value {
            color: var(--duplicate-badge-bg);
        }

        .duplicate-badge {
            background: var(--duplicate-badge-bg);
            color: white;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: bold;
            margin-left: 8px;
            vertical-align: middle;
        }

        .duplicate-badge-small {
            background: var(--duplicate-badge-bg);
            color: white;
            padding: 1px 5px;
            border-radius: 3px;
            font-size: 9px;
            font-weight: bold;
            margin-left: 5px;
        }
```

**Step 3: Visual regression test**

Manual verification:
1. Open scanner in browser
2. Scan duplicate token
3. Verify all duplicate markers appear with correct styling:
   - Transaction card: yellow background, orange border, 70% opacity
   - Transaction item: yellow background, 65% opacity
   - Token detail card: yellow background, orange border, 80% opacity
   - Duplicate badges: red background, white text

**Step 4: Commit**

```bash
git add index.html
git commit -m "refactor: consolidate duplicate CSS with variables

- Add :root variables for duplicate marker styles
- Replace hardcoded colors with variable references
- Improves maintainability and theme consistency
- No visual changes (regression tested)

CSS improvement from PR #2 code review"
```

---

## Task 7: Add Unit Tests for Critical Paths

**Priority:** ⚠️ MEDIUM

**Files:**
- Create: `tests/unit/dataManager.test.js`
- Create: `tests/unit/orchestratorClient.test.js`

**Problem:** No test coverage for critical duplicate detection and state restoration logic.

**Step 1: Write tests for DataManager duplicate tracking**

Create: `tests/unit/dataManager.test.js`

```javascript
/**
 * Unit tests for DataManager
 * Tests duplicate detection and status handling
 */

describe('DataManager', () => {
    let dataManager;

    beforeEach(() => {
        // Mock localStorage
        global.localStorage = {
            getItem: jest.fn(() => '[]'),
            setItem: jest.fn()
        };

        // Mock TokenManager
        window.TokenManager = {
            findToken: jest.fn((rfid) => ({
                SF_RFID: rfid,
                SF_ValueRating: 3,
                SF_MemoryType: 'Business'
            }))
        };

        dataManager = DataManager.getInstance();
        dataManager.transactions = [];
        dataManager.scannedTokens = new Set();
    });

    test('addTransaction preserves status field', () => {
        const transaction = {
            rfid: 'test123',
            tokenId: 'test123',
            teamId: '001',
            status: 'duplicate'  // Important: preserve this
        };

        dataManager.addTransaction(transaction);

        expect(dataManager.transactions).toHaveLength(1);
        expect(dataManager.transactions[0].status).toBe('duplicate');
    });

    test('addTransaction defaults status to accepted', () => {
        const transaction = {
            rfid: 'test456',
            tokenId: 'test456',
            teamId: '002'
            // No status field
        };

        dataManager.addTransaction(transaction);

        expect(dataManager.transactions[0].status).toBe('accepted');
    });

    test('isTokenScanned checks global scannedTokens set', () => {
        dataManager.scannedTokens.add('token123');

        expect(dataManager.isTokenScanned('token123')).toBe(true);
        expect(dataManager.isTokenScanned('token456')).toBe(false);
    });

    test('addTransaction rejects missing required fields', () => {
        const invalidTransactions = [
            { rfid: 'test' },  // Missing teamId
            { teamId: '001' }, // Missing rfid
            {}                 // Missing both
        ];

        invalidTransactions.forEach(tx => {
            const initialLength = dataManager.transactions.length;
            dataManager.addTransaction(tx);
            expect(dataManager.transactions.length).toBe(initialLength);
        });
    });
});
```

**Step 2: Run tests**

```bash
npm test -- dataManager
```

Expected: PASS (validates current behavior)

**Step 3: Write tests for OrchestratorClient reconnection**

Create: `tests/unit/orchestratorClient.test.js`

```javascript
/**
 * Unit tests for OrchestratorClient
 * Tests reconnection and state restoration logic
 */

describe('OrchestratorClient', () => {
    let client;
    let mockSocket;

    beforeEach(() => {
        mockSocket = {
            on: jest.fn(),
            off: jest.fn(),
            emit: jest.fn(),
            connected: true
        };

        client = new OrchestratorClient();
        client.socket = mockSocket;
        client.hasEverConnected = false;

        // Mock DataManager
        window.DataManager = {
            scannedTokens: new Set(),
            saveScannedTokens: jest.fn(),
            addTransaction: jest.fn()
        };

        // Mock UIManager
        window.UIManager = {
            showToast: jest.fn()
        };
    });

    test('first connection sets hasEverConnected flag', () => {
        const syncHandler = mockSocket.on.mock.calls.find(
            call => call[0] === 'sync:full'
        )?.[1];

        expect(client.hasEverConnected).toBe(false);

        syncHandler({ data: { session: {}, transactions: [] } });

        expect(client.hasEverConnected).toBe(true);
    });

    test('first connection does not show reconnection toast', () => {
        const syncHandler = mockSocket.on.mock.calls.find(
            call => call[0] === 'sync:full'
        )?.[1];

        syncHandler({ data: { session: {}, transactions: [] } });

        // Should not show "Reconnected" toast on first connection
        expect(window.UIManager.showToast).not.toHaveBeenCalled();
    });

    test('reconnection shows toast with restored scan count', () => {
        client.hasEverConnected = true;  // Simulate previous connection

        const syncHandler = mockSocket.on.mock.calls.find(
            call => call[0] === 'sync:full'
        )?.[1];

        syncHandler({
            data: {
                session: { transactions: [1, 2, 3] }  // 3 scans
            }
        });

        expect(window.UIManager.showToast).toHaveBeenCalledWith(
            'Reconnected! 3 scans restored',
            'success',
            5000
        );
    });

    test('reconnection with no scans shows generic message', () => {
        client.hasEverConnected = true;

        const syncHandler = mockSocket.on.mock.calls.find(
            call => call[0] === 'sync:full'
        )?.[1];

        syncHandler({ data: { session: {} } });

        expect(window.UIManager.showToast).toHaveBeenCalledWith(
            'Reconnected to orchestrator',
            'success',
            3000
        );
    });
});
```

**Step 4: Run tests**

```bash
npm test -- orchestratorClient
```

Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/dataManager.test.js tests/unit/orchestratorClient.test.js
git commit -m "test: add unit tests for duplicate detection and reconnection

- DataManager: status field preservation, duplicate tracking
- OrchestratorClient: reconnection toast logic, hasEverConnected flag
- Improves test coverage for critical paths

Test coverage improvement from PR #2 code review"
```

---

## Task 8: Integration Test for End-to-End Duplicate Flow

**Priority:** ⚠️ MEDIUM

**Files:**
- Create: `tests/e2e/duplicate-detection.spec.js`

**Problem:** No E2E test validating duplicate detection across UI components.

**Step 1: Write Playwright test for duplicate flow**

Create: `tests/e2e/duplicate-detection.spec.js`

```javascript
/**
 * E2E test for duplicate detection across reconnection
 * Tests that duplicate markers appear in all UI locations
 *
 * Requires: Orchestrator running (npm run dev:full)
 */

const { test, expect } = require('@playwright/test');

test.describe('Duplicate Detection', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to GM Scanner
        await page.goto('https://localhost:3000/gm-scanner/');

        // Accept certificate warning (self-signed cert)
        await page.waitForLoadState('domcontentloaded');

        // Select networked mode
        await page.click('button:has-text("Networked")');

        // Enter orchestrator URL
        await page.fill('input[placeholder*="URL"]', 'https://localhost:3000');

        // Authenticate (assumes ADMIN_PASSWORD in env or default)
        await page.fill('input[type="password"]', process.env.ADMIN_PASSWORD || 'admin');
        await page.click('button:has-text("Connect")');

        // Wait for connection
        await page.waitForSelector('.mode-indicator:has-text("NETWORKED")');

        // Enter team ID
        await page.fill('input[placeholder*="Team"]', '001');
        await page.click('button:has-text("Start")');
    });

    test('duplicate token shows markers in all views', async ({ page }) => {
        // Scan token first time (use manual entry)
        await page.click('button:has-text("Manual Entry")');
        await page.fill('input[placeholder*="Token"]', 'TEST-DUPLICATE-001');
        await page.click('button:has-text("Submit")');

        // Wait for result
        await page.waitForSelector('.result-screen');
        expect(await page.textContent('.result-screen')).toContain('Accepted');

        // Return to scan screen
        await page.click('button:has-text("Continue")');

        // Scan SAME token again (duplicate)
        await page.click('button:has-text("Manual Entry")');
        await page.fill('input[placeholder*="Token"]', 'TEST-DUPLICATE-001');
        await page.click('button:has-text("Submit")');

        // Verify duplicate error shown
        await page.waitForSelector('.error-message:has-text("duplicate")');

        // Check transaction history for duplicate marker
        await page.click('button:has-text("History")');
        const duplicateBadges = await page.$$('.duplicate-badge-small');
        expect(duplicateBadges.length).toBeGreaterThan(0);

        // Check admin panel (switch views)
        await page.click('button:has-text("Admin")');
        await page.waitForSelector('#recentTransactionsList');
        const adminDuplicates = await page.$$('.transaction-item.duplicate');
        expect(adminDuplicates.length).toBeGreaterThan(0);

        // Check team details
        await page.click('button:has-text("Scanner")');
        await page.click('button:has-text("Team Details")');
        const detailDuplicates = await page.$$('.token-detail-card.duplicate');
        expect(detailDuplicates.length).toBeGreaterThan(0);
    });

    test('duplicate detection persists across reconnection', async ({ page }) => {
        // Scan token
        await page.click('button:has-text("Manual Entry")');
        await page.fill('input[placeholder*="Token"]', 'TEST-PERSIST-001');
        await page.click('button:has-text("Submit")');
        await page.waitForSelector('.result-screen');

        // Simulate disconnection (close WebSocket in console)
        await page.evaluate(() => {
            window.connectionManager?.client?.socket?.close();
        });

        // Wait for disconnection indicator
        await page.waitForSelector('.connection-status:has-text("Disconnected")');

        // Reconnect
        await page.evaluate(() => {
            window.connectionManager?.connect();
        });

        // Wait for reconnection
        await page.waitForSelector('.connection-status:has-text("Connected")');

        // Try to scan same token (should still be detected as duplicate)
        await page.click('button:has-text("Manual Entry")');
        await page.fill('input[placeholder*="Token"]', 'TEST-PERSIST-001');
        await page.click('button:has-text("Submit")');

        // Verify duplicate error shown (detection persisted)
        await page.waitForSelector('.error-message:has-text("duplicate")');
    });
});
```

**Step 2: Run E2E test**

```bash
# Start orchestrator first
npm run dev:full

# In another terminal, run E2E test
npx playwright test duplicate-detection
```

Expected: PASS (validates duplicate markers across all UI locations)

**Step 3: Commit**

```bash
git add tests/e2e/duplicate-detection.spec.js
git commit -m "test: add E2E test for duplicate detection flow

- Test duplicate markers in all UI views (history, admin, details)
- Test duplicate detection persistence across reconnection
- Validates UX consistency across scanner interface

E2E test coverage from PR #2 code review"
```

---

## Task 9: Final Verification and Documentation

**Priority:** 🚨 CRITICAL (BLOCKING)

**Files:**
- Create: `docs/code-review-fixes.md`
- Update: `MAINTENANCE.md`

**Step 1: Run full test suite**

```bash
cd /path/to/ALNScanner

# Unit tests
npm test

# E2E tests (requires orchestrator running)
npm run dev:full  # In separate terminal
npx playwright test

# Manual verification checklist (see Step 2)
```

Expected: All tests GREEN

**Step 2: Manual verification checklist**

Open scanner in browser and verify:

```
[ ] Queue indicator appears when offline transaction queued
[ ] Queue indicator disappears immediately when queue syncs (no delay)
[ ] Duplicate tokens show markers in:
    [ ] Result screen error message
    [ ] Transaction history list
    [ ] Admin panel recent transactions
    [ ] Team details view
[ ] Reconnection shows toast with restored scan count
[ ] No console errors about event listeners
[ ] Offline queue sync completes without errors
[ ] Browser devtools memory profiler shows no growing listener count
```

**Step 3: Document fixes in code-review-fixes.md**

Create: `docs/code-review-fixes.md`

```markdown
# PR #2 Code Review Fixes

**Date:** 2025-11-06
**Reviewer:** Claude Code
**PR:** #2 - feat(P2.2): GM Scanner UX improvements and bug fixes

## Summary

All critical and medium priority issues from code review have been addressed before merging to production.

## Fixes Applied

### 1. Event Listener Leak (HIGH PRIORITY) ✅

**Issue:** Event listeners accumulated in `replayTransaction()` causing memory leaks.

**Fix:**
- Added `activeHandlers` Map to track listeners
- Implemented `cleanup()` helper to remove listeners on success/timeout
- Added unit tests validating cleanup in all scenarios

**Files Modified:**
- `js/network/networkedQueueManager.js`
- `tests/unit/networkedQueueManager.test.js` (new)

**Commit:** `fix: prevent event listener leak in replayTransaction()`

---

### 2. Queue Indicator Performance (MEDIUM PRIORITY) ✅

**Issue:** 1-second polling was aggressive and wasteful.

**Fix:**
- Converted NetworkedQueueManager to extend EventTarget
- Emit `queue:changed` event on queue modifications
- Replaced `setInterval` with event listeners

**Files Modified:**
- `js/network/networkedQueueManager.js`
- `index.html`
- `tests/integration/queueIndicator.test.js` (new)

**Commit:** `refactor: convert queue indicator from polling to events`

---

### 3. Token Restoration Race Condition (MEDIUM PRIORITY) ✅

**Issue:** `sync:full` replaced local tokens, losing concurrent scans.

**Fix:**
- Merge server tokens with local `scannedTokens` (union operation)
- Validate `deviceScannedTokens` is array before processing
- Log detailed merge statistics

**Files Modified:**
- `js/network/orchestratorClient.js`
- `tests/integration/tokenRestoration.test.js` (new)

**Commit:** `fix: merge tokens on sync:full to prevent race condition`

---

### 4. Error Handling Improvements (MEDIUM PRIORITY) ✅

**Issue:** Error types not categorized, making retry logic difficult.

**Fix:**
- Categorize errors as timeout/validation/network/unknown
- Log error type breakdown in sync summary
- Enables future retry logic per error category

**Files Modified:**
- `js/network/networkedQueueManager.js`

**Commit:** `refactor: add error type categorization in queue sync`

---

### 5. Status Field Documentation (LOW PRIORITY) ✅

**Issue:** Valid status values undocumented.

**Fix:**
- Added comprehensive JSDoc for `addTransaction` method
- Documented all 4 valid status values with descriptions

**Files Modified:**
- `js/core/dataManager.js`

**Commit:** `docs: document valid status field values`

---

### 6. CSS Consolidation (LOW PRIORITY) ✅

**Issue:** Duplicate-related styles scattered and repetitive.

**Fix:**
- Added `:root` CSS variables for duplicate marker styles
- Replaced hardcoded colors with variable references
- No visual changes (regression tested)

**Files Modified:**
- `index.html`

**Commit:** `refactor: consolidate duplicate CSS with variables`

---

### 7. Test Coverage (MEDIUM PRIORITY) ✅

**Issue:** No tests for critical duplicate detection and state restoration.

**Fix:**
- Added unit tests for DataManager (status preservation, duplicate tracking)
- Added unit tests for OrchestratorClient (reconnection logic)
- Added E2E test for duplicate detection across all UI views

**Files Created:**
- `tests/unit/dataManager.test.js`
- `tests/unit/orchestratorClient.test.js`
- `tests/e2e/duplicate-detection.spec.js`

**Commits:**
- `test: add unit tests for duplicate detection and reconnection`
- `test: add E2E test for duplicate detection flow`

---

## Verification Results

**Test Results:**
- Unit tests: ✅ PASS
- Integration tests: ✅ PASS
- E2E tests: ✅ PASS

**Manual Verification:**
- Queue indicator: ✅ Event-driven, no delays
- Duplicate markers: ✅ Visible in all UI locations
- Reconnection: ✅ Toast with scan count
- Memory: ✅ No listener leaks (profiler verified)

## Merge Approval

All blocking issues resolved. PR #2 is **APPROVED FOR MERGE** to production.

**Recommended Next Steps:**
1. Merge PR #2 to main
2. Deploy to production (Raspberry Pi)
3. Monitor logs for queue sync performance
4. Consider batch replay (5-10 concurrent) in future iteration if queue sync latency becomes issue

## Related Documentation

- Code Review: (linked from PR #2 conversation)
- Implementation Plan: `docs/plans/2025-11-06-pr2-code-review-fixes.md`
- CLAUDE.md: Project architecture reference
```

**Step 4: Update MAINTENANCE.md with testing guidance**

Append to: `MAINTENANCE.md`

```markdown

---

## Testing PR Changes

When reviewing PRs with code changes, run the appropriate test suite:

### Quick Verification (2-3 minutes)
```bash
npm test  # Unit tests only
```

### Thorough Verification (10-15 minutes)
```bash
npm test                          # Unit + integration tests
npm run dev:full                  # Start orchestrator
npx playwright test               # E2E tests (separate terminal)
```

### Manual Verification for UX Changes
1. Open scanner: `https://[IP]:3000/gm-scanner/`
2. Select networked mode → authenticate
3. Test changed features (reference PR description)
4. Check browser console for errors
5. Use devtools memory profiler for listener leaks

### Test Files Organization
- `tests/unit/` - Fast, isolated unit tests
- `tests/integration/` - Service integration tests
- `tests/e2e/` - Full browser automation (Playwright)

**Note:** E2E tests require orchestrator running on `https://localhost:3000`
```

**Step 5: Run final verification**

```bash
# All tests
npm test
npx playwright test

# Manual checklist (see Step 2)
```

**Step 6: Commit documentation**

```bash
git add docs/code-review-fixes.md MAINTENANCE.md
git commit -m "docs: document PR #2 code review fixes

- Complete fix summary with file references
- Verification results and test coverage
- Testing guidance for future PRs
- Merge approval documentation"
```

**Step 7: Push all commits and request final review**

```bash
git push origin phase3/gm-scanner-ux-improvements
```

---

## Completion Checklist

Before marking this plan complete, verify:

- [ ] All 9 tasks completed
- [ ] All tests passing (unit + integration + E2E)
- [ ] Manual verification checklist completed
- [ ] Documentation updated
- [ ] All commits pushed to PR branch
- [ ] No console errors or warnings
- [ ] Memory profiler shows no listener leaks
- [ ] Ready for merge approval

---

## Notes for Engineer

**Time Estimate:** 3-4 hours total (assuming test infrastructure exists)

**Critical Path:** Task 1 (event listener leak) MUST be fixed before merge. Other tasks can be prioritized if time-constrained.

**Testing Dependencies:**
- Requires Jest (or similar) for unit tests
- Requires Playwright for E2E tests
- Requires running orchestrator for integration tests

**Skills Referenced:**
- @superpowers:systematic-debugging - Use if any test failures occur
- @superpowers:test-driven-development - Follow RED-GREEN-REFACTOR for new tests
- @superpowers:verification-before-completion - Run verification before claiming done

**DRY Violations Avoided:**
- Event listener cleanup logic centralized in `cleanup()` helper
- CSS variables eliminate duplicate color definitions
- Error categorization reusable for future retry logic

**YAGNI Applied:**
- Error retry logic NOT implemented (not needed yet, but categorization enables future implementation)
- Batch replay NOT implemented (sequential is acceptable for current queue sizes)

**Architecture Notes:**
- NetworkedQueueManager now extends EventTarget (standard pattern for event emission)
- Token restoration uses Set union (mathematical correctness for merge operation)
- CSS variables follow BEM-like naming convention (--duplicate-*)
