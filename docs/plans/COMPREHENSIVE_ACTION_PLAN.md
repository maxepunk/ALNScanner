# Comprehensive Action Plan: ALNScanner ES6 Module Migration & Backend E2E Alignment

**Branch**: `feature/es6-module-migration` (worktree: `ALNScanner-es6-migration`)
**Date**: 2025-11-11
**Status**: Phase 7.1 Complete → Phases 7.2-9 + Backend Alignment In Progress
**Goal**: Complete ES6 migration, align backend E2E tests, achieve production readiness, prepare PR

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architectural Principles (Source of Truth)](#architectural-principles)
3. [Current State Assessment](#current-state-assessment)
4. [Remaining Work from Original Plans](#remaining-work-from-original-plans)
5. [Backend E2E Alignment Work](#backend-e2e-alignment-work)
6. [Scanner Bug Fixes](#scanner-bug-fixes)
7. [Testing Strategy](#testing-strategy)
8. [PR Preparation Checklist](#pr-preparation-checklist)
9. [Rollback Plan](#rollback-plan)
10. [Success Criteria](#success-criteria)

---

## Executive Summary

### What We're Completing

This action plan consolidates work from three evolution documents:
1. **ARCHITECTURE_REFACTORING_2025-11.md** - Original architectural vision
2. **2025-11-11-es6-module-migration.md** - ES6 migration implementation
3. **2025-11-11-phase7-9-completion.md** - E2E testing & finalization

**Key Objectives**:
- ✅ Complete ES6 module migration (Phases 7.2-9)
- ✅ Align backend E2E tests with refactored scanner
- ✅ Fix scanner bugs discovered during E2E investigation
- ✅ Validate production readiness with comprehensive testing
- ✅ Prepare clean PR with code review readiness

### Engineering Approach

**Principles**:
- **Single Source of Truth**: This document supersedes all previous plans
- **Architectural Integrity**: All changes honor refactor principles (no window globals, event-driven, DI)
- **Test-Driven Validation**: Every change verified by automated tests before manual testing
- **Incremental Progress**: Each phase independently verifiable with rollback points
- **Contract Compliance**: AsyncAPI contracts maintained throughout

**Timeline**: 1.5-2 days (8-12 hours)
**Risk Level**: Medium (well-tested approach, clear rollback plan)
**Time Savings**: ~2.5 hours (Phase 7.2 complete, Phase 8 mostly done)

---

## Architectural Principles (Source of Truth)

All decisions in this plan adhere to these **non-negotiable principles** from the architecture refactor:

### 1. No Window Globals
**Intent**: Eliminate global namespace pollution, enable proper module boundaries

```javascript
// ❌ FORBIDDEN (deprecated)
window.App = app;
window.DataManager = dataManager;

// ✅ REQUIRED (ES6 modules)
import { App } from './app/app.js';
// HTML uses data-action attributes with event delegation
```

**Implications**:
- All HTML onclick handlers use `data-action` attributes
- DOM event delegation via `bindDOMEvents()` in main.js
- Tests use Page Object pattern (DOM interaction only)
- No `window.XXX` in test code OR production code

### 2. Event-Driven Coordination
**Intent**: Decouple services, eliminate tight coupling, enable testability

```javascript
// ✅ Services emit events
class DataManager extends EventTarget {
  addTransaction(tx) {
    this.transactions.push(tx);
    this.dispatchEvent(new CustomEvent('transaction:added', { detail: tx }));
  }
}

// ✅ Listeners in centralized location (main.js)
DataManager.addEventListener('transaction:added', () => {
  UIManager.updateHistoryBadge();
});
```

**Implications**:
- No direct method calls between services (except via DI)
- Event wiring centralized in main.js (single source of truth)
- Tests can observe events without mocking internals

### 3. Dependency Injection
**Intent**: Enable testing, make dependencies explicit, control initialization order

```javascript
// ✅ Constructor parameters make dependencies explicit
class App {
  constructor({ debug, uiManager, settings, tokenManager, dataManager, ... }) {
    this.debug = debug;
    this.uiManager = uiManager;
    // ...
  }
}

// ✅ Instantiation in main.js with clear dependency graph
const DataManager = new DataManagerClass({ tokenManager, settings, debug });
const UIManager = new UIManagerClass({ settings, dataManager, standaloneDataManager });
const app = new App({ debug, uiManager, settings, tokenManager, dataManager, ... });
```

**Implications**:
- No `import` statements for service dependencies (passed via constructor)
- Singleton instances created in main.js only
- Tests can inject mocks/fakes easily

### 4. Single Responsibility Principle
**Intent**: Each component has ONE clear job, easier testing and maintenance

**Component Boundaries**:
- **App**: Application lifecycle, mode selection orchestration
- **DataManager**: Networked mode transactions and scoring (backend authoritative)
- **StandaloneDataManager**: Standalone mode transactions and scoring (local authoritative)
- **UIManager**: UI state management and screen rendering
- **NetworkedSession**: Service factory, WebSocket lifecycle orchestration
- **ConnectionManager**: Connection health, token validation, retry logic
- **OrchestratorClient**: WebSocket wrapper (dumb pipe, no business logic)

**Implications**:
- No mixed responsibilities (e.g., OrchestratorClient does NOT validate tokens)
- Clear ownership of state (e.g., only DataManager modifies transaction list)
- Tests can validate single concern per test

### 5. Contract-First Architecture
**Intent**: Backend and scanners evolve independently, contracts prevent breaking changes

**Contracts**:
- `backend/contracts/asyncapi.yaml` - WebSocket events (GM Scanner)
- `backend/contracts/openapi.yaml` - HTTP endpoints (Player Scanner)

**Implications**:
- Scanner changes MUST NOT break backend contract tests (141 tests)
- Backend E2E tests validate contract compliance
- Message envelope structure preserved (`{event, data, timestamp}`)

---

## Current State Assessment

### ✅ Completed Work (Phases 0-7.1)

**Phase 0-6: ES6 Module Architecture** ✅
- [x] Vite build system configured
- [x] All components converted to ES6 modules
- [x] 598 unit tests passing (>80% coverage)
- [x] Dependency injection implemented throughout
- [x] Event-driven architecture wired in main.js
- [x] `src/main.js` entry point with centralized initialization

**Phase 7.0: Remove Window Globals** ✅
- [x] Removed `window.App`, `window.DataManager`, `window.Settings`, etc.
- [x] Implemented `domEventBindings.js` for event delegation
- [x] HTML onclick handlers converted to `data-action` attributes
- [x] Connection wizard uses `app:ready` custom event (temporary until refactored to module)

**Phase 7.1: Fix E2E Test Anti-Patterns** ✅
- [x] Scanner E2E tests (L1, L2) updated to use Page Object pattern
- [x] Tests validate no window globals exist
- [x] Tests use DOM interaction only (no window.App.method() calls)

**Phase 7.2: L2 Standalone Mode E2E Tests** ✅
- [x] 13 comprehensive tests implemented (298 lines)
- [x] Full workflow coverage (team entry → scan → results → history)
- [x] Duplicate detection, persistence, mode toggling validated
- [x] Real tokens from ALN-TokenData used
- [x] 100% pass rate on fresh browser state

### 🚧 In-Progress Work

**Scanner Worktree**: `ALNScanner-es6-migration/`
- Commit: `0785d16` (November 11, 2025)
- State: Phase 7.2 complete, Phase 7.4+ pending
- Remaining: Cleanup old tests, production validation, documentation

**Backend E2E Tests**: `backend/tests/e2e/`
- State: Incompatible with ES6 scanner (using old scanner code)
- Issues: Window global usage, missing Page Object methods, wrong scanner deployed

**Main Repo**: Uncommitted changes
- Modified: `backend/public/gm-scanner` (submodule pointer)
- Modified: Backend E2E test files (partial fixes)
- Untracked: Page Object location confusion

---

## Remaining Work from Original Plans

### Phase 7.2: L2 Standalone Mode E2E Tests (Scanner Repo)

**Goal**: Complete user journey tests using Page Object pattern (no backend required)

**Location**: `ALNScanner-es6-migration/tests/e2e/specs/02-standalone-mode.spec.js`

**Status**: ✅ **COMPLETE** (Implemented in commit `0785d16`, November 11, 2025)

**Implemented Tests** (13 tests, 298 lines):
1. ✅ Full workflow: mode selection → team entry → scan → results → history
2. ✅ Duplicate token detection in standalone mode
3. ✅ Invalid token handling
4. ✅ localStorage persistence across page reload
5. ✅ Mode toggling (detective/blackmarket)
6. ✅ Team context switching
7. ✅ History badge updates
8. ✅ Token counting and value calculations
9. ✅ Settings persistence

**Real Tokens Used**:
- `rat002`, `alr001`, `asm031`, `bar007` from ALN-TokenData
- Scoring calculations validated against StandaloneDataManager logic
- Duplicate detection confirmed without backend

**Acceptance Criteria** (ALL MET):
- [x] 13 tests covering complete standalone workflow
- [x] Tests run in <30 seconds
- [x] No backend dependency
- [x] No mocks (pure DOM interaction)
- [x] 100% pass rate on fresh browser state

**Engineering Note**: These tests validate the **final architecture** (no window globals) and serve as regression prevention for Phase 7.0 work. No additional work required for this phase.

---

### Phase 7.3: L3 Networked Mode Strategy (Backend Repo)

**Goal**: Leverage backend E2E tests as authoritative source for networked mode validation

**Status**: ✅ STRATEGY DEFINED (no scanner work needed)

**Approach**:
- Backend E2E tests (`backend/tests/e2e/flows/07b-gm-scanner-networked-blackmarket.test.js`, etc.) are **authoritative**
- Scanner MUST NOT break backend contract tests (141 tests)
- Scanner changes validated by backend test suite, not duplicate tests in scanner repo

**Tasks**:
1. ✅ Document L3 strategy in `ALNScanner-es6-migration/tests/e2e/L3-NETWORKED-MODE.md`
2. ✅ Verify backend contract tests pass (covered in Backend E2E Alignment section below)

**Acceptance Criteria**:
- [ ] Backend contract tests: 141 passing
- [ ] Backend E2E tests: All GM scanner flows passing
- [ ] No duplicate networked mode tests in scanner repo

---

### Phase 7.4: Cleanup Old Smoke Tests (Scanner Repo)

**Goal**: Remove anti-pattern window global checks from legacy smoke tests

**Location**: `ALNScanner-es6-migration/tests/e2e/specs/00-smoke.spec.js`

**Status**: ❌ NOT STARTED (newly discovered during verification)

**Problem**: Old smoke tests (lines 47-49) still check for `window.App`, violating the "no window globals" architectural principle:
```javascript
const hasWindowApp = await page.evaluate(() => typeof window.App !== 'undefined');
expect(hasWindowApp).toBe(true);  // ❌ This should FAIL with ES6 architecture
```

**Tasks**:
1. **Review old smoke test file**:
   ```bash
   cd ALNScanner-es6-migration
   grep -n "window\." tests/e2e/specs/00-smoke.spec.js
   ```

2. **Choose resolution strategy**:
   - **Option A**: Delete `00-smoke.spec.js` entirely (use new no-globals tests instead)
   - **Option B**: Update tests to verify window globals DON'T exist
   - **Option C**: Move to archive folder for reference

**Recommendation**: **Option A** (delete) because:
- New smoke tests (`tests/e2e/specs/01-no-globals.spec.js`) already verify correct architecture
- Old tests validate deprecated behavior
- Keeping both creates confusion about which is authoritative

3. **Implementation**:
   ```bash
   cd tests/e2e/specs
   git rm 00-smoke.spec.js
   git commit -m "test: remove legacy smoke tests with window global checks"
   ```

4. **Verify no other window global checks**:
   ```bash
   grep -rn "window\\.App\|window\\.DataManager\|window\\.UIManager" tests/
   # Should return no results in test code
   ```

**Acceptance Criteria**:
- [ ] Old smoke tests removed or updated
- [ ] No window global checks in test suite
- [ ] New no-globals tests remain as smoke tests
- [ ] Test suite still runs without errors

**Priority**: HIGH (prevents future confusion about architectural standards)

---

### Phase 8: Production Build & Deployment

**Goal**: Configure Vite production build with optimizations, prepare for GitHub Pages

**Status**: ✅ **MOSTLY COMPLETE** (Build works, needs validation testing only)

**Verified Configuration** (`vite.config.js`):
- [x] Vite build system configured
- [x] Base path for GitHub Pages (`/gm-scanner/`)
- [x] Source maps enabled
- [x] HTTPS server for NFC API (basicSsl plugin)
- [x] HTML minification

**Build Results** (Verified November 11, 2025):
```bash
npm run build
# ✓ 932ms build time
# dist/index.html             1.88 kB
# dist/assets/index-[hash].js  103.73 kB (main bundle)
```

**Remaining Tasks**:
1. **Validate production bundle behavior**:
   ```bash
   cd ALNScanner-es6-migration
   npm run preview  # Test production build locally
   # Manual test: Verify all workflows work in production mode
   ```

2. **Run E2E tests against production build**:
   ```bash
   npm run build
   npm run preview &  # Start preview server
   PREVIEW_PID=$!
   sleep 5
   npm run test:e2e   # Run E2E tests against production build
   kill $PREVIEW_PID
   ```

3. **Verify no console errors in production**:
   - Open browser DevTools during preview
   - Test complete workflow (standalone + networked modes)
   - Check for missing source map warnings
   - Verify performance (no lag/freezing)

**Acceptance Criteria**:
- [x] Production build succeeds without errors
- [x] Bundle size <500KB (103KB ✅)
- [ ] E2E tests pass against production build (needs validation)
- [x] Source maps enabled
- [ ] No console errors in production bundle (needs validation)

**Time Saved**: ~45 minutes (build config already done)

---

### Phase 9: Final Documentation

**Goal**: Update CLAUDE.md, README.md with ES6 architecture, testing instructions, troubleshooting

**Status**: ✅ CLAUDE.md UPDATED (commit `02491bf`)

**Remaining Tasks**:
1. **Update README.md** with:
   - Quick start (npm run dev, npm test, npm run build)
   - ES6 architecture overview
   - Testing strategy (L1, L2, L3 breakdown)
   - Deployment instructions

2. **Create MIGRATION.md** documenting:
   - Breaking changes (window globals removed)
   - Migration benefits
   - Rollback instructions
   - Developer workflow changes

3. **Update CHANGELOG.md** (if exists) with:
   - ES6 migration entry
   - Architectural changes
   - Breaking changes
   - Bug fixes from investigation

**Acceptance Criteria**:
- [ ] README.md reflects ES6 architecture
- [ ] MIGRATION.md documents breaking changes
- [ ] CLAUDE.md accurate (already done)
- [ ] All documentation reviewed for accuracy

---

## Backend E2E Alignment Work

**Context**: Backend E2E tests currently run against OLD scanner code and use window globals that no longer exist. This section aligns tests with the refactored scanner.

### Phase B1: Deploy ES6 Scanner to Backend

**Goal**: Make backend E2E tests run against refactored scanner code

**Method**: Symlink worktree to backend (temporary for development)

**Tasks**:
1. **Create symlink from backend to worktree**
   ```bash
   cd backend/public
   rm -rf gm-scanner  # Remove old symlink
   ln -s ../../ALNScanner-es6-migration gm-scanner
   cd ../..
   ```

2. **Verify scanner loads in backend**
   ```bash
   npm run dev:full  # Start orchestrator + VLC
   # Open https://localhost:3000/gm-scanner/
   # Verify: game mode selection appears, no console errors
   ```

3. **Test with simple E2E smoke test**
   ```bash
   cd backend
   npm run test:e2e -- 00-smoke-test
   # Expected: Basic connectivity works
   ```

**Acceptance Criteria**:
- [ ] Backend serves ES6 scanner (commit `0785d16` or later)
- [ ] Scanner loads without errors
- [ ] Game mode selection screen appears
- [ ] No mixed content errors (HTTPS working)

**Rollback**: `ln -s ../../ALNScanner backend/public/gm-scanner`

---

### Phase B2: Fix GMScannerPage Import Paths

**Goal**: Correct Page Object import paths so tests can run

**Files**:
- `backend/tests/e2e/helpers/scanner-init.js:10`

**Current Code**:
```javascript
const { GMScannerPage } = require('../page-objects/GMScannerPage');
```

**Problem**: Path expects `helpers/page-objects/` but file is at `page-objects/`

**Solution**: Choose consistent location

**Option A: Move Page Object to helpers/** (Recommended)
```bash
cd backend/tests/e2e
mv page-objects/GMScannerPage.js helpers/page-objects/
rmdir page-objects  # If empty
```

**Option B: Update import path**
```javascript
// In scanner-init.js line 10
const { GMScannerPage } = require('../../page-objects/GMScannerPage');
```

**Decision Criteria**: Use **Option A** (move file) because:
- `helpers/page-objects/` already has `PlayerScannerPage.js`
- Keeps page objects co-located with helper functions
- Less import path confusion

**Tasks**:
1. Move `backend/tests/e2e/page-objects/GMScannerPage.js` → `backend/tests/e2e/helpers/page-objects/GMScannerPage.js`
2. Delete empty `backend/tests/e2e/page-objects/` directory
3. Verify import works:
   ```bash
   cd backend
   npm run test:e2e -- duplicate-detection --dry-run
   # Should not show import errors
   ```

**Acceptance Criteria**:
- [ ] Import error gone
- [ ] Tests can load GMScannerPage
- [ ] No path confusion

---

### Phase B3: Add Missing Page Object Methods

**Goal**: Implement Page Object methods required by backend E2E tests

**File**: `backend/tests/e2e/helpers/page-objects/GMScannerPage.js`

**Missing Methods** (identified from scanner-init.js and test analysis):
1. `manualConnect(url, stationName, password)` - Networked mode connection
2. `waitForConnection()` - Wait for WebSocket connected state
3. `disconnectWebSocket()` - Trigger disconnection (for reconnection tests)
4. `reconnectWebSocket()` - Trigger reconnection
5. `getErrorMessage()` - Read error toast/alert
6. `getConnectionStatus()` - Read connection indicator

**Implementation**:

```javascript
/**
 * Manual connection to orchestrator (networked mode)
 * @param {string} url - Orchestrator URL (e.g., 'https://localhost:3000')
 * @param {string} stationName - Station identifier
 * @param {string} password - Admin password
 */
async manualConnect(url, stationName, password) {
  // Wait for connection modal to appear
  await this.page.waitForSelector('#connectionModal', { state: 'visible', timeout: 5000 });

  // Fill connection form using data-action attributes
  await this.page.fill('input[name="orchestratorUrl"]', url);
  await this.page.fill('input[name="stationName"]', stationName);
  await this.page.fill('input[name="password"]', password);

  // Submit connection form
  await this.page.click('button[data-action="connection.connect"]');
}

/**
 * Wait for WebSocket connection established
 * @param {number} timeout - Max wait time in ms (default 10000)
 */
async waitForConnection(timeout = 10000) {
  // Wait for connection status indicator to show "Connected"
  await this.page.waitForFunction(() => {
    const statusElement = document.querySelector('#connectionStatus');
    if (!statusElement) return false;

    const statusText = statusElement.textContent.toLowerCase();
    return statusText.includes('connected') && !statusText.includes('disconnected');
  }, { timeout });

  // Additional verification: wait for team entry screen (session created)
  await this.teamEntryScreen.waitFor({ state: 'visible', timeout: 5000 });
}

/**
 * Disconnect WebSocket (for testing reconnection scenarios)
 * Uses DOM-based disconnection (no window globals)
 */
async disconnectWebSocket() {
  // Navigate to admin panel
  const adminTab = this.page.locator('[data-view="admin"]');
  if (await adminTab.isVisible()) {
    await adminTab.click();
    await this.adminView.waitFor({ state: 'visible', timeout: 5000 });

    // Click disconnect button in admin panel
    await this.page.click('button[data-action="connection.disconnect"]');

    // Wait for disconnected status
    await this.page.waitForFunction(() => {
      const statusElement = document.querySelector('#connectionStatus');
      return statusElement && statusElement.textContent.toLowerCase().includes('disconnected');
    }, { timeout: 5000 });
  } else {
    throw new Error('Admin panel not available - cannot disconnect via DOM');
  }
}

/**
 * Reconnect WebSocket after disconnection
 */
async reconnectWebSocket() {
  // Admin panel should still be visible from disconnectWebSocket()
  await this.page.click('button[data-action="connection.reconnect"]');
  await this.waitForConnection();

  // Return to scanner view
  await this.page.click('[data-view="scanner"]');
  await this.scannerView.waitFor({ state: 'visible', timeout: 5000 });
}

/**
 * Get error message from toast or inline error display
 * @returns {Promise<string|null>} Error message text, or null if no error visible
 */
async getErrorMessage() {
  // Check for toast notification
  const toastError = this.page.locator('.toast.error:visible').first();
  if (await toastError.isVisible()) {
    return await toastError.textContent();
  }

  // Check for inline error message
  const inlineError = this.page.locator('.error-message:visible').first();
  if (await inlineError.isVisible()) {
    return await inlineError.textContent();
  }

  // Check for result screen error
  const resultError = this.page.locator('#resultScreen.active .error-text');
  if (await resultError.isVisible()) {
    return await resultError.textContent();
  }

  return null;
}

/**
 * Get connection status text
 * @returns {Promise<string>} Connection status (e.g., "Connected", "Disconnected", "Connecting...")
 */
async getConnectionStatus() {
  const statusElement = this.page.locator('#connectionStatus');
  if (await statusElement.isVisible()) {
    return await statusElement.textContent();
  }
  return 'Unknown';
}
```

**Tasks**:
1. Add methods to `GMScannerPage.js`
2. Add corresponding locators to constructor:
   ```javascript
   constructor(page) {
     // ... existing locators ...

     // Connection wizard and status
     this.connectionModal = page.locator('#connectionModal');
     this.connectionStatus = page.locator('#connectionStatus');

     // View tabs (networked mode only)
     this.adminTab = page.locator('[data-view="admin"]');
     this.scannerTab = page.locator('[data-view="scanner"]');

     // Error displays
     this.errorToast = page.locator('.toast.error:visible');
     this.errorMessage = page.locator('.error-message:visible');
   }
   ```

3. Verify methods work with manual test:
   ```bash
   # Start backend
   npm run dev:full

   # In separate terminal, run single test
   npm run test:e2e -- duplicate-detection --grep "reconnection"
   ```

**Acceptance Criteria**:
- [ ] All 6 methods implemented and tested
- [ ] Methods use DOM interaction only (no window globals)
- [ ] Methods handle timeouts gracefully
- [ ] Reconnection test passes

**Engineering Note**: These methods honor the "No Window Globals" principle by using DOM selectors and data-action attributes exclusively.

---

### Phase B4: Remove Window Global Usage from Tests

**Goal**: Eliminate all `window.XXX` references from backend E2E test code

**Files**:
- `backend/tests/e2e/flows/duplicate-detection.spec.js` (lines 247-248, 262-263, 307-308)

**Changes**:

**Change 1: Disconnect WebSocket** (lines 246-250)
```javascript
// BEFORE
await page.evaluate(() => {
  if (window.connectionManager?.client?.socket) {
    window.connectionManager.client.socket.close();
  }
});

// AFTER
await scanner.disconnectWebSocket();  // Uses new Page Object method
```

**Change 2: Reconnect WebSocket** (lines 261-265)
```javascript
// BEFORE
await page.evaluate(() => {
  if (window.connectionManager) {
    window.connectionManager.connect();
  }
});

// AFTER
await scanner.reconnectWebSocket();  // Uses new Page Object method
```

**Change 3: UIManager.updateScoreboard Workaround** (lines 306-310)
```javascript
// BEFORE
await page.evaluate(() => {
  if (!window.UIManager.updateScoreboard) {
    window.UIManager.updateScoreboard = () => {};
  }
});

// AFTER
// DELETE ENTIRELY - This is a scanner bug that should be fixed, not worked around
// Fix will be applied in Phase S2: Scanner Bug Fixes
```

**Tasks**:
1. Update `duplicate-detection.spec.js` with changes above
2. Search for other window global usage:
   ```bash
   cd backend/tests/e2e
   grep -rn "window\." flows/ helpers/
   # Fix any additional instances found
   ```

3. Verify tests run without window global errors:
   ```bash
   npm run test:e2e -- duplicate-detection
   # Should not see "Cannot read property 'client' of undefined"
   ```

**Acceptance Criteria**:
- [ ] No `window.XXX` usage in test code
- [ ] Tests use Page Object methods for all interactions
- [ ] Reconnection test passes
- [ ] No TypeError about undefined properties

---

### Phase B5: Fix Score Verification for Networked Mode

**Goal**: Read team scores from authoritative source (backend session), not client-side DOM

**File**: `backend/tests/e2e/helpers/scanner-init.js` (lines 74-104)

**Current Problem**:
- Networked mode reads from **scoreboard DOM** (client-side UI)
- DOM may be stale or not updated immediately
- Duplicate rejections don't update scoreboard instantly
- Creates false positives/negatives in tests

**Solution**: Read from backend session via WebSocket state

**Implementation**:

```javascript
/**
 * Get team score from authoritative source
 *
 * IMPORTANT: This function reads production's calculated scores.
 * It does NOT recalculate scores (that would be testing test logic, not production).
 *
 * @param {Page} page - Playwright page
 * @param {string} teamId - Team ID to get score for
 * @param {string} sessionMode - 'standalone' or 'networked'
 * @param {Socket} socket - Socket.io client (required for networked mode)
 * @returns {Promise<number>} Team score
 */
async function getTeamScore(page, teamId, sessionMode, socket = null) {
  if (sessionMode === 'standalone') {
    // Standalone: read production's calculated score from localStorage
    // StandaloneDataManager should have calculated and saved this
    return await page.evaluate((tid) => {
      const sessionData = JSON.parse(localStorage.getItem('standaloneSession') || '{}');
      const team = sessionData.teams?.[tid];

      // ONLY read production's calculation - no fallback recalculation
      // If this is 0/undefined, test SHOULD FAIL (indicates production bug)
      return team?.score || 0;
    }, teamId);
  } else {
    // Networked: read from backend session via WebSocket (authoritative source)
    if (!socket) {
      throw new Error('Socket required for networked mode score verification');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for session state sync'));
      }, 5000);

      // Listen for sync:full event (contains full session state)
      socket.once('sync:full', (event) => {
        clearTimeout(timeout);

        const session = event.data.session;
        if (!session || !session.teams) {
          reject(new Error('Invalid session data in sync:full event'));
          return;
        }

        // Find team in session
        const team = session.teams.find(t => t.id === teamId);
        if (!team) {
          resolve(0);  // Team not found = 0 score
          return;
        }

        // Return authoritative score from backend
        resolve(team.score || 0);
      });

      // Request state sync from backend
      socket.emit('gm:command', {
        event: 'gm:command',
        data: {
          action: 'state:sync',
          payload: {}
        },
        timestamp: new Date().toISOString()
      });
    });
  }
}
```

**Tasks**:
1. Update `scanner-init.js` with new implementation
2. Update test files to pass socket parameter:
   ```javascript
   // In test file setup
   let socket;
   beforeAll(async () => {
     socket = await connectWithAuth(orchestratorUrl, password, stationName, 'gm');
   });

   // In test
   const score = await getTeamScore(page, '001', 'networked', socket);
   ```

3. Verify score reads are accurate:
   ```bash
   npm run test:e2e -- 07b-gm-scanner-networked-blackmarket
   # Scores should match backend calculations exactly
   ```

**Acceptance Criteria**:
- [ ] Networked mode reads from backend session (not DOM)
- [ ] Standalone mode unchanged (localStorage correct)
- [ ] Duplicate rejections detected correctly (score doesn't change)
- [ ] Tests verify backend calculations, not client-side UI

**Engineering Note**: This change aligns with the "Contract-First Architecture" principle - backend session is source of truth for networked mode.

---

### Phase B6: Run Full Backend E2E Test Suite

**Goal**: Validate all backend E2E tests pass with aligned scanner

**Prerequisites**:
- [x] Phase B1: ES6 scanner deployed
- [x] Phase B2: Import paths fixed
- [x] Phase B3: Page Object methods added
- [x] Phase B4: Window globals removed
- [x] Phase B5: Score verification fixed

**Test Suites**:
1. **Smoke Test** (`00-smoke-test.test.js`)
   - Basic connectivity
   - Scanner loads
   - Game mode selection works

2. **Duplicate Detection** (`duplicate-detection.spec.js`)
   - Duplicate markers in all views
   - Persistence across reconnection
   - Standalone vs networked mode

3. **Networked Mode - Black Market** (`07b-gm-scanner-networked-blackmarket.test.js`)
   - Single token scan (Personal, Business)
   - Group completion with multiplier
   - Same-team duplicate rejection
   - Cross-team duplicate rejection

4. **Networked Mode - Scoring Parity** (`07c-gm-scanner-scoring-parity.test.js`)
   - Detective vs Black Market mode scoring
   - Ensure backend calculations match across modes

5. **Standalone Mode - Black Market** (`07a-gm-scanner-standalone-blackmarket.test.js`)
   - Offline scanning workflow
   - Local scoring calculations
   - No backend dependency

**Execution**:
```bash
cd backend

# Start orchestrator + VLC
npm run dev:full

# Run full E2E suite (in separate terminal)
npm run test:e2e

# Or run individual suites
npm run test:e2e -- 00-smoke-test
npm run test:e2e -- duplicate-detection
npm run test:e2e -- 07a-gm-scanner-standalone
npm run test:e2e -- 07b-gm-scanner-networked
npm run test:e2e -- 07c-gm-scanner-scoring-parity
```

**Success Criteria**:
- [ ] All smoke tests pass
- [ ] All duplicate detection tests pass
- [ ] All networked mode tests pass
- [ ] All standalone mode tests pass
- [ ] All scoring parity tests pass
- [ ] No flaky tests (run 3x to confirm)
- [ ] Test execution time <5 minutes

**Failure Handling**:
- If test fails, investigate root cause
- Determine if it's a scanner bug, test bug, or architectural issue
- Fix according to architectural principles (no workarounds)
- Re-run full suite after each fix

---

## Scanner Bug Fixes

**Context**: Backend E2E investigation revealed scanner implementation bugs that should be fixed (not worked around in tests).

### Phase S1: Fix UIManager.updateScoreboard Missing Method

**Problem**: Standalone mode references `UIManager.updateScoreboard()` but method doesn't exist

**Evidence**: Backend E2E test workaround (duplicate-detection.spec.js:307-308)

**Root Cause**: StandaloneDataManager emits `standalone:scores-updated` event, but UIManager doesn't have corresponding handler

**Location**: `ALNScanner-es6-migration/src/ui/uiManager.js`

**Investigation**:
1. Check if method exists:
   ```bash
   cd ALNScanner-es6-migration
   grep -n "updateScoreboard" src/ui/uiManager.js
   # If not found, method is missing
   ```

2. Check where it's called:
   ```bash
   grep -rn "updateScoreboard" src/
   # Identify all call sites
   ```

**Fix**:

If method is missing, add it:
```javascript
// In UIManager class (src/ui/uiManager.js)

/**
 * Update scoreboard display
 * Called when team scores change (networked or standalone mode)
 */
updateScoreboard() {
  const scoreboardContainer = document.getElementById('scoreboardContainer');
  if (!scoreboardContainer) return;  // Scoreboard not visible

  // Get current session mode
  const sessionMode = this.sessionModeManager?.mode || 'standalone';

  if (sessionMode === 'standalone') {
    // Render standalone scoreboard
    this.renderStandaloneScoreboard();
  } else {
    // Render networked scoreboard (already implemented as renderScoreboard)
    this.renderScoreboard();
  }
}

/**
 * Render standalone mode scoreboard
 * Reads from standaloneDataManager
 */
renderStandaloneScoreboard() {
  const scoreboardContainer = document.getElementById('scoreboardContainer');
  if (!scoreboardContainer) return;

  // Get session data from standaloneDataManager
  const sessionData = this.standaloneDataManager.getSessionData();
  if (!sessionData || !sessionData.teams) {
    scoreboardContainer.innerHTML = '<p class="no-data">No teams scanned yet</p>';
    return;
  }

  // Sort teams by score (descending)
  const teams = Object.values(sessionData.teams).sort((a, b) => b.score - a.score);

  // Render scoreboard
  scoreboardContainer.innerHTML = teams.map((team, index) => `
    <div class="scoreboard-entry ${index === 0 ? 'first-place' : ''}">
      <span class="scoreboard-rank">${index + 1}</span>
      <span class="scoreboard-team">${team.id}</span>
      <span class="scoreboard-score">${team.score.toLocaleString()}</span>
    </div>
  `).join('');
}
```

If method exists but is broken, fix the implementation according to above logic.

**Tasks**:
1. Investigate current state of method
2. Add or fix `updateScoreboard()` method
3. Ensure it handles both standalone and networked modes
4. Add event listener in main.js:
   ```javascript
   // In main.js event wiring section
   StandaloneDataManager.addEventListener('standalone:scores-updated', () => {
     UIManager.updateScoreboard();
   });
   ```

5. Test in standalone mode:
   ```bash
   npm run dev
   # Manual test:
   # 1. Select standalone mode
   # 2. Scan tokens
   # 3. Open scoreboard
   # 4. Verify scores display correctly
   ```

6. Verify no errors in console when scoreboard not visible

**Acceptance Criteria**:
- [ ] `updateScoreboard()` method exists and works
- [ ] Standalone mode scoreboard renders correctly
- [ ] Networked mode scoreboard unchanged
- [ ] No console errors
- [ ] Backend E2E test workaround can be removed

---

### Phase S2: Add Disconnect/Reconnect UI Controls (Optional)

**Problem**: Tests need to trigger disconnection/reconnection, but no UI controls exist

**Current Workaround**: Tests use `scanner.disconnectWebSocket()` which navigates to admin panel

**Better Solution**: Add explicit disconnect/reconnect buttons in admin panel

**Location**: `ALNScanner-es6-migration/index.html` (admin panel section)

**Priority**: **LOW** (workaround is acceptable for E2E testing)

**Decision**: **SKIP FOR NOW** - Page Object method using admin panel is sufficient for testing. Add in future PR if needed for production debugging.

**Rationale**:
- E2E tests can use existing admin panel navigation
- Adding UI controls is feature work, not bug fix
- Doesn't block PR or production readiness

---

## Testing Strategy

### Test Pyramid

```
┌─────────────────────────────────────────────────────────────┐
│ L4: Manual E2E (Android Device) - 2 hours                  │
│ - Real NFC workflow, network failures, human validation     │
└─────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────────────────────────────────────┐
│ L3: Backend E2E Tests - ~5 min                              │
│ - Real orchestrator + browser, validates AsyncAPI contract │
│ - AUTHORITATIVE for networked mode                          │
└─────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────────────────────────────────────┐
│ L2: Scanner E2E Tests (Standalone) - ~30 sec               │
│ - Complete user journey, no backend, validates UI/UX       │
└─────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────────────────────────────────────┐
│ L1: Scanner Smoke Tests - ~10 sec                          │
│ - Module loading, critical bug regression, no window globals│
└─────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────────────────────────────────────┐
│ Unit Tests (Jest) - ~15 sec                                 │
│ - 598 tests, >80% coverage, validates business logic       │
└─────────────────────────────────────────────────────────────┘
```

### Execution Order

**Every Code Change**:
1. Unit tests (`npm test`) - Fast feedback
2. L1 smoke tests (scanner E2E) - Prevent regressions

**Before Commit**:
3. L2 standalone tests (scanner E2E) - Validate UI workflows
4. Backend contract tests (`cd backend && npm run test:contract`) - Ensure no breaking changes

**Before Push**:
5. L3 backend E2E tests (`cd backend && npm run test:e2e`) - Validate networked mode

**Before PR**:
6. Full test suite (unit + contract + backend E2E)
7. Production build validation
8. L4 manual E2E (on real device) - Final verification

### Test Verification Script

Create `ALNScanner-es6-migration/scripts/verify-all-tests.sh`:
```bash
#!/bin/bash
set -e  # Exit on first error

echo "========================================="
echo "Test Verification Suite"
echo "========================================="

echo ""
echo "1/6: Unit Tests (Jest)..."
npm test

echo ""
echo "2/6: L1 Smoke Tests (Playwright)..."
npx playwright test tests/e2e/specs/00-smoke.spec.js

echo ""
echo "3/6: L2 Standalone Tests (Playwright)..."
npx playwright test tests/e2e/specs/02-standalone-mode.spec.js

echo ""
echo "4/6: Backend Contract Tests..."
cd ../backend
npm run test:contract

echo ""
echo "5/6: Backend E2E Tests..."
# Start orchestrator in background
npm run dev:full &
ORCHESTRATOR_PID=$!
sleep 10  # Wait for orchestrator to start

# Run E2E tests
npm run test:e2e

# Cleanup
kill $ORCHESTRATOR_PID

echo ""
echo "6/6: Production Build Verification..."
cd ../ALNScanner-es6-migration
npm run build
npm run preview &
PREVIEW_PID=$!
sleep 5

# Run E2E against production build
npx playwright test

# Cleanup
kill $PREVIEW_PID

echo ""
echo "========================================="
echo "✅ ALL TESTS PASSED"
echo "========================================="
```

---

## PR Preparation Checklist

### Pre-Commit Checklist (Before Each Commit)
- [ ] Code formatted (run linter if available)
- [ ] No console.log statements (except Debug.log)
- [ ] No commented-out code
- [ ] Unit tests pass (`npm test`)
- [ ] L1 smoke tests pass

### Pre-Push Checklist (Before git push)
- [ ] All tests pass (unit + E2E + contract)
- [ ] No merge conflicts with main
- [ ] Commit messages follow convention (e.g., `feat:`, `fix:`, `refactor:`)
- [ ] No secrets or sensitive data in commits

### Pre-PR Checklist (Before Creating PR)
- [ ] All phases complete (7.2, 8, 9, B1-B6, S1)
- [ ] Full test suite passes (verify-all-tests.sh)
- [ ] Production build validated
- [ ] Documentation updated (README, CLAUDE.md, MIGRATION.md)
- [ ] CHANGELOG.md updated (if applicable)
- [ ] Manual E2E testing complete (L4)
- [ ] Clean git history (squash if needed)
- [ ] PR description written (see template below)

### PR Description Template

```markdown
# [ALNScanner] Complete ES6 Module Migration & Backend E2E Alignment

## Overview
Complete migration from legacy script tag architecture to modern ES6 modules with Vite build system, event-driven coordination, and comprehensive E2E testing.

## Architectural Changes

### ES6 Module Architecture
- ✅ Pure ES6 modules (no window globals)
- ✅ Event-driven coordination (EventTarget pattern)
- ✅ Dependency injection (constructor parameters)
- ✅ Single Responsibility Principle throughout
- ✅ Vite build system with hot reload

### Backend E2E Alignment
- ✅ Tests use Page Object pattern (DOM interaction only)
- ✅ No window global usage in tests or production code
- ✅ Score verification reads from authoritative source (backend session)
- ✅ Scanner bugs fixed (not worked around)

## Testing Results

**Unit Tests (Jest)**:
- 598 tests passing
- >80% coverage (lines, functions, branches >70%)

**Scanner E2E Tests (Playwright)**:
- L1 Smoke: 7 tests passing
- L2 Standalone: 5+ tests passing
- No window globals, pure DOM interaction

**Backend E2E Tests**:
- All flows passing (duplicate detection, networked mode, standalone mode)
- AsyncAPI contract compliance validated (141 tests)

**Production Build**:
- Bundle size: ~XXX KB (gzipped)
- E2E tests pass against production build
- No console errors

## Breaking Changes
None for end users. Developers must:
- Use `npm run dev` (not opening index.html directly)
- Import modules (not rely on window.XXX globals)

## Migration Path
See `MIGRATION.md` for:
- Breaking changes detail
- Rollback procedures
- Developer workflow changes

## Manual Testing Completed
- [x] Standalone mode workflow (team entry → scan → results → history)
- [x] Networked mode connection and scanning
- [x] Token database loading from submodule
- [x] Duplicate detection (standalone and networked)
- [x] Mode toggling (detective/blackmarket)
- [x] Page reload persistence
- [x] Production build (npm run build && npm run preview)

## Rollback Plan
If critical issues after merge:
```bash
git checkout pre-es6-migration  # Tag created before migration
git push origin main --force
```

## Related Documents
- Architecture plan: `docs/plans/ARCHITECTURE_REFACTORING_2025-11.md`
- Implementation plan: `docs/plans/2025-11-11-es6-module-migration.md`
- Completion plan: `docs/plans/2025-11-11-phase7-9-completion.md`
- Action plan: `docs/plans/COMPREHENSIVE_ACTION_PLAN.md`
- Backend E2E analysis: `../../BACKEND_E2E_ALIGNMENT_ANALYSIS.md`

---

**Ready for code review**. All tests passing, documentation complete, production validated.
```

---

## Rollback Plan

### Rollback Points

**Point 1: Before Phase 7.2** (Current State)
- Can abandon remaining E2E tests
- Merge current state (Phase 7.1 complete)
- Minimal risk

**Point 2: After Backend E2E Alignment**
- Can revert backend changes only
- Keep scanner ES6 work
- Low risk

**Point 3: After Scanner Bug Fixes**
- Can revert specific bug fixes
- Keep architecture changes
- Medium risk

**Point 4: Before Merge to Main** (CRITICAL)
- Full branch revert possible
- No impact on production
- Zero risk

### Rollback Procedures

**Rollback Scanner to Pre-ES6**:
```bash
cd ALNScanner-es6-migration
git checkout pre-es6-migration  # Tag created in Phase 0
git push origin feature/es6-module-migration --force
```

**Rollback Backend E2E Changes Only**:
```bash
cd backend
git checkout main -- tests/e2e/
git add tests/e2e/
git commit -m "revert: rollback E2E test changes"
```

**Rollback Deployed Scanner**:
```bash
cd backend/public
rm gm-scanner  # Remove symlink
ln -s ../../ALNScanner gm-scanner  # Restore original
```

**Full Branch Abandonment**:
```bash
git branch -D feature/es6-module-migration
git worktree remove ../ALNScanner-es6-migration
```

### Decision Criteria for Rollback

**Immediate Rollback Required If**:
- Production outage caused by changes
- >50% test failure rate
- Critical security vulnerability introduced
- Data corruption or loss

**Partial Rollback Considered If**:
- Single test suite failing consistently
- Performance regression >2x slower
- Specific feature broken

**No Rollback Needed If**:
- Flaky test (passes on retry)
- Minor UI issue (can fix forward)
- Documentation error

---

## Success Criteria

### Technical Success
- [ ] All unit tests passing (598 tests, >80% coverage)
- [ ] All scanner E2E tests passing (L1 + L2)
- [ ] All backend E2E tests passing (L3)
- [ ] All backend contract tests passing (141 tests)
- [ ] Production build successful (<500KB)
- [ ] No window globals in production or test code
- [ ] No console errors in production build
- [ ] Manual E2E validation complete (L4)

### Architectural Success
- [ ] Single Responsibility Principle enforced
- [ ] Event-driven coordination implemented
- [ ] Dependency injection throughout
- [ ] No window global usage (production AND tests)
- [ ] Old anti-pattern tests removed (00-smoke.spec.js)
- [ ] AsyncAPI contract compliance maintained
- [ ] Test pyramid structure followed

### Process Success
- [ ] Clean git history (squashed if needed)
- [ ] Comprehensive PR description
- [ ] All documentation updated
- [ ] Rollback plan documented and tested
- [ ] Code review checklist complete

### Production Readiness
- [ ] Deployment strategy defined
- [ ] Monitoring plan in place (if applicable)
- [ ] Known issues documented
- [ ] User impact minimal (no breaking changes for end users)

---

## Execution Timeline

**Total Estimated Time**: 8-12 hours (1.5-2 days)
**Time Saved**: ~2.5 hours (Phase 7.2 ✅ complete, Phase 8 mostly done)

| Phase | Duration | Status | Parallel? | Dependencies |
|-------|----------|--------|-----------|--------------|
| 7.2: L2 Standalone Tests | ~~2 hours~~ | ✅ COMPLETE | N/A | None |
| 7.4: Cleanup Old Smoke Tests | 15 min | ❌ TODO | Yes | None |
| 8: Production Build Validation | ~~1 hour~~ 30 min | 🔶 PARTIAL | Yes | None |
| 9: Documentation | 1 hour | ❌ TODO | Yes | All phases |
| B1: Deploy Scanner | 15 min | ❌ TODO | No | None |
| B2: Fix Import Paths | 15 min | ❌ TODO | No | B1 |
| B3: Page Object Methods | 1 hour | ❌ TODO | No | B2 |
| B4: Remove Window Globals | 30 min | ❌ TODO | Yes | B3 |
| B5: Fix Score Verification | 30 min | ❌ TODO | Yes | B3 |
| B6: Run Backend E2E Suite | 30 min | ❌ TODO | No | B4, B5 |
| S1: Fix UIManager Bug | 1 hour | ❌ TODO | Yes | None |
| Testing & Validation | 2 hours | ❌ TODO | No | All |
| PR Preparation | 1 hour | ❌ TODO | No | All |

**Critical Path**: B1 → B2 → B3 → B6 (3 hours)
**Parallel Work**: Phases 7.4, 8, 9, S1 can run concurrently (saves ~1.5 hours)

---

## Next Steps

1. ✅ **Review this plan** with user → **CURRENT STEP**
2. **Execute phases** in priority order:
   - **Priority 1 (CRITICAL)**: Backend E2E Alignment (B1-B6) - ~3.5 hours
   - **Priority 2 (HIGH)**: Scanner Bug Fixes (S1) + Old Test Cleanup (7.4) - ~1.25 hours
   - **Priority 3 (MEDIUM)**: Production Build Validation (8) - ~0.5 hours
   - **Priority 4 (LOW)**: Documentation (9) - ~1 hour

3. **Validate continuously**: Run tests after each phase
4. **Commit incrementally**: One commit per phase (clean history)
5. **Prepare PR**: Use checklist and template above

**Time Saved from Verification**: Phase 7.2 already complete (2 hours), Phase 8 mostly done (0.5 hours) = 2.5 hours saved

---

**Document Status**: ✅ COMPLETE - Ready for execution
**Last Updated**: 2025-11-11
**Author**: Claude Code (with user guidance)

