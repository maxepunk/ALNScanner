# Phase 2 Completion: UnifiedDataManager Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace DataManager + StandaloneDataManager with a single UnifiedDataManager that internally delegates to LocalStorage or NetworkedStorage strategies based on session mode.

**Architecture:** UnifiedDataManager wraps IStorageStrategy and uses SessionModeManager to select the appropriate strategy (LocalStorage for standalone, NetworkedStorage for networked). Consumers interact with a single API surface, eliminating all mode-branching code. Events are proxied through UnifiedDataManager.

**Tech Stack:** ES6 modules, Jest for testing, EventTarget for pub/sub, localStorage for standalone persistence, Socket.io for networked mode.

---

## Current State (Phase 2 Tasks 1-11 Complete)

Created infrastructure:
- `src/core/dataManagerUtils.js` - Shared utilities
- `src/core/storage/IStorageStrategy.js` - Interface contract
- `src/core/storage/LocalStorage.js` - Standalone strategy (505 LOC)
- `src/core/storage/NetworkedStorage.js` - Networked strategy (421 LOC)
- `tests/integration/storage-strategies.test.js` - Integration tests

**Missing:** UnifiedDataManager wrapper + consumer migration

---

## Task 1: Create UnifiedDataManager Class

**Files:**
- Create: `src/core/unifiedDataManager.js`
- Test: `tests/unit/core/unifiedDataManager.test.js`

**Step 1: Write the failing test for basic instantiation**

Create `tests/unit/core/unifiedDataManager.test.js`:

```javascript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UnifiedDataManager } from '../../../src/core/unifiedDataManager.js';

describe('UnifiedDataManager', () => {
  let manager;
  let mockTokenManager;
  let mockSessionModeManager;

  beforeEach(() => {
    mockTokenManager = {
      getAllTokens: jest.fn(() => []),
      findToken: jest.fn(() => null)
    };
    mockSessionModeManager = {
      isStandalone: jest.fn(() => true),
      isNetworked: jest.fn(() => false)
    };
  });

  describe('instantiation', () => {
    it('should create instance with dependencies', () => {
      manager = new UnifiedDataManager({
        tokenManager: mockTokenManager,
        sessionModeManager: mockSessionModeManager
      });

      expect(manager).toBeDefined();
      expect(manager.tokenManager).toBe(mockTokenManager);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/core/unifiedDataManager.test.js`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal UnifiedDataManager implementation**

Create `src/core/unifiedDataManager.js`:

```javascript
/**
 * UnifiedDataManager - Single entry point for data operations
 * Delegates to LocalStorage or NetworkedStorage based on session mode
 *
 * @module core/unifiedDataManager
 */

import { LocalStorage } from './storage/LocalStorage.js';
import { NetworkedStorage } from './storage/NetworkedStorage.js';

export class UnifiedDataManager extends EventTarget {
  /**
   * Create UnifiedDataManager instance
   * @param {Object} options - Dependencies
   * @param {Object} options.tokenManager - TokenManager instance
   * @param {Object} options.sessionModeManager - SessionModeManager instance
   * @param {Object} [options.debug] - Debug instance
   */
  constructor({ tokenManager, sessionModeManager, debug } = {}) {
    super();

    this.tokenManager = tokenManager;
    this.sessionModeManager = sessionModeManager;
    this.debug = debug;

    // Strategy instances (created on mode selection)
    this._localStrategy = null;
    this._networkedStrategy = null;
    this._activeStrategy = null;

    // Expose scannedTokens for backward compatibility
    this.scannedTokens = new Set();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/core/unifiedDataManager.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/unifiedDataManager.js tests/unit/core/unifiedDataManager.test.js
git commit -m "feat(core): add UnifiedDataManager skeleton"
```

---

## Task 2: Add Strategy Initialization Methods

**Files:**
- Modify: `src/core/unifiedDataManager.js`
- Test: `tests/unit/core/unifiedDataManager.test.js`

**Step 1: Write failing tests for strategy initialization**

Add to `tests/unit/core/unifiedDataManager.test.js`:

