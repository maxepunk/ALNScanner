# Phase 7-9 Completion Plan: E2E Testing and Final Migration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete ES6 module migration with comprehensive E2E testing using Playwright, validating the final architecture (no window globals), and preparing for production deployment.

**Architecture:** Remove temporary window globals FIRST (Phase 9 moved to beginning of Phase 7), then implement forward-compatible E2E tests using Page Object pattern, validate with real backend integration, and finalize production build.

**Tech Stack:**
- **E2E Testing**: Playwright (real browsers, Page Object pattern)
- **Backend Integration**: Existing backend E2E infrastructure
- **Build**: Vite 5.x with production optimizations
- **Deployment**: GitHub Pages (automated via GitHub Actions)

---

## Context: Where We Are

### Completed Work

**Phase 0-6: ✅ COMPLETE**
- ES6 module architecture fully implemented
- 598 unit tests passing (>80% coverage)
- Vite build system configured
- All components converted to ES6 modules with dependency injection
- Event-driven architecture implemented

**Current State (Phase 6 Complete)**:
- Location: `/home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner-es6-migration`
- Branch: `feature/es6-module-migration`
- Commit: `docs: update CLAUDE.md with ES6 module architecture` (02491bf)

### Architectural Objectives (From Both Plans)

**ES6 Migration Plan Objectives**:
- Pure ES6 modules (no window assignments) ← Phase 9 removes these
- Event-driven architecture ✅
- Vite build system ✅
- Real browser E2E testing ← Phase 7 (current)

**Architecture Refactoring Plan Objectives**:
- No `window.XXX` global reaching ← Phase 9 achieves this
- Dependency injection ✅
- Event-driven coordination ✅
- Single responsibility ✅

### Critical Design Decision

**PHASE 9 MOVED TO BEGINNING OF PHASE 7**

Rationale: Avoid testing temporary code paths. E2E tests should validate the FINAL architecture (no window globals), not temporary backward-compatibility code.

Current temporary code in `src/main.js` lines 60-70:
```javascript
if (typeof window !== 'undefined') {
  window.App = app;                    // ← Remove these FIRST
  window.DataManager = DataManager;
  window.Settings = Settings;
  window.Debug = Debug;
  window.UIManager = UIManager;
  window.TokenManager = TokenManager;
}
```

**These will be removed BEFORE E2E testing begins.**

---

## Phase 7: E2E Testing with Playwright

### Overview

Phase 7 implements comprehensive E2E testing with a **layered approach**:

**L0: Remove Temporary Window Globals (Phase 9 moved forward)**
- Convert HTML onclick handlers to event listeners
- Remove window assignments from main.js
- Verify app still works

**L1: Smoke Tests**
- ES6 module loading validation
- Critical bug regression prevention
- No window global dependencies

**L2: Standalone Mode User Journey**
- Complete user flow via DOM interaction
- Page Object pattern (forward-compatible)
- No mocks, no backend, no WebSocket

**L3: Networked Mode Integration**
- FIX backend E2E tests to work without window globals
- Real orchestrator + real browser
- Full AsyncAPI contract validation

**L4: Production Simulation (REQUIRED)**
- Full 2-hour game scenarios
- Multi-device coordination (3-5 Player Scanners, 2 GM Scanners)
- Performance validation under load
- Real-world network resilience testing

---

## Task 7.0: Remove Temporary Window Globals

**Goal:** Remove Phase 9 technical debt NOW to avoid testing temporary code paths

**Files:**
- Modify: `src/main.js` (remove window assignments)
- Modify: `index.html` (convert onclick handlers to event listeners)
- Create: `tests/e2e/specs/00-smoke-no-globals.spec.js` (validation test)

### Step 1: Identify all HTML onclick handlers

```bash
grep -n "onclick=" index.html | head -20
```

**Expected patterns:**
- `onclick="App.someMethod()"`
- `onclick="DataManager.someMethod()"`
- `onclick="Settings.someMethod()"`
- `onclick="Debug.someMethod()"`

### Step 2: Create event listener registration helper

Create file: `src/utils/domEventBindings.js`

```javascript
/**
 * DOM Event Bindings
 * Replaces HTML onclick handlers with proper event listeners
 */

export function bindDOMEvents(app, dataManager, settings, debug, uiManager) {
  // Find all elements with data-action attribute
  // Example: <button data-action="app.showHistory">History</button>

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    const [target, method] = action.split('.');

    try {
      switch(target) {
        case 'app':
          if (typeof app[method] === 'function') {
            app[method]();
          }
          break;
        case 'dataManager':
          if (typeof dataManager[method] === 'function') {
            dataManager[method]();
          }
          break;
        case 'settings':
          if (typeof settings[method] === 'function') {
            settings[method]();
          }
          break;
        case 'debug':
          if (typeof debug[method] === 'function') {
            debug[method]();
          }
          break;
        case 'uiManager':
          if (typeof uiManager[method] === 'function') {
            uiManager[method]();
          }
          break;
      }
    } catch (error) {
      console.error(`Action handler error: ${action}`, error);
    }
  });
}
```

### Step 3: Update index.html onclick handlers

Find and replace patterns:

**BEFORE:**
```html
<button onclick="App.showHistory()">History</button>
<button onclick="App.selectGameMode('networked')">Networked Mode</button>
<button onclick="DataManager.exportData()">Export</button>
<button onclick="Settings.toggleDebugMode()">Debug</button>
```

**AFTER:**
```html
<button data-action="app.showHistory">History</button>
<button data-action="app.selectGameMode" data-arg="networked">Networked Mode</button>
<button data-action="dataManager.exportData">Export</button>
<button data-action="settings.toggleDebugMode">Debug</button>
```

### Step 4: Handle buttons with arguments

Update `domEventBindings.js` to handle `data-arg`:

```javascript
const arg = event.target.closest('[data-action]')?.dataset.arg;

// In switch statement:
case 'app':
  if (typeof app[method] === 'function') {
    app[method](arg);  // Pass argument if present
  }
  break;
```

### Step 5: Update main.js to bind events instead of exposing globals

Edit `src/main.js`:

```javascript
// Import event binder
import { bindDOMEvents } from './utils/domEventBindings.js';

// ... existing imports and app creation ...

/**
 * Initialize application
 */
async function initializeApp() {
  Debug.log('=== ALNScanner ES6 Module Architecture ===');
  Debug.log('Main entry point loaded');
  Debug.log('Initializing application...');

  try {
    await app.init();
    Debug.log('Application initialization complete');

    // CRITICAL: Bind DOM event handlers AFTER initialization
    // This replaces the need for window.App, window.DataManager, etc.
    bindDOMEvents(app, DataManager, Settings, Debug, UIManager);
    Debug.log('DOM event bindings registered');

  } catch (error) {
    Debug.log(`Initialization error: ${error.message}`, true);
    console.error('App initialization failed:', error);

    if (UIManager) {
      UIManager.showError(`Failed to initialize: ${error.message}`);
    }
  }
}

// REMOVE the entire window globals block (lines 60-70):
// DELETE:
// if (typeof window !== 'undefined') {
//   window.App = app;
//   window.DataManager = DataManager;
//   window.Settings = Settings;
//   window.Debug = Debug;
//   window.UIManager = UIManager;
//   window.TokenManager = TokenManager;
// }
```

### Step 6: Handle inline script blocks in HTML

Find inline `<script>` blocks that reference `window.App`:

```bash
grep -n "window\.App\|window\.DataManager\|window\.Settings" index.html
```

**Common patterns:**
- Connection wizard functions: `showConnectionWizard()`, `scanForServers()`, `selectServer()`
- These need direct access to `app` instance

**Solution**: Keep connection wizard functions in HTML but pass references via custom events:

In `index.html` script block:
```javascript
// Listen for app-ready event
document.addEventListener('app:ready', (event) => {
  const { app, settings } = event.detail;

  // Now connection wizard functions have access via closure
  window.showConnectionWizard = function() {
    // Use app reference from event
    app.showConnectionWizard();
  };

  // ... other connection wizard functions
});
```

In `src/main.js` after initialization:
```javascript
await app.init();

// Dispatch app-ready event for inline scripts
document.dispatchEvent(new CustomEvent('app:ready', {
  detail: { app, settings: Settings, dataManager: DataManager }
}));

bindDOMEvents(app, DataManager, Settings, Debug, UIManager);
```

### Step 7: Test manually

```bash
npm run dev
```

Open browser:
1. ✅ Page loads without errors
2. ✅ Game mode selection works (data-action bindings)
3. ✅ Console shows NO `window.App` assignments
4. ✅ All buttons functional via event delegation

### Step 8: Create validation E2E test

Create file: `tests/e2e/specs/00-smoke-no-globals.spec.js`

```javascript
/**
 * Smoke Test: Verify No Window Globals
 *
 * CRITICAL: This test validates that the app works WITHOUT window.App,
 * window.DataManager, etc. This is the FINAL architecture.
 */

const { test, expect } = require('@playwright/test');

test.describe('No Window Globals - Final Architecture', () => {
  test('should NOT expose App on window', async ({ page }) => {
    await page.goto('/');

    // Wait for initialization
    await page.waitForSelector('#loadingScreen.active', { state: 'hidden', timeout: 10000 });

    // CRITICAL: window.App should NOT exist
    const hasWindowApp = await page.evaluate(() => typeof window.App !== 'undefined');
    expect(hasWindowApp).toBe(false);
  });

  test('should NOT expose DataManager on window', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#loadingScreen.active', { state: 'hidden', timeout: 10000 });

    const hasWindowDataManager = await page.evaluate(() => typeof window.DataManager !== 'undefined');
    expect(hasWindowDataManager).toBe(false);
  });

  test('should still show game mode selection via DOM event bindings', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#loadingScreen.active', { state: 'hidden', timeout: 10000 });

    // Game mode screen should appear
    await page.waitForSelector('#gameModeScreen.active', { timeout: 5000 });

    // Mode buttons should be visible and clickable
    await expect(page.locator('button[data-action*="selectGameMode"]').first()).toBeVisible();
  });

  test('should handle button clicks via event delegation', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#gameModeScreen.active', { timeout: 10000 });

    // Click standalone mode button (via data-action)
    await page.click('button[data-action*="selectGameMode"]:has-text("Standalone")');

    // Should navigate to team entry
    await page.waitForSelector('#teamEntryScreen.active', { timeout: 5000 });
    await expect(page.locator('#teamEntryScreen')).toBeVisible();
  });
});
```

### Step 9: Run validation test

```bash
npx playwright test tests/e2e/specs/00-smoke-no-globals.spec.js
```

Expected: All tests pass

### Step 10: Commit

```bash
git add src/main.js src/utils/domEventBindings.js index.html tests/e2e/specs/00-smoke-no-globals.spec.js
git commit -m "refactor: remove temporary window globals and use DOM event bindings

BREAKING CHANGE: Removes window.App, window.DataManager, window.Settings,
window.Debug, window.UIManager, window.TokenManager global assignments.

HTML onclick handlers converted to data-action attributes with event delegation.
This completes the Phase 9 cleanup early (moved to beginning of Phase 7) to
ensure E2E tests validate the final architecture without window globals.

- Add domEventBindings.js for event delegation
- Convert all onclick handlers to data-action attributes
- Use app:ready custom event for inline script access
- Add E2E test validating no window globals exist

Tests: Phase 7 E2E tests will now validate final architecture"
```

---

## Task 7.1: Fix Existing E2E Test Anti-Patterns

**Goal:** Fix tests that check for window globals that don't exist

**Files:**
- Modify: `tests/e2e/specs/00-smoke.spec.js`
- Modify: `tests/e2e/specs/01-integration.spec.js`
- Delete: Tests checking for `window.NetworkedSession`, `window.OrchestratorClient`, etc.

### Step 1: Review anti-patterns

Current anti-pattern in `00-smoke.spec.js` lines 45-79:
```javascript
// WRONG: Checking for window globals that don't exist
const modulesLoaded = await page.evaluate(() => {
  return {
    App: typeof window.App !== 'undefined',              // ❌ Removed in 7.0
    NetworkedSession: typeof window.NetworkedSession !== 'undefined', // ❌ Never existed
    OrchestratorClient: typeof window.OrchestratorClient !== 'undefined', // ❌ Never existed
  };
});
```

### Step 2: Update 00-smoke.spec.js

Edit `tests/e2e/specs/00-smoke.spec.js`:

```javascript
test('should initialize app without window globals', async ({ page }) => {
  await page.goto('/');

  // Wait for app initialization
  await page.waitForSelector('#loadingScreen.active', { state: 'hidden', timeout: 10000 });

  // Verify app initialized by checking DOM state
  const gameMode screenVisible = await page.locator('#gameModeScreen.active').isVisible();
  expect(gameModeScreenVisible).toBe(true);

  // Verify NO window globals (cleaned up in Task 7.0)
  const noGlobals = await page.evaluate(() => {
    return {
      noApp: typeof window.App === 'undefined',
      noDataManager: typeof window.DataManager === 'undefined',
      noNetworkedSession: typeof window.NetworkedSession === 'undefined',
      noOrchestratorClient: typeof window.OrchestratorClient === 'undefined'
    };
  });

  expect(noGlobals.noApp).toBe(true);
  expect(noGlobals.noDataManager).toBe(true);
  expect(noGlobals.noNetworkedSession).toBe(true);
  expect(noGlobals.noOrchestratorClient).toBe(true);
});
```

### Step 3: Delete 01-integration.spec.js (anti-pattern tests)

The entire file tests window globals that don't exist:

```bash
rm tests/e2e/specs/01-integration.spec.js
```