```javascript
describe('strategy initialization', () => {
  it('should initialize standalone mode with LocalStorage', async () => {
    mockSessionModeManager.isStandalone.mockReturnValue(true);
    manager = new UnifiedDataManager({
      tokenManager: mockTokenManager,
      sessionModeManager: mockSessionModeManager
    });

    await manager.initializeStandaloneMode();

    expect(manager.isReady()).toBe(true);
    expect(manager.getActiveStrategyType()).toBe('local');
  });

  it('should initialize networked mode with NetworkedStorage', async () => {
    mockSessionModeManager.isNetworked.mockReturnValue(true);
    mockSessionModeManager.isStandalone.mockReturnValue(false);

    const mockNetworkedSession = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn()
    };

    manager = new UnifiedDataManager({
      tokenManager: mockTokenManager,
      sessionModeManager: mockSessionModeManager
    });

    await manager.initializeNetworkedMode(mockNetworkedSession);

    expect(manager.isReady()).toBe(true);
    expect(manager.getActiveStrategyType()).toBe('networked');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/core/unifiedDataManager.test.js`
Expected: FAIL with "initializeStandaloneMode is not a function"

**Step 3: Implement strategy initialization**

Add to `src/core/unifiedDataManager.js`:

```javascript
/**
 * Initialize standalone mode (LocalStorage strategy)
 * @returns {Promise<void>}
 */
async initializeStandaloneMode() {
  this._log('Initializing standalone mode');

  this._localStrategy = new LocalStorage({
    tokenManager: this.tokenManager,
    debug: this.debug
  });

  await this._localStrategy.initialize();
  this._activeStrategy = this._localStrategy;

  // Sync scannedTokens from strategy
  this._syncScannedTokens();

  // Wire up event forwarding
  this._wireStrategyEvents(this._localStrategy);

  this._log('Standalone mode initialized');
}

/**
 * Initialize networked mode (NetworkedStorage strategy)
 * @param {Object} networkedSession - NetworkedSession instance
 * @returns {Promise<void>}
 */
async initializeNetworkedMode(networkedSession) {
  this._log('Initializing networked mode');

  this._networkedStrategy = new NetworkedStorage({
    tokenManager: this.tokenManager,
    networkedSession: networkedSession,
    debug: this.debug
  });

  await this._networkedStrategy.initialize();
  this._activeStrategy = this._networkedStrategy;

  // Sync scannedTokens from strategy
  this._syncScannedTokens();

  // Wire up event forwarding
  this._wireStrategyEvents(this._networkedStrategy);

  this._log('Networked mode initialized');
}

/**
 * Check if manager is ready
 * @returns {boolean}
 */
isReady() {
  return this._activeStrategy?.isReady() ?? false;
}

/**
 * Get active strategy type
 * @returns {string|null} 'local' | 'networked' | null
 */
getActiveStrategyType() {
  if (this._activeStrategy === this._localStrategy) return 'local';
  if (this._activeStrategy === this._networkedStrategy) return 'networked';
  return null;
}

/**
 * Sync scannedTokens from active strategy
 * @private
 */
_syncScannedTokens() {
  if (this._activeStrategy?.scannedTokens) {
    this.scannedTokens = this._activeStrategy.scannedTokens;
  }
}

/**
 * Wire event forwarding from strategy to manager
 * @private
 * @param {IStorageStrategy} strategy
 */
_wireStrategyEvents(strategy) {
  const events = [
    'transaction:added',
    'transaction:deleted',
    'team-score:updated',
    'scores:cleared',
    'data:cleared',
    'game-state:updated',
    'player-scan:added'
  ];

  events.forEach(eventName => {
    strategy.addEventListener(eventName, (event) => {
      this.dispatchEvent(new CustomEvent(eventName, { detail: event.detail }));
    });
  });
}

/**
 * Log message if debug available
 * @private
 */
_log(message) {
  if (this.debug?.log) {
    this.debug.log(`[UnifiedDataManager] ${message}`);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/core/unifiedDataManager.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/unifiedDataManager.js tests/unit/core/unifiedDataManager.test.js
git commit -m "feat(core): add UnifiedDataManager strategy initialization"
```

---

## Task 3: Delegate Core Operations to Strategy

**Files:**
- Modify: `src/core/unifiedDataManager.js`
- Test: `tests/unit/core/unifiedDataManager.test.js`

**Step 1: Write failing tests for delegated operations**

Add to test file:

```javascript
describe('delegated operations', () => {
  beforeEach(async () => {
    mockSessionModeManager.isStandalone.mockReturnValue(true);
    manager = new UnifiedDataManager({
      tokenManager: mockTokenManager,
      sessionModeManager: mockSessionModeManager
    });
    await manager.initializeStandaloneMode();
  });

  it('should delegate addTransaction to strategy', async () => {
    const transaction = {
      id: 'tx-1',
      tokenId: 'token1',
      teamId: '001',
      mode: 'blackmarket',
      points: 50000,
      valueRating: 3,
      memoryType: 'Personal',
      timestamp: new Date().toISOString()
    };

    const result = await manager.addTransaction(transaction);

    expect(result.success).toBe(true);
    expect(manager.getTransactions()).toHaveLength(1);
  });

  it('should delegate getTeamScores to strategy', async () => {
    await manager.addTransaction({
      id: 'tx-1', tokenId: 'token1', teamId: 'Alpha',
      mode: 'blackmarket', points: 50000,
      valueRating: 3, memoryType: 'Personal',
      timestamp: new Date().toISOString()
    });

    const scores = manager.getTeamScores();

    expect(scores).toHaveLength(1);
    expect(scores[0].teamId).toBe('Alpha');
    expect(scores[0].score).toBe(50000);
  });

  it('should delegate removeTransaction to strategy', async () => {
    await manager.addTransaction({
      id: 'tx-1', tokenId: 'token1', teamId: '001',
      mode: 'blackmarket', points: 50000,
      valueRating: 3, memoryType: 'Personal',
      timestamp: new Date().toISOString()
    });

    const result = await manager.removeTransaction('tx-1');

    expect(result.success).toBe(true);
    expect(manager.getTransactions()).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/core/unifiedDataManager.test.js`
Expected: FAIL with "addTransaction is not a function"

**Step 3: Implement delegated methods**

Add to `src/core/unifiedDataManager.js`:

```javascript
/**
 * Add a transaction
 * @param {Object} transaction - Transaction data
 * @returns {Promise<Object>} Transaction result
 */
async addTransaction(transaction) {
  this._requireActiveStrategy();
  return this._activeStrategy.addTransaction(transaction);
}

/**
 * Remove a transaction
 * @param {string} transactionId - Transaction ID
 * @returns {Promise<Object>} Result
 */
async removeTransaction(transactionId) {
  this._requireActiveStrategy();
  return this._activeStrategy.removeTransaction(transactionId);
}

/**
 * Get all transactions
 * @returns {Array} Transactions
 */
getTransactions() {
  this._requireActiveStrategy();
  return this._activeStrategy.getTransactions();
}

/**
 * Get team scores
 * @returns {Array} Team scores sorted by score descending
 */
getTeamScores() {
  this._requireActiveStrategy();
  return this._activeStrategy.getTeamScores();
}

/**
 * Adjust team score
 * @param {string} teamId - Team ID
 * @param {number} delta - Score adjustment
 * @param {string} reason - Reason for adjustment
 * @returns {Promise<Object>} Result
 */
async adjustTeamScore(teamId, delta, reason) {
  this._requireActiveStrategy();
  return this._activeStrategy.adjustTeamScore(teamId, delta, reason);
}

/**
 * Get game activity
 * @returns {Object} { tokens, stats }
 */
getGameActivity() {
  this._requireActiveStrategy();
  return this._activeStrategy.getGameActivity();
}

/**
 * Get current session info
 * @returns {Object|null}
 */
getCurrentSession() {
  return this._activeStrategy?.getCurrentSession() ?? null;
}

/**
 * Create a new session
 * @param {string} name - Session name
 * @param {Array} teams - Initial teams
 * @returns {Promise<Object>}
 */
async createSession(name, teams) {
  this._requireActiveStrategy();
  return this._activeStrategy.createSession(name, teams);
}

/**
 * End current session
 * @returns {Promise<void>}
 */
async endSession() {
  this._requireActiveStrategy();
  return this._activeStrategy.endSession();
}

/**
 * Ensure active strategy exists
 * @private
 */
_requireActiveStrategy() {
  if (!this._activeStrategy) {
    throw new Error('UnifiedDataManager: No active strategy. Call initializeStandaloneMode() or initializeNetworkedMode() first.');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/core/unifiedDataManager.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/unifiedDataManager.js tests/unit/core/unifiedDataManager.test.js
git commit -m "feat(core): delegate UnifiedDataManager operations to strategy"
```

---

## Task 4: Add DataManagerUtils Compatibility Methods

**Files:**
- Modify: `src/core/unifiedDataManager.js`
- Test: `tests/unit/core/unifiedDataManager.test.js`