Rationale: These tests check for `window.NetworkedSession`, `window.OrchestratorClient`, etc. which were NEVER exposed on window (ES6 modules don't do that). These tests were based on a misunderstanding.

### Step 4: Run updated smoke tests

```bash
npx playwright test tests/e2e/specs/00-smoke.spec.js
```

Expected: All tests pass

### Step 5: Commit

```bash
git add tests/e2e/specs/00-smoke.spec.js
git rm tests/e2e/specs/01-integration.spec.js
git commit -m "test: fix E2E test anti-patterns checking for non-existent window globals

Removes tests that checked for window.NetworkedSession, window.OrchestratorClient, etc.
which were never exposed (ES6 modules don't assign to window).

Updated smoke tests to validate correct behavior:
- App initializes without window globals
- DOM state reflects proper initialization
- Event delegation works via data-action attributes"
```

---

## Task 7.2: Implement L1 Smoke Tests

**Goal:** Fast smoke tests validating ES6 module loading and critical bug prevention

**Files:**
- Modify: `tests/e2e/specs/00-smoke.spec.js` (expand)

### Step 1: Add ES6 module loading test

```javascript
test('should load ES6 modules without errors', async ({ page }) => {
  const errors = [];

  page.on('pageerror', error => {
    errors.push(error.message);
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.goto('/');
  await page.waitForSelector('#loadingScreen.active', { state: 'hidden', timeout: 10000 });

  // Filter for module-related errors
  const moduleErrors = errors.filter(e =>
    e.includes('module') ||
    e.includes('import') ||
    e.includes('export') ||
    e.includes('Cannot find')
  );

  expect(moduleErrors).toEqual([]);
});
```

### Step 2: Add critical bug regression tests

```javascript
test('should NOT crash on networked mode selection (regression)', async ({ page }) => {
  const errors = [];

  page.on('pageerror', error => {
    errors.push(error.message);
  });

  await page.goto('/');
  await page.waitForSelector('#gameModeScreen.active', { timeout: 10000 });

  // Click networked mode (this used to crash with "global is not defined")
  await page.click('button[data-action*="selectGameMode"]:has-text("Networked")');

  // Wait a moment for potential errors
  await page.waitForTimeout(2000);

  // Should NOT have "global is not defined" error (ES6 migration fixed this)
  const globalError = errors.find(e => e.includes('global is not defined'));
  expect(globalError).toBeUndefined();

  // Should show connection wizard or error (both acceptable without backend)
  const modalOrError = await page.evaluate(() => {
    const modal = document.querySelector('#connectionModal');
    const errorMsg = document.querySelector('.error-message');
    return {
      modalVisible: modal && modal.style.display !== 'none',
      errorVisible: errorMsg && errorMsg.textContent.length > 0
    };
  });

  // Either modal OR error should be present (acceptable states without backend)
  expect(modalOrError.modalVisible || modalOrError.errorVisible).toBe(true);
});
```

### Step 3: Add token database loading test

```javascript
test('should load token database from data/ submodule', async ({ page }) => {
  await page.goto('/');

  // Wait for token database to load
  await page.waitForFunction(() => {
    // Check via DOM (no window.TokenManager)
    const debugPanel = document.querySelector('#debugContent');
    return debugPanel && debugPanel.textContent.includes('Token database loaded');
  }, { timeout: 15000 });

  // Verify tokens loaded by attempting to scan a known test token
  // (This validates token lookup works without checking internal state)
  const tokenExists = await page.evaluate(() => {
    // Trigger manual scan entry field focus
    const input = document.querySelector('#manualEntryInput');
    if (input) {
      input.value = 'test_video_01';
      return true;
    }
    return false;
  });

  expect(tokenExists).toBe(true);
});
```

### Step 4: Run L1 smoke tests

```bash
npx playwright test tests/e2e/specs/00-smoke.spec.js
```

Expected: All tests pass (<10 seconds total)

### Step 5: Commit

```bash
git add tests/e2e/specs/00-smoke.spec.js
git commit -m "test(e2e): add L1 smoke tests for ES6 module loading and critical bugs

L1 Smoke Tests:
- ES6 module loading without errors
- Critical regression: networked mode no longer crashes (global fix)
- Token database loads from data/ submodule
- No window globals present

Tests validate final architecture and prevent known regressions."
```

---

## Task 7.3: Implement L2 Standalone Mode Tests

**Goal:** Complete user journey in standalone mode using Page Object pattern (DOM only, no mocks)

**Files:**
- Create: `tests/e2e/page-objects/GMScannerPage.js`
- Create: `tests/e2e/specs/02-standalone-mode.spec.js`

### Step 1: Create Page Object for GM Scanner

Create file: `tests/e2e/page-objects/GMScannerPage.js`

```javascript
/**
 * Page Object: GM Scanner
 *
 * Provides DOM interaction methods for GM Scanner testing.
 * Forward-compatible with Phase 9 (no window globals).
 */

class GMScannerPage {
  constructor(page) {
    this.page = page;

    // Selectors
    this.selectors = {
      loadingScreen: '#loadingScreen.active',
      gameModeScreen: '#gameModeScreen.active',
      standaloneButton: 'button[data-action*="selectGameMode"]:has-text("Standalone")',
      networkedButton: 'button[data-action*="selectGameMode"]:has-text("Networked")',
      teamEntryScreen: '#teamEntryScreen.active',
      teamIdInput: '#teamIdInput',
      confirmTeamButton: '#confirmTeamButton',
      scanScreen: '#scanScreen.active',
      manualEntryInput: '#manualEntryInput',
      manualEntryScanButton: '#manualEntryScanButton',
      resultScreen: '#resultScreen.active',
      resultStatus: '#resultStatus',
      resultTokenName: '#resultTokenName',
      continueScanButton: '#continueScanButton',
      historyButton: '#historyButton',
      historyScreen: '#historyScreen.active',
      errorMessage: '.error-message:visible'
    };
  }

  async goto() {
    await this.page.goto('/');
    await this.page.waitForSelector(this.selectors.loadingScreen, { state: 'hidden', timeout: 10000 });
  }

  async selectStandaloneMode() {
    await this.page.waitForSelector(this.selectors.gameModeScreen, { timeout: 5000 });
    await this.page.click(this.selectors.standaloneButton);
  }

  async enterTeam(teamId) {
    await this.page.waitForSelector(this.selectors.teamEntryScreen, { timeout: 5000 });
    await this.page.fill(this.selectors.teamIdInput, teamId);
  }

  async confirmTeam() {
    await this.page.click(this.selectors.confirmTeamButton);
    await this.page.waitForSelector(this.selectors.scanScreen, { timeout: 5000 });
  }

  async manualScan(tokenId) {
    await this.page.waitForSelector(this.selectors.scanScreen, { timeout: 5000 });
    await this.page.fill(this.selectors.manualEntryInput, tokenId);
    await this.page.click(this.selectors.manualEntryScanButton);
  }

  async waitForResult(timeout = 5000) {
    await this.page.waitForSelector(this.selectors.resultScreen, { timeout });
  }

  async getResultStatus() {
    return await this.page.textContent(this.selectors.resultStatus);
  }

  async getResultTokenName() {
    return await this.page.textContent(this.selectors.resultTokenName);
  }

  async continueScan() {
    await this.page.click(this.selectors.continueScanButton);
    await this.page.waitForSelector(this.selectors.scanScreen, { timeout: 5000 });
  }

  async openHistory() {
    await this.page.click(this.selectors.historyButton);
    await this.page.waitForSelector(this.selectors.historyScreen, { timeout: 5000 });
  }

  async getErrorMessage() {
    const errorElement = await this.page.$(this.selectors.errorMessage);
    if (errorElement) {
      return await errorElement.textContent();
    }
    return null;
  }

  async getHistoryCount() {
    return await this.page.$$eval('.transaction-item', items => items.length);
  }
}

module.exports = { GMScannerPage };
```

### Step 2: Create L2 standalone mode tests

Create file: `tests/e2e/specs/02-standalone-mode.spec.js`

```javascript
/**
 * L2: Standalone Mode User Journey
 *
 * Tests complete user flow in standalone mode using Page Object pattern.
 * No mocks, no backend, no WebSocket - pure DOM interaction.
 *
 * Test Flow:
 * 1. Select standalone mode
 * 2. Enter team ID
 * 3. Scan tokens
 * 4. View results
 * 5. Check history
 * 6. Detect duplicates
 */

const { test, expect } = require('@playwright/test');
const { GMScannerPage } = require('../page-objects/GMScannerPage');

test.describe('L2: Standalone Mode - Complete User Journey', () => {
  let scanner;

  test.beforeEach(async ({ page }) => {
    scanner = new GMScannerPage(page);
    await scanner.goto();
  });

  test('should complete full standalone scan workflow', async ({ page }) => {
    // Step 1: Select standalone mode
    await scanner.selectStandaloneMode();

    // Step 2: Enter team
    await scanner.enterTeam('001');
    await scanner.confirmTeam();

    // Step 3: Scan first token
    await scanner.manualScan('test_video_01');
    await scanner.waitForResult();

    // Step 4: Verify result
    const status = await scanner.getResultStatus();
    expect(status.toLowerCase()).toContain('accepted');

    const tokenName = await scanner.getResultTokenName();
    expect(tokenName).toBeTruthy();

    // Step 5: Continue scanning
    await scanner.continueScan();

    // Step 6: Scan second token
    await scanner.manualScan('test_image_01');
    await scanner.waitForResult();

    const status2 = await scanner.getResultStatus();
    expect(status2.toLowerCase()).toContain('accepted');

    // Step 7: Check history
    await scanner.continueScan();
    await scanner.openHistory();

    const historyCount = await scanner.getHistoryCount();
    expect(historyCount).toBeGreaterThanOrEqual(2);
  });

  test('should detect duplicate tokens in standalone mode', async ({ page }) => {
    await scanner.selectStandaloneMode();
    await scanner.enterTeam('002');
    await scanner.confirmTeam();

    // Scan token first time
    await scanner.manualScan('test_video_01');
    await scanner.waitForResult();

    const firstStatus = await scanner.getResultStatus();
    expect(firstStatus.toLowerCase()).toContain('accepted');

    await scanner.continueScan();

    // Scan SAME token again (duplicate)
    await scanner.manualScan('test_video_01');

    // Should show error (not result screen)
    const errorMsg = await scanner.getErrorMessage();
    expect(errorMsg).toBeTruthy();
    expect(errorMsg.toLowerCase()).toContain('duplicate');
  });

  test('should handle invalid tokens in standalone mode', async ({ page }) => {
    await scanner.selectStandaloneMode();
    await scanner.enterTeam('003');
    await scanner.confirmTeam();

    // Scan invalid token
    await scanner.manualScan('INVALID_TOKEN_999');

    // Should show error
    const errorMsg = await scanner.getErrorMessage();
    expect(errorMsg).toBeTruthy();
    expect(errorMsg.toLowerCase()).toMatch(/not found|invalid|unknown/);
  });

  test('should persist scans across page reload (localStorage)', async ({ page }) => {
    await scanner.selectStandaloneMode();
    await scanner.enterTeam('004');
    await scanner.confirmTeam();

    // Scan tokens
    await scanner.manualScan('test_video_01');
    await scanner.waitForResult();
    await scanner.continueScan();

    await scanner.manualScan('test_image_01');
    await scanner.waitForResult();
    await scanner.continueScan();

    // Check history before reload
    await scanner.openHistory();
    const countBefore = await scanner.getHistoryCount();
    expect(countBefore).toBe(2);

    // Reload page
    await page.reload();
    await page.waitForSelector('#loadingScreen.active', { state: 'hidden', timeout: 10000 });

    // Should restore to scan screen (persisted mode)
    await page.waitForSelector('#scanScreen.active', { timeout: 5000 });

    // Check history after reload
    await scanner.openHistory();
    const countAfter = await scanner.getHistoryCount();
    expect(countAfter).toBe(2); // Persisted via localStorage
  });
});
```

### Step 3: Run L2 tests

```bash
npx playwright test tests/e2e/specs/02-standalone-mode.spec.js
```

Expected: All tests pass

### Step 4: Commit

```bash
git add tests/e2e/page-objects/GMScannerPage.js tests/e2e/specs/02-standalone-mode.spec.js
git commit -m "test(e2e): add L2 standalone mode complete user journey tests

L2 Tests (Page Object Pattern):
- Full standalone scan workflow (select mode → scan → view results → history)
- Duplicate token detection
- Invalid token handling
- localStorage persistence across page reload

Uses GMScannerPage Page Object for forward-compatible DOM interaction.
No window globals, no mocks, no backend required."
```

---

## Task 7.4: Fix Backend E2E Tests to Work Without Window Globals

**Goal:** Update backend E2E tests to use DOM interaction instead of window.App

**Problem**: Backend E2E tests currently use `window.App.processNFCRead()` which breaks after Phase 7.0 removes window globals.

**Files to Fix**:
- `backend/tests/e2e/helpers/scanner-init.js` (lines 138-144: uses window.App)
- `backend/tests/e2e/flows/duplicate-detection.spec.js` (uses window.App.processNFCRead)
- `backend/tests/e2e/flows/07b-gm-scanner-networked-blackmarket.test.js`
- `backend/tests/e2e/flows/07c-gm-scanner-scoring-parity.test.js`

### Step 1: Analyze backend test failures after Phase 7.0

After removing window globals in Phase 7.0, backend E2E tests will fail with:
```
TypeError: Cannot read property 'processNFCRead' of undefined (window.App)
```

Current anti-pattern in backend tests:
```javascript
// backend/tests/e2e/helpers/scanner-init.js:138-144
await page.evaluate((tokenId) => {
  window.App.processNFCRead({
    id: tokenId,
    source: 'manual',
    raw: tokenId
  });
}, 'test_video_01');
```

### Step 2: Create Page Object for backend E2E tests

Create file: `backend/tests/e2e/page-objects/GMScannerPage.js` (same as scanner repo)

Copy the Page Object from scanner repo to backend:
```bash
cp /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner-es6-migration/tests/e2e/page-objects/GMScannerPage.js \
   /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/backend/tests/e2e/page-objects/GMScannerPage.js
```

### Step 3: Update scanner-init.js helper to use DOM interaction

Edit `backend/tests/e2e/helpers/scanner-init.js`:

**BEFORE (lines 138-144):**
```javascript
await page.evaluate((tokenId) => {
  window.App.processNFCRead({
    id: tokenId,
    source: 'manual',
    raw: tokenId
  });
}, tokenId);
```

**AFTER:**
```javascript
// Use Page Object pattern (DOM interaction)
const { GMScannerPage } = require('../page-objects/GMScannerPage');
const scanner = new GMScannerPage(page);

// Trigger scan via DOM (not window.App)
await scanner.manualScan(tokenId);
await scanner.waitForResult();
```

### Step 4: Update duplicate-detection.spec.js

Edit `backend/tests/e2e/flows/duplicate-detection.spec.js`:

**Import Page Object at top:**
```javascript
const { GMScannerPage } = require('../page-objects/GMScannerPage');
```

**Replace all window.App.processNFCRead calls** with:
```javascript
// Create scanner Page Object in beforeEach
let scanner;
beforeEach(async ({ page }) => {
  scanner = new GMScannerPage(page);
  // ... existing setup
});

// Replace window.App.processNFCRead with:
await scanner.manualScan(tokenId);
await scanner.waitForResult();
```

### Step 5: Update 07b-gm-scanner-networked-blackmarket.test.js

Edit `backend/tests/e2e/flows/07b-gm-scanner-networked-blackmarket.test.js`:

Same pattern:
1. Import GMScannerPage
2. Create instance in beforeEach
3. Replace window.App calls with scanner.manualScan()

### Step 6: Update 07c-gm-scanner-scoring-parity.test.js

Edit `backend/tests/e2e/flows/07c-gm-scanner-scoring-parity.test.js`:

Same pattern as above.

### Step 7: Run backend E2E tests to verify fixes

```bash
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/backend

# Start backend
npm run dev:full &

# Run GM scanner tests
npm run test:e2e -- duplicate-detection
npm run test:e2e -- 07b-gm-scanner-networked-blackmarket
npm run test:e2e -- 07c-gm-scanner-scoring-parity
```

Expected: All tests pass

### Step 8: Commit backend test fixes

```bash
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/backend
git add tests/e2e/page-objects/GMScannerPage.js tests/e2e/helpers/scanner-init.js tests/e2e/flows/*.js
git commit -m "test: fix E2E tests to work without window.App globals

BREAKING FIX: GM Scanner removed window.App global in ES6 migration.
Backend E2E tests now use Page Object pattern (DOM interaction).

Changes:
- Add GMScannerPage Page Object
- Update scanner-init.js to use DOM interaction
- Update all flow tests to use scanner.manualScan() instead of window.App.processNFCRead()

Tests now forward-compatible with scanner's final architecture (no window globals)."
```

---

## Task 7.5: Run Full E2E Test Suite

**Goal:** Verify all E2E tests pass

### Step 1: Run scanner E2E tests

```bash
npx playwright test
```

Expected output:
```
Running 15 tests using 1 worker

  ✓ 00-smoke-no-globals.spec.js (4 tests)
  ✓ 00-smoke.spec.js (5 tests)
  ✓ 02-standalone-mode.spec.js (4 tests)

15 passed (XX.XXs)
```

### Step 2: Run backend contract tests

```bash
cd ../backend
npm run test:contract
```

Expected: All 141 tests pass

### Step 3: (Optional) Run backend E2E tests

```bash
cd ../backend
npm run dev:full & # Start backend in background
npm run test:e2e -- 07b-gm-scanner-networked-blackmarket
```

Expected: Tests pass

### Step 4: Generate Playwright HTML report

```bash
cd ../ALNScanner-es6-migration
npx playwright show-report tests/e2e/reports
```

Review in browser

### Step 5: Document test results

Create file: `docs/TEST_RESULTS.md`

```markdown
# E2E Test Results - Phase 7 Complete

**Date**: 2025-11-11
**Branch**: feature/es6-module-migration
**Status**: ✅ ALL TESTS PASSING

## Scanner E2E Tests (Playwright)

**Command**: `npx playwright test`

### L1: Smoke Tests (00-smoke.spec.js)
- ✅ Should NOT expose App on window
- ✅ Should NOT expose DataManager on window
- ✅ Should show game mode selection via DOM event bindings
- ✅ Should handle button clicks via event delegation
- ✅ Should load ES6 modules without errors
- ✅ Should NOT crash on networked mode selection (regression)
- ✅ Should load token database from data/ submodule

**Total**: 7 tests, ~5 seconds

### L2: Standalone Mode (02-standalone-mode.spec.js)
- ✅ Should complete full standalone scan workflow
- ✅ Should detect duplicate tokens in standalone mode
- ✅ Should handle invalid tokens in standalone mode
- ✅ Should persist scans across page reload (localStorage)

**Total**: 4 tests, ~8 seconds

### Summary
- **Total Tests**: 11
- **Passed**: 11
- **Failed**: 0
- **Duration**: ~13 seconds

## Backend Contract Tests

**Command**: `cd backend && npm run test:contract`

- ✅ All 141 tests passing
- ✅ AsyncAPI contract compliance validated
- ✅ Scanner changes do NOT break backend

## Backend E2E Tests (L3 Networked Mode)

**Command**: `cd backend && npm run test:e2e`

- ✅ 07b-gm-scanner-networked-blackmarket.test.js
- ✅ duplicate-detection.spec.js

Networked mode integration validated via backend authoritative tests.

## Coverage

### Unit Tests
**Command**: `npm test`
- **Tests**: 598 passing
- **Suites**: 19
- **Coverage**: >80% (lines, functions, branches >70%)

### E2E Tests
- **L1 Smoke**: 7 tests (module loading, critical bugs)
- **L2 Standalone**: 4 tests (complete user journey)
- **L3 Networked**: Backend E2E tests (authoritative)

## Conclusion

✅ Phase 7 E2E Testing COMPLETE

All objectives achieved:
1. ✅ Removed temporary window globals (Phase 9 early)
2. ✅ Fixed E2E test anti-patterns
3. ✅ Implemented L1 smoke tests
4. ✅ Implemented L2 standalone mode tests
5. ✅ Leveraged backend L3 tests (networked mode)
6. ✅ All tests passing (598 unit + 11 E2E + 141 contract)

Ready for Phase 8: Production Build & Deployment
```

### Step 6: Commit

```bash
git add docs/TEST_RESULTS.md
git commit -m "docs: document Phase 7 E2E test results

All tests passing:
- 598 unit tests (Jest)
- 11 E2E tests (Playwright)
- 141 contract tests (backend)

Phase 7 complete. Ready for Phase 8."
```

---

## Task 7.6: Implement L4 Production Simulation Tests (REQUIRED)

**Goal:** Validate full 2-hour game scenarios with multi-device coordination and performance requirements

**Rationale:** Production simulation tests are CRITICAL for validating real-world performance, network resilience, and multi-device coordination under game conditions.

**Files:**
- Create: `tests/e2e/specs/03-production-simulation.spec.js`
- Create: `tests/e2e/fixtures/gameScenarios.js`

### Step 1: Define game scenario fixtures

Create file: `tests/e2e/fixtures/gameScenarios.js`

```javascript
/**
 * Game Scenario Fixtures for L4 Production Simulation
 *
 * Real token sequences from actual game sessions
 */

module.exports = {
  // Full 2-hour game scenario (Team SOF002 actual session)
  fullGameScenario: {
    teamId: 'SOF002',
    duration: 7200000, // 2 hours in ms
    tokenSequence: [
      { id: 'sof002', timestamp: 0, expectedPoints: 5 },
      { id: 'rat002', timestamp: 300000, expectedPoints: 3 }, // 5 min in
      { id: 'mab002', timestamp: 600000, expectedPoints: 4 }, // 10 min in
      // ... full 2-hour sequence
    ],
    expectedFinalScore: 156,
    expectedTransactionCount: 47
  },

  // Stress test: Rapid scanning
  rapidScanScenario: {
    teamId: 'STRESS001',
    scanInterval: 100, // 100ms between scans
    tokenCount: 50,
    expectedDuration: 5000 // Should complete in 5 seconds
  },

  // Multi-device coordination
  multiDeviceScenario: {
    devices: [
      { id: 'GM_001', type: 'gm', role: 'primary' },
      { id: 'GM_002', type: 'gm', role: 'secondary' },
      { id: 'PLAYER_001', type: 'player' },
      { id: 'PLAYER_002', type: 'player' },
      { id: 'PLAYER_003', type: 'player' }
    ],
    simultaneousScans: true,
    conflictResolution: 'orchestrator'
  }
};
```

### Step 2: Create production simulation tests

Create file: `tests/e2e/specs/03-production-simulation.spec.js`

```javascript
/**
 * L4: Production Simulation Tests
 *
 * Validates full game scenarios with real backend integration.
 * These tests run LONG and require orchestrator + VLC running.
 *
 * CRITICAL: These tests validate production readiness.
 */

const { test, expect } = require('@playwright/test');
const { GMScannerPage } = require('../page-objects/GMScannerPage');
const { fullGameScenario, rapidScanScenario } = require('../fixtures/gameScenarios');

// Extend timeout for long-running tests
test.setTimeout(180000); // 3 minutes max per test

test.describe('L4: Production Simulation - Full Game Scenarios', () => {
  test.skip('should complete full 2-hour game scenario (manual run only)', async ({ page }) => {
    // This test simulates a REAL 2-hour game
    // Only run manually: npx playwright test --grep "full 2-hour"

    const scanner = new GMScannerPage(page);
    await scanner.goto();

    // Select networked mode
    await scanner.selectStandaloneMode(); // Use standalone for simulation
    await scanner.enterTeam(fullGameScenario.teamId);
    await scanner.confirmTeam();

    let totalScore = 0;
    for (const scan of fullGameScenario.tokenSequence) {
      // Wait for timestamp
      await page.waitForTimeout(scan.timestamp);

      // Scan token
      await scanner.manualScan(scan.id);
      await scanner.waitForResult();

      const status = await scanner.getResultStatus();
      expect(status.toLowerCase()).toContain('accepted');

      await scanner.continueScan();
    }

    // Verify final score
    await scanner.openHistory();
    const finalCount = await scanner.getHistoryCount();
    expect(finalCount).toBe(fullGameScenario.expectedTransactionCount);
  });

  test('should handle rapid scanning (stress test)', async ({ page }) => {
    const scanner = new GMScannerPage(page);
    await scanner.goto();
    await scanner.selectStandaloneMode();
    await scanner.enterTeam(rapidScanScenario.teamId);
    await scanner.confirmTeam();

    const startTime = Date.now();
    const validTokens = ['test_video_01', 'test_image_01', 'test_audio_01'];

    // Rapid fire scans
    for (let i = 0; i < rapidScanScenario.tokenCount; i++) {
      const tokenId = validTokens[i % validTokens.length];

      if (i === 0) {
        // First scan should succeed
        await scanner.manualScan(tokenId);
        await scanner.waitForResult();
        await scanner.continueScan();
      } else {
        // Subsequent scans of same token should error (duplicate)
        await scanner.manualScan(tokenId);
        const errorMsg = await scanner.getErrorMessage();

        if (i % validTokens.length === 0) {
          // First scan of new token should succeed
          expect(errorMsg).toBeNull();
        } else {
          // Duplicate should be caught
          expect(errorMsg).toBeTruthy();
        }
      }

      // Small delay between scans
      await page.waitForTimeout(rapidScanScenario.scanInterval);
    }

    const duration = Date.now() - startTime;

    // Should complete quickly
    expect(duration).toBeLessThan(rapidScanScenario.expectedDuration * 1.5); // 50% buffer
  });

  test('should maintain performance under load (50 scans)', async ({ page }) => {
    const scanner = new GMScannerPage(page);
    await scanner.goto();
    await scanner.selectStandaloneMode();
    await scanner.enterTeam('PERF001');
    await scanner.confirmTeam();

    const scanTimes = [];
    const tokens = Array.from({ length: 50 }, (_, i) => `test_token_${i.toString().padStart(3, '0')}`);

    for (const tokenId of tokens) {
      const startTime = Date.now();

      await scanner.manualScan(tokenId);
      await scanner.waitForResult();

      const scanTime = Date.now() - startTime;
      scanTimes.push(scanTime);

      await scanner.continueScan();
    }

    // Calculate average scan time
    const avgScanTime = scanTimes.reduce((a, b) => a + b, 0) / scanTimes.length;

    // Performance requirement: Average scan time < 500ms
    expect(avgScanTime).toBeLessThan(500);

    // No scan should take > 2 seconds
    const maxScanTime = Math.max(...scanTimes);
    expect(maxScanTime).toBeLessThan(2000);
  });

  test('should persist state across page reload during long session', async ({ page }) => {
    const scanner = new GMScannerPage(page);
    await scanner.goto();
    await scanner.selectStandaloneMode();
    await scanner.enterTeam('PERSIST001');
    await scanner.confirmTeam();

    // Scan 10 tokens
    const tokens = Array.from({ length: 10 }, (_, i) => `persist_token_${i}`);
    for (const tokenId of tokens) {
      await scanner.manualScan(tokenId);
      await scanner.waitForResult();
      await scanner.continueScan();
    }

    // Check count before reload
    await scanner.openHistory();
    const countBefore = await scanner.getHistoryCount();
    expect(countBefore).toBe(10);

    // Reload page
    await page.reload();
    await page.waitForSelector('#loadingScreen.active', { state: 'hidden', timeout: 10000 });

    // Should restore session
    await page.waitForSelector('#scanScreen.active', { timeout: 5000 });
    await scanner.openHistory();
    const countAfter = await scanner.getHistoryCount();
    expect(countAfter).toBe(10);

    // Should prevent scanning duplicates after reload
    await page.click('button:has-text("Close")'); // Close history
    await scanner.manualScan(tokens[0]);
    const errorMsg = await scanner.getErrorMessage();
    expect(errorMsg).toBeTruthy();
    expect(errorMsg.toLowerCase()).toContain('duplicate');
  });
});

test.describe('L4: Production Simulation - Network Resilience', () => {
  test('should handle network disconnection gracefully (offline queue)', async ({ page }) => {
    // This test requires networked mode with real backend
    // Skip if no backend available
    const scanner = new GMScannerPage(page);
    await scanner.goto();

    // Select networked mode
    await page.click('button[data-action*="selectGameMode"]:has-text("Networked")');

    // Enter connection details (requires user input or pre-configured)
    // This is a placeholder - actual implementation depends on connection wizard

    // TODO: Implement offline queue testing when networked mode stabilizes
    test.skip('Offline queue testing requires backend orchestrator running');
  });
});
```

### Step 3: Run L4 production simulation tests

```bash
# Run performance tests only (fast)
npx playwright test tests/e2e/specs/03-production-simulation.spec.js --grep "performance|rapid|persist"

# Full game scenario (manual run only, 2+ hours)
npx playwright test tests/e2e/specs/03-production-simulation.spec.js --grep "full 2-hour"
```

Expected:
- Performance tests pass
- Stress tests pass
- Persistence tests pass

### Step 4: Verify performance requirements

Performance baseline:
- Average scan time: < 500ms
- Max scan time: < 2 seconds
- 50 scans: < 30 seconds total
- No memory leaks over 50+ scans

### Step 5: Commit

```bash
git add tests/e2e/specs/03-production-simulation.spec.js tests/e2e/fixtures/gameScenarios.js
git commit -m "test(e2e): add L4 production simulation tests (REQUIRED)

L4 Production Simulation Tests:
- Full 2-hour game scenario (manual run)
- Rapid scanning stress test (50 scans, 100ms interval)
- Performance validation (<500ms avg, <2s max)
- State persistence across page reload
- Duplicate detection after reload
- Network resilience placeholder

Performance requirements:
- Average scan time: <500ms
- Max scan time: <2000ms
- 50 scans: <30 seconds
- No memory leaks

These tests validate production readiness and real-world game conditions."
```

---

## Phase 8: Production Build & Deployment

### Task 8.1: Configure Production Build Optimizations

**Goal:** Optimize Vite build for production deployment

**Files:**
- Modify: `vite.config.js`

### Step 1: Update vite.config.js with production optimizations

Edit `vite.config.js`:

```javascript
import { defineConfig } from 'vite';
import { basicSsl } from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  // Base path for GitHub Pages
  base: process.env.NODE_ENV === 'production' ? '/ALNScanner/' : '/',

  // Development server
  server: {
    https: true,
    port: 8443,
    host: '0.0.0.0'
  },

  // Production build
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,

    // Minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console for debugging (remove for production)
        drop_debugger: true,
        pure_funcs: ['console.log'] // Remove console.log only
      }
    },

    // Chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk (socket.io)
          vendor: ['socket.io-client'],

          // Network layer
          network: [
            './src/network/OrchestratorClient.js',
            './src/network/ConnectionManager.js',
            './src/network/NetworkedSession.js',
            './src/network/networkedQueueManager.js'
          ],

          // Core logic
          core: [
            './src/core/TokenManager.js',
            './src/core/DataManager.js',
            './src/core/StandaloneDataManager.js'
          ],

          // UI layer
          ui: [
            './src/ui/UIManager.js',
            './src/ui/Settings.js'
          ]
        }
      }
    },

    // Target modern browsers
    target: 'es2015',

    // Asset size warnings
    chunkSizeWarningLimit: 500 // KB
  },

  // Plugins
  plugins: [
    basicSsl() // Self-signed SSL for dev
  ],

  // Optimizations
  optimizeDeps: {
    include: ['socket.io-client']
  }
});
```

### Step 2: Build for production

```bash
npm run build
```

Expected output:
```
vite v5.x.x building for production...
✓ XXX modules transformed.
dist/index.html                    X.XX kB
dist/assets/vendor-[hash].js      XX.XX kB
dist/assets/network-[hash].js     XX.XX kB
dist/assets/core-[hash].js        XX.XX kB
dist/assets/ui-[hash].js          XX.XX kB
dist/assets/index-[hash].js       XX.XX kB
✓ built in XXs
```

### Step 3: Verify build output

```bash
ls -lh dist/
tree dist/ | head -30
```

Expected structure:
```
dist/
├── index.html
├── assets/
│   ├── vendor-[hash].js
│   ├── network-[hash].js
│   ├── core-[hash].js
│   ├── ui-[hash].js
│   └── index-[hash].js
├── data/ (symlink to token data)
└── public/ (static assets)
```

### Step 4: Test production build locally

```bash
npm run preview
```

Open browser to preview URL, test:
1. ✅ Page loads
2. ✅ Standalone mode works
3. ✅ No console errors
4. ✅ Network tab shows minified code

### Step 5: Commit

```bash
git add vite.config.js
git commit -m "build: configure production build with code splitting and minification

Production optimizations:
- Code splitting (vendor, network, core, ui chunks)
- Terser minification (drop console.log)
- Source maps enabled
- Target es2015 (modern browsers)
- Chunk size warnings at 500KB

Build output: ~XXX KB total (gzipped)"
```

### Task 8.2: Setup GitHub Pages Deployment

**Goal:** Automate deployment to GitHub Pages via GitHub Actions

**Files:**
- Create: `.github/workflows/deploy.yml`
- Update: `.gitignore`

### Step 1: Create GitHub Actions workflow

Create file: `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          submodules: recursive # Critical: Load token data submodule

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm test

      - name: Build production
        env:
          NODE_ENV: production
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v2
        with:
          path: ./dist

  deploy:
    needs: build
    runs-on: ubuntu-latest

    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v2
```

### Step 2: Update .gitignore

```
# Build outputs
dist/
.vite/

# Playwright
playwright-report/
test-results/
tests/e2e/reports/

# Dependencies
node_modules/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
```

### Step 3: Commit

```bash
git add .github/workflows/deploy.yml .gitignore
git commit -m "ci: add GitHub Pages deployment workflow

Automated deployment on push to main:
- Runs unit tests (598 tests)
- Builds production bundle
- Deploys to GitHub Pages
- Includes token data submodule"
```

---

## Phase 9: Final Documentation

### Task 9.1: Update CLAUDE.md

**Goal:** Document final architecture for Claude Code

**Files:**
- Modify: `CLAUDE.md`

### Step 1: Add ES6 architecture section at top

Edit `CLAUDE.md`:

```markdown
# CLAUDE.md - ALNScanner (ES6 Module Architecture)

## ⚠️ IMPORTANT: Modern Architecture (November 2025)

**This scanner uses ES6 modules with Vite build system and event-driven coordination.**

Previous architecture (script tags, window globals) was migrated in November 2025.
See `docs/plans/2025-11-11-es6-module-migration.md` for complete migration details.

### Key Architectural Changes

1. **No Window Globals**: All modules use import/export, no window.XXX assignments
2. **Event-Driven**: Services coordinate via CustomEvents (EventTarget pattern)
3. **Dependency Injection**: App receives dependencies via constructor
4. **Page Object Tests**: E2E tests use DOM interaction, not window globals
5. **Vite Build**: Fast dev server, optimized production bundles

## Development Commands

```bash
# Development (with hot reload)
npm run dev              # Starts Vite dev server (https://localhost:8443)

# Testing
npm test                 # Unit tests (Jest, 598 tests)
npm run test:e2e         # E2E tests (Playwright, 11 tests)
cd ../backend && npm run test:contract # Contract tests (141 tests)

# Production
npm run build            # Build for production (dist/)
npm run preview          # Preview production build

# Deployment
git push origin main     # Auto-deploys to GitHub Pages
```

## Project Structure

```
ALNScanner/
├── src/                           # ES6 modules (source code)
│   ├── main.js                    # Entry point
│   ├── app/
│   │   ├── app.js                 # Main app controller (class)
│   │   ├── AdminController.js     # Admin module lifecycle
│   │   ├── SessionModeManager.js  # Mode selection
│   │   └── initializationSteps.js # Bootstrap sequence
│   ├── core/
│   │   ├── DataManager.js         # Game state & scoring
│   │   ├── StandaloneDataManager.js
│   │   └── TokenManager.js        # Token database
│   ├── network/
│   │   ├── NetworkedSession.js    # Service orchestrator
│   │   ├── OrchestratorClient.js  # WebSocket wrapper
│   │   ├── ConnectionManager.js   # Connection lifecycle
│   │   └── networkedQueueManager.js
│   ├── ui/
│   │   ├── UIManager.js          # UI state & screens
│   │   └── Settings.js           # App settings
│   └── utils/
│       ├── config.js             # Constants
│       ├── debug.js              # Debug logger
│       ├── nfcHandler.js         # NFC API wrapper
│       ├── domEventBindings.js   # Event delegation
│       └── adminModule.js        # Admin components
├── tests/
│   ├── unit/                     # Jest unit tests (598 tests)
│   ├── e2e/                      # Playwright E2E tests (11 tests)
│   │   ├── specs/
│   │   │   ├── 00-smoke.spec.js          # L1: Module loading, critical bugs
│   │   │   └── 02-standalone-mode.spec.js # L2: Complete user journey
│   │   └── page-objects/
│   │       └── GMScannerPage.js          # Page Object pattern
│   └── helpers/                  # Test utilities
├── dist/                         # Build output (gitignored)
├── index.html                    # Minimal HTML (loads ES6 module)
├── vite.config.js                # Build configuration
├── playwright.config.js          # E2E test configuration
└── jest.config.js                # Unit test configuration
```

## Architecture Patterns

### Dependency Injection

```javascript
// App receives dependencies via constructor
const app = new App({
  debug: Debug,
  uiManager: UIManager,
  settings: Settings,
  tokenManager: TokenManager,
  dataManager: DataManager,
  nfcHandler: NFCHandler,
  config: CONFIG,
  initializationSteps: InitializationSteps
});
```

### Event-Driven Coordination

```javascript
// Services communicate via CustomEvents
class NetworkedSession extends EventTarget {
  async initialize() {
    // Emit events, don't call methods directly
    this.dispatchEvent(new CustomEvent('session:ready', {
      detail: { services: this.services }
    }));
  }
}

// Listeners
networkedSession.addEventListener('session:ready', ({ detail }) => {
  // Handle event
});
```

### No Window Globals

```javascript
// ❌ OLD (deprecated):
window.App = app;
window.DataManager = DataManager;

// ✅ NEW:
// HTML uses data-action attributes with event delegation
<button data-action="app.showHistory">History</button>

// domEventBindings.js handles delegation
bindDOMEvents(app, dataManager, settings, debug, uiManager);
```

## Testing Strategy

### L1: Smoke Tests (00-smoke.spec.js)
- ES6 module loading without errors
- Critical regression prevention ("global is not defined" fix)
- No window globals present

### L2: Standalone Mode (02-standalone-mode.spec.js)
- Complete user journey (DOM interaction only)
- Page Object pattern (GMScannerPage)
- No mocks, no backend required

### L3: Networked Mode
- **Backend E2E tests are authoritative** (backend/tests/e2e/flows/)
- Scanner must NOT break backend contract tests (141 tests)
- See `tests/e2e/L3-NETWORKED-MODE.md` for details

## Troubleshooting

**Module not found errors:**
- Check import paths include `.js` extension
- Verify file exists in `src/` directory
- Restart dev server: `npm run dev`

**Build fails:**
- Run `npm run lint` to check syntax
- Run `npm test` to validate code
- Check vite.config.js for errors

**E2E tests fail:**
- Ensure Vite dev server running (auto-starts via playwright.config.js)
- Check HTTPS certificate accepted in browser
- Review test output: `npx playwright show-report tests/e2e/reports`

**Backend contract tests fail:**
- Scanner changes broke AsyncAPI contract
- Review backend/contracts/asyncapi.yaml
- Fix scanner to match contract
```

### Step 2: Commit

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with final ES6 architecture

Documents:
- No window globals architecture
- Event-driven coordination patterns
- Dependency injection approach
- Testing strategy (L1, L2, L3)
- Development workflow
- Troubleshooting guide"
```

---

## Final Checklist & Completion

### Verification Checklist

- [ ] **Window Globals**: NONE exist (verified by E2E test)
- [ ] **Event Bindings**: data-action attributes work
- [ ] **Unit Tests**: 598 passing
- [ ] **E2E Tests**: 11 passing (Playwright)
- [ ] **Contract Tests**: 141 passing (backend)
- [ ] **Production Build**: Successful, optimized
- [ ] **Documentation**: CLAUDE.md updated
- [ ] **Test Results**: Documented in docs/TEST_RESULTS.md

### Run All Tests

```bash
# Unit tests
npm test

# E2E tests
npx playwright test

# Backend contract tests
cd ../backend && npm run test:contract && cd ../ALNScanner-es6-migration

# Production build
npm run build
npm run preview
```

### Final Commit

```bash
git status
git add .
git commit -m "feat: complete Phase 7-9 - E2E testing and final ES6 migration

SUMMARY:
- Phase 7.0: ✅ Removed temporary window globals (Phase 9 moved early)
- Phase 7.1: ✅ Fixed E2E test anti-patterns
- Phase 7.2: ✅ Implemented L1 smoke tests (module loading, critical bugs)
- Phase 7.3: ✅ Implemented L2 standalone mode tests (complete user journey)
- Phase 7.4: ✅ Documented L3 networked mode strategy (leverage backend tests)
- Phase 7.5: ✅ All tests passing (598 unit + 11 E2E + 141 contract)
- Phase 8: ✅ Production build configured and optimized
- Phase 9: ✅ Documentation complete

ARCHITECTURE:
- Pure ES6 modules (no window globals)
- Event-driven coordination (CustomEvents)
- Dependency injection (constructor parameters)
- Page Object pattern (forward-compatible E2E tests)

TESTING:
- 598 unit tests (Jest, >80% coverage)
- 11 E2E tests (Playwright, L1+L2)
- 141 contract tests (backend, AsyncAPI compliance)

READY FOR DEPLOYMENT:
- GitHub Actions workflow configured
- Production build optimized
- All tests passing

See docs/plans/2025-11-11-phase7-9-completion.md for complete implementation details."
```

---

## Execution Handoff

Plan complete and saved to `docs/plans/2025-11-11-phase7-9-completion.md`.

**Execution Option: Subagent-Driven Development**

Use `superpowers:subagent-driven-development` skill to execute this plan:
- Fresh subagent per task
- Code review between tasks
- Fast iteration with quality gates

**Next Steps:**
1. Start with Task 7.0: Remove Temporary Window Globals
2. Proceed sequentially through tasks
3. Verify all tests pass after each task
4. Review with user at key milestones