**Step 1: Write failing tests for utility methods**

Add to test file:

```javascript
describe('utility methods (backward compatibility)', () => {
  beforeEach(async () => {
    mockSessionModeManager.isStandalone.mockReturnValue(true);
    manager = new UnifiedDataManager({
      tokenManager: mockTokenManager,
      sessionModeManager: mockSessionModeManager
    });
    await manager.initializeStandaloneMode();
  });

  it('should track scanned tokens with isTokenScanned/markTokenAsScanned', () => {
    expect(manager.isTokenScanned('token1')).toBe(false);

    manager.markTokenAsScanned('token1');

    expect(manager.isTokenScanned('token1')).toBe(true);
  });

  it('should unmark scanned tokens', () => {
    manager.markTokenAsScanned('token1');
    expect(manager.isTokenScanned('token1')).toBe(true);

    manager.unmarkTokenAsScanned('token1');

    expect(manager.isTokenScanned('token1')).toBe(false);
  });

  it('should calculate token value', () => {
    const transaction = {
      valueRating: 3,
      memoryType: 'Personal'
    };

    const value = manager.calculateTokenValue(transaction);

    expect(value).toBe(50000); // 3-star Personal = $50,000
  });

  it('should get team transactions', async () => {
    await manager.addTransaction({
      id: 'tx-1', tokenId: 'token1', teamId: 'Alpha',
      mode: 'blackmarket', points: 50000,
      valueRating: 3, memoryType: 'Personal',
      timestamp: new Date().toISOString()
    });
    await manager.addTransaction({
      id: 'tx-2', tokenId: 'token2', teamId: 'Beta',
      mode: 'blackmarket', points: 25000,
      valueRating: 2, memoryType: 'Personal',
      timestamp: new Date().toISOString()
    });

    const alphaTransactions = manager.getTeamTransactions('Alpha');

    expect(alphaTransactions).toHaveLength(1);
    expect(alphaTransactions[0].teamId).toBe('Alpha');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/core/unifiedDataManager.test.js`
Expected: FAIL with "isTokenScanned is not a function"

**Step 3: Implement utility methods**

Add imports and methods to `src/core/unifiedDataManager.js`:

```javascript
// Add to imports at top
import { DataManagerUtils } from './dataManagerUtils.js';
import { calculateTokenValue as calcTokenValue } from './scoring.js';

// Add methods to class:

/**
 * Check if token has been scanned
 * @param {string} tokenId
 * @returns {boolean}
 */
isTokenScanned(tokenId) {
  return DataManagerUtils.isTokenScanned(this.scannedTokens, tokenId);
}

/**
 * Mark token as scanned
 * @param {string} tokenId
 */
markTokenAsScanned(tokenId) {
  DataManagerUtils.markTokenAsScanned(this.scannedTokens, tokenId);
}

/**
 * Unmark token as scanned
 * @param {string} tokenId
 */
unmarkTokenAsScanned(tokenId) {
  DataManagerUtils.unmarkTokenAsScanned(this.scannedTokens, tokenId);
}

/**
 * Calculate token value
 * @param {Object} transaction - Transaction with valueRating and memoryType
 * @returns {number}
 */
calculateTokenValue(transaction) {
  return calcTokenValue(transaction.valueRating, transaction.memoryType);
}

/**
 * Get transactions for a specific team
 * @param {string} teamId
 * @returns {Array}
 */
getTeamTransactions(teamId) {
  const transactions = this.getTransactions();
  return transactions.filter(tx => tx.teamId === teamId);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/core/unifiedDataManager.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/unifiedDataManager.js tests/unit/core/unifiedDataManager.test.js
git commit -m "feat(core): add UnifiedDataManager utility methods for backward compatibility"
```

---

## Task 5: Add Advanced Methods (Group Completion, Enhanced Data)

**Files:**
- Modify: `src/core/unifiedDataManager.js`
- Test: `tests/unit/core/unifiedDataManager.test.js`

**Step 1: Write failing tests for advanced methods**

Add to test file:

```javascript
describe('advanced methods', () => {
  beforeEach(async () => {
    mockSessionModeManager.isStandalone.mockReturnValue(true);
    mockTokenManager.findToken.mockImplementation((tokenId) => {
      const tokens = {
        'token1': { SF_Group: 'Test Group (x2)', SF_ValueRating: 3, SF_MemoryType: 'Personal' },
        'token2': { SF_Group: 'Test Group (x2)', SF_ValueRating: 3, SF_MemoryType: 'Personal' }
      };
      return tokens[tokenId] || null;
    });

    manager = new UnifiedDataManager({
      tokenManager: mockTokenManager,
      sessionModeManager: mockSessionModeManager
    });
    await manager.initializeStandaloneMode();
  });

  it('should parse group info from group string', () => {
    const result = manager.parseGroupInfo('Server Logs (x5)');

    expect(result.name).toBe('Server Logs');
    expect(result.multiplier).toBe(5);
  });

  it('should normalize group names', () => {
    const normalized = manager.normalizeGroupName('Server Logs');

    expect(normalized).toBe('serverlogs');
  });

  it('should reset for new session', () => {
    manager.markTokenAsScanned('token1');
    expect(manager.isTokenScanned('token1')).toBe(true);

    manager.resetForNewSession();

    expect(manager.isTokenScanned('token1')).toBe(false);
    expect(manager.getTransactions()).toHaveLength(0);
  });

  it('should clear all data', () => {
    manager.markTokenAsScanned('token1');

    manager.clearAllData();

    expect(manager.isTokenScanned('token1')).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/core/unifiedDataManager.test.js`
Expected: FAIL with "parseGroupInfo is not a function"

**Step 3: Implement advanced methods**

Add import and methods to `src/core/unifiedDataManager.js`:

```javascript
// Add to imports
import { parseGroupInfo as parseGroup } from './scoring.js';

// Add methods:

/**
 * Parse group info from group string
 * @param {string} groupString - e.g., "Server Logs (x5)"
 * @returns {Object} { name, multiplier }
 */
parseGroupInfo(groupString) {
  return parseGroup(groupString);
}

/**
 * Normalize group name for comparison
 * @param {string} groupName
 * @returns {string}
 */
normalizeGroupName(groupName) {
  return groupName?.toLowerCase().replace(/\s+/g, '') || '';
}

/**
 * Reset for new session
 */
resetForNewSession() {
  this.scannedTokens.clear();
  if (this._activeStrategy) {
    // Reset strategy's internal state
    if (this._localStrategy === this._activeStrategy) {
      this._localStrategy.sessionData = {
        sessionId: `LOCAL_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        startTime: new Date().toISOString(),
        transactions: [],
        teams: {},
        mode: 'standalone'
      };
      this._localStrategy.scannedTokens.clear();
    }
  }
  this.dispatchEvent(new CustomEvent('data:cleared'));
}

/**
 * Clear all data
 */
clearAllData() {
  this.scannedTokens.clear();
  if (this._localStrategy) {
    this._localStrategy.scannedTokens.clear();
  }
  this.dispatchEvent(new CustomEvent('data:cleared'));
}

/**
 * Get team completed groups
 * @param {string} teamId
 * @returns {Array} Completed group names
 */
getTeamCompletedGroups(teamId) {
  // Delegate to strategy if available, otherwise calculate
  if (this._activeStrategy?.getTeamCompletedGroups) {
    return this._activeStrategy.getTeamCompletedGroups(teamId);
  }
  return [];
}

/**
 * Get enhanced team transactions with group info
 * @param {string} teamId
 * @returns {Object}
 */
getEnhancedTeamTransactions(teamId) {
  const transactions = this.getTeamTransactions(teamId);
  const scores = this.getTeamScores();
  const teamScore = scores.find(s => s.teamId === teamId);

  return {
    teamId,
    transactions,
    score: teamScore?.score || 0,
    tokensScanned: transactions.length
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/core/unifiedDataManager.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/unifiedDataManager.js tests/unit/core/unifiedDataManager.test.js
git commit -m "feat(core): add UnifiedDataManager advanced methods"
```

---

## Task 6: Update main.js to Use UnifiedDataManager

**Files:**
- Modify: `src/main.js`

**Step 1: Read current main.js structure**

Review lines 20-88 of `src/main.js` for current manager creation.

**Step 2: Replace dual managers with UnifiedDataManager**

Replace imports and manager creation in `src/main.js`:

```javascript
// OLD:
// import { DataManager as DataManagerClass } from './core/dataManager.js';
// import { StandaloneDataManager as StandaloneDataManagerClass } from './core/standaloneDataManager.js';

// NEW:
import { UnifiedDataManager as UnifiedDataManagerClass } from './core/unifiedDataManager.js';

// ... keep other imports ...

// OLD:
// const DataManager = new DataManagerClass({
//   tokenManager: TokenManager,
//   settings: Settings,
//   debug: Debug
// });
// const StandaloneDataManager = new StandaloneDataManagerClass({
//   tokenManager: TokenManager,
//   debug: Debug
// });

// NEW:
const DataManager = new UnifiedDataManagerClass({
  tokenManager: TokenManager,
  sessionModeManager: null, // Set by App during mode selection
  debug: Debug
});

// For backward compatibility during migration
const StandaloneDataManager = DataManager;
```

**Step 3: Update UIManager creation**

```javascript
// UIManager now only needs one data manager
const UIManager = new UIManagerClass({
  settings: Settings,
  dataManager: DataManager,
  standaloneDataManager: DataManager  // Same instance for compatibility
});
```

**Step 4: Update ScreenUpdateManager connections**

```javascript
// Connect only once (both event sets go to same manager)
screenUpdateManager.connectToDataSource(DataManager, [
  'transaction:added',
  'transaction:deleted',
  'scores:cleared',
  'data:cleared',
  'game-state:updated',
  'team-score:updated',
  'player-scan:added'
]);

// REMOVE: duplicate connection to StandaloneDataManager
// screenUpdateManager.connectToDataSource(StandaloneDataManager, [...]);
```

**Step 5: Run tests to verify no regressions**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/main.js
git commit -m "refactor(main): use UnifiedDataManager instead of dual managers"
```

---

## Task 7: Update App.js to Initialize UnifiedDataManager

**Files:**
- Modify: `src/app/app.js`

**Step 1: Update App constructor to accept unified manager**

In `src/app/app.js`, find constructor and update:

```javascript
// Change from:
// this.dataManager = dependencies.dataManager || DataManager;
// this.standaloneDataManager = dependencies.standaloneDataManager || null;

// To:
this.dataManager = dependencies.dataManager;
// Remove standaloneDataManager reference - use same manager for both modes
```

**Step 2: Update _initializeStandaloneMode**

Find `_initializeStandaloneMode` method (around line 520) and update:

```javascript
async _initializeStandaloneMode() {
  // OLD: this.standaloneDataManager.app = this;
  // NEW: Initialize unified manager for standalone mode
  this.dataManager.sessionModeManager = this.sessionModeManager;
  await this.dataManager.initializeStandaloneMode();

  // Rest of method unchanged...
}
```

**Step 3: Update _initializeNetworkedMode**

Find `_initializeNetworkedMode` method and update:

```javascript
async _initializeNetworkedMode() {
  // ... existing connection setup ...

  // After networkedSession is created:
  this.dataManager.sessionModeManager = this.sessionModeManager;
  await this.dataManager.initializeNetworkedMode(this.networkedSession);

  // Remove: this.dataManager.networkedSession = this.networkedSession;
}
```

**Step 4: Update confirmTeamId to use unified manager**

Find `confirmTeamId` method (around line 490) and simplify:

```javascript
async confirmTeamId(teamName) {
  // ... validation code ...

  // Remove mode branching - unified manager handles both modes
  const session = this.dataManager.getCurrentSession();
  if (session && !session.teams?.[teamName]) {
    await this.dataManager.addTeam(teamName);
  }

  // ... rest of method ...
}
```

**Step 5: Update processNFCRead to use unified manager**

Find `processNFCRead` method and simplify transaction handling:

```javascript
// OLD:
// if (this.sessionModeManager.isStandalone()) {
//   this.standaloneDataManager.addTransaction(transaction);
// } else {
//   this.dataManager.addTransaction(transaction);
// }

// NEW:
await this.dataManager.addTransaction(transaction);
this.dataManager.markTokenAsScanned(tokenId);
```

**Step 6: Run full test suite**

Run: `npm test`
Expected: Tests may fail - update tests as needed

**Step 7: Commit**

```bash
git add src/app/app.js
git commit -m "refactor(app): use UnifiedDataManager, remove mode branching"
```

---

## Task 8: Update UIManager to Remove _getDataSource

**Files:**
- Modify: `src/ui/uiManager.js`
- Test: Run existing tests

**Step 1: Remove _getDataSource method**

In `src/ui/uiManager.js`:

```javascript
// DELETE this method:
// _getDataSource() {
//   const isStandalone = this.sessionModeManager?.isStandalone();
//   if (isStandalone) {
//     return this.standaloneDataManager;
//   }
//   return this.dataManager;
// }
```

**Step 2: Update all _getDataSource() calls to use this.dataManager directly**

Replace all occurrences:
```javascript
// OLD: const dataSource = this._getDataSource();
// NEW: const dataSource = this.dataManager;
```

**Step 3: Simplify constructor**

```javascript
constructor({ settings, dataManager, sessionModeManager, app } = {}) {
  this.settings = settings;
  this.dataManager = dataManager;
  // Remove: this.standaloneDataManager = standaloneDataManager;
  this.sessionModeManager = sessionModeManager;
  this.app = app;
  // ...
}
```

**Step 4: Run tests**

Run: `npm test -- tests/unit/ui/`
Expected: PASS (update mocks if needed)

**Step 5: Commit**

```bash
git add src/ui/uiManager.js
git commit -m "refactor(ui): remove _getDataSource, use unified dataManager"
```

---

## Task 9: Update Tests for UnifiedDataManager

**Files:**
- Modify: `tests/unit/app/app.test.js`
- Modify: `tests/unit/ui/uiManager.test.js`
- Modify: `tests/integration/storage-strategies.test.js`

**Step 1: Update App tests**

Update mock setup in app tests:

```javascript
const mockDataManager = {
  initializeStandaloneMode: jest.fn(),
  initializeNetworkedMode: jest.fn(),
  addTransaction: jest.fn(() => ({ success: true })),
  getTransactions: jest.fn(() => []),
  // ... other methods
};

// Remove mockStandaloneDataManager references
```

**Step 2: Update UIManager tests**

Remove standaloneDataManager from mock setup:

```javascript
const uiManager = new UIManager({
  settings: mockSettings,
  dataManager: mockDataManager,
  // Remove: standaloneDataManager: mockStandaloneDataManager,
  sessionModeManager: mockSessionModeManager
});
```

**Step 3: Update integration tests**

Update `tests/integration/storage-strategies.test.js` to test UnifiedDataManager:

```javascript
import { UnifiedDataManager } from '../../src/core/unifiedDataManager.js';

describe('UnifiedDataManager Integration', () => {
  let manager;

  beforeEach(async () => {
    localStorage.clear();
    manager = new UnifiedDataManager({
      tokenManager: { getAllTokens: () => [], findToken: () => null },
      sessionModeManager: { isStandalone: () => true }
    });
    await manager.initializeStandaloneMode();
  });

  // ... existing tests adapted for unified manager
});
```

**Step 4: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add tests/
git commit -m "test: update tests for UnifiedDataManager"
```

---

## Task 10: Clean Up - Remove Old Managers (Optional)

**Note:** This task is OPTIONAL and should only be done after all tests pass.

**Files:**
- Delete: `src/core/dataManager.js`
- Delete: `src/core/standaloneDataManager.js`
- Update: All remaining imports

**Step 1: Search for remaining references**

```bash
grep -r "dataManager.js\|standaloneDataManager.js" src/ tests/
```

**Step 2: Update or remove each reference**

Each file importing old managers needs updating.

**Step 3: Delete old files**

```bash
rm src/core/dataManager.js src/core/standaloneDataManager.js
```

**Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated DataManager and StandaloneDataManager"
```

---

## Task 11: Final Verification

**Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass

**Step 2: Run E2E tests**

```bash
npm run test:e2e
```

Expected: All E2E tests pass

**Step 3: Manual smoke test**

1. Start dev server: `npm run dev`
2. Test standalone mode: Select standalone, scan token, verify score
3. Test networked mode (if backend available)

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Phase 2 DataManager unification"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create UnifiedDataManager skeleton | `src/core/unifiedDataManager.js` |
| 2 | Add strategy initialization | `src/core/unifiedDataManager.js` |
| 3 | Delegate core operations | `src/core/unifiedDataManager.js` |
| 4 | Add utility methods | `src/core/unifiedDataManager.js` |
| 5 | Add advanced methods | `src/core/unifiedDataManager.js` |
| 6 | Update main.js | `src/main.js` |
| 7 | Update App.js | `src/app/app.js` |
| 8 | Update UIManager | `src/ui/uiManager.js` |
| 9 | Update tests | `tests/` |
| 10 | Clean up (optional) | Delete old managers |
| 11 | Final verification | Full test suite |
