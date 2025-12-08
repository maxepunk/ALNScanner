# Playwright E2E Testing Guide for GM Scanner

Last verified: 2025-12-08

This document provides comprehensive Playwright testing patterns for the ALN GM Scanner. Use this as the source of truth for writing E2E tests.

## Screen System Architecture

The scanner uses a **dual-layer UI system**:

1. **Views** (networked mode only) - Top-level containers that control entire app sections
2. **Screens** (within scanner-view) - Individual pages toggled with CSS `.active` class

**View Containers** (index.html:1582-1955):
```html
<!-- Only visible in networked mode -->
<div id="scanner-view" class="view-content">...</div>  <!-- Default visible -->
<div id="admin-view" class="view-content" style="display: none;">...</div>
<div id="debug-view" class="view-content" style="display: none;">...</div>
```

**Screen Containers** (index.html:1586-1846):
```html
<!-- ALL screens use .active class for visibility -->
<div id="loadingScreen" class="screen"></div>
<div id="settingsScreen" class="screen"></div>
<div id="gameModeScreen" class="screen"></div>
<div id="teamEntryScreen" class="screen"></div>
<div id="scanScreen" class="screen"></div>
<div id="resultScreen" class="screen"></div>
<div id="historyScreen" class="screen"></div>
<div id="scoreboardScreen" class="screen"></div>
<div id="teamDetailsScreen" class="screen"></div>
```

**CSS Visibility Pattern**:
```css
.screen { display: none; }          /* Default: hidden */
.screen.active { display: block; }  /* Visible when .active added */
```

**CRITICAL: Only ONE screen can have `.active` class at a time** (uiManager.js:149-174)

## Screen Navigation Logic

**showScreen() method** (uiManager.js:149-174):
```javascript
showScreen(screenName) {
  // Track previous screen for back navigation (EXCLUDING overlays)
  const current = document.querySelector('.screen.active');
  if (current && !isOverlayScreen(current.id) && !isSystemScreen(screenName)) {
    this.previousScreen = current.id.replace('Screen', '');
  }

  // Hide ALL screens
  Object.values(this.screens).forEach(screen => {
    screen.classList.remove('active');
  });

  // Show requested screen
  this.screens[screenName].classList.add('active');
}
```

**Overlay screens** (don't update previousScreen):
- `historyScreen` - Transaction log overlay
- `scoreboardScreen` - Rankings overlay (networked mode only)
- `teamDetailsScreen` - Team breakdown overlay

**System screens** (don't update previousScreen):
- `gameModeScreen` - Initial mode selection
- `loadingScreen` - App initialization

**Screen name mapping**:
- Code uses camelCase WITHOUT "Screen" suffix: `showScreen('teamEntry')` → `#teamEntryScreen.active`
- DOM uses ID with "Screen" suffix: `<div id="teamEntryScreen">`

## Standalone Mode Flow (Actual Implementation)

```
User navigates to / → #gameModeScreen.active
  ↓ (Click standalone button: data-action="app.selectGameMode" data-arg="standalone")
app.selectGameMode('standalone') [app.js:355-393]
  ↓ (sessionModeManager.setMode('standalone'))
showScreen('teamEntry') → #teamEntryScreen.active
  ↓ (Enter digits via numpad, click enter: data-action="app.confirmTeamId")
app.confirmTeamId() [app.js:334-345]
  ↓ (Validate team ID, update UIManager)
showScreen('scan') → #scanScreen.active
  ↓ (Click manual entry: data-action="app.manualEntry")
app.manualEntry() → prompt dialog → app.processNFCRead(tokenId)
  ↓ (DataManager.addTransaction, emit 'transaction:added' event)
showScreen('result') → #resultScreen.active
  ↓ (Click continue: data-action="app.continueScan")
app.continueScan()
  ↓
showScreen('scan') → #scanScreen.active (loop)
```

## Event System (data-action Pattern)

**ALL button clicks are handled via event delegation** (domEventBindings.js):

```javascript
document.addEventListener('click', (event) => {
  const actionElement = event.target.closest('[data-action]');
  if (!actionElement) return;

  const action = actionElement.dataset.action;  // "app.confirmTeamId"
  const arg = actionElement.dataset.arg;        // "standalone"

  const [target, method] = action.split('.');   // ["app", "confirmTeamId"]

  switch(target) {
    case 'app': app[method](arg); break;
    case 'dataManager': dataManager[method](arg); break;
    case 'uiManager': uiManager[method](arg); break;
    // ... etc
  }
});
```

**Valid data-action targets**:
- `app.*` - Main application methods
- `dataManager.*` - Transaction/scoring methods
- `settings.*` - Settings persistence
- `uiManager.*` - UI rendering
- `connectionWizard.*` - Network auth flow
- `queueStatusManager.*` - Offline queue

**Example buttons from actual HTML**:
```html
<!-- Mode selection -->
<button data-action="app.selectGameMode" data-arg="standalone">Standalone Game</button>

<!-- Team entry -->
<button data-action="app.appendNumber" data-arg="1">1</button>
<button data-action="app.confirmTeamId">Enter</button>

<!-- Scan actions -->
<button data-action="app.manualEntry">Manual Entry (Debug)</button>
<button data-action="app.continueScan">Scan Another Token</button>
```

## Playwright Selector Patterns (MUST FOLLOW)

### 1. Screen Selectors - ALWAYS include `.active`

```javascript
// ✅ CORRECT - Matches only when screen is visible
this.teamEntryScreen = page.locator('#teamEntryScreen.active');
await this.teamEntryScreen.waitFor({ state: 'visible' });

// ❌ WRONG - Matches hidden screen too, will cause flaky tests
this.teamEntryScreen = page.locator('#teamEntryScreen');
```

### 2. Button Selectors - Use data-action attributes

```javascript
// ✅ CORRECT - Stable, matches actual event system
page.locator('button[data-action="app.confirmTeamId"]')
page.locator('button[data-action="app.selectGameMode"][data-arg="standalone"]')

// ❌ WRONG - Fragile, breaks with text changes
page.locator('text=Enter')
page.locator('button:has-text("Standalone Game")')
```

### 3. Dynamic Content Selectors - Use specific container IDs

```javascript
// ✅ CORRECT - Specific container
await page.locator('#historyContainer .transaction-card').count();
await page.locator('#scoreboardContainer .scoreboard-entry').count();
await page.locator('#teamDetailsContainer .token-detail-card').count();

// ❌ WRONG - Ambiguous, might match wrong container
await page.locator('.history-container .transaction-card').count();
```

### 4. Form Elements - Use IDs or name attributes

```javascript
// ✅ CORRECT
await page.locator('#deviceId').fill('TEST_001');
await page.locator('#teamDisplay').textContent();
await page.locator('#currentTeam').textContent();

// ❌ WRONG - Class selectors are unstable
await page.locator('.team-display').textContent();
```

## Page Object Model (GMScannerPage.js)

**The Page Object encapsulates ALL DOM interactions**:

```javascript
class GMScannerPage {
  constructor(page) {
    // Screen locators (ALWAYS use .active)
    this.teamEntryScreen = page.locator('#teamEntryScreen.active');
    this.scanScreen = page.locator('#scanScreen.active');
    this.resultScreen = page.locator('#resultScreen.active');

    // Button locators (use data-action)
    this.standaloneBtn = page.locator('button[data-action="app.selectGameMode"][data-arg="standalone"]');
    this.confirmTeamBtn = page.locator('button[data-action="app.confirmTeamId"]');
  }

  async selectStandaloneMode() {
    await this.standaloneBtn.click();
    await this.teamEntryScreen.waitFor({ state: 'visible', timeout: 5000 });
  }

  async enterTeam(teamId) {
    for (const digit of teamId) {
      await page.locator(`button[data-action="app.appendNumber"][data-arg="${digit}"]`).click();
    }
  }
}
```

## Critical Playwright Test Patterns

### 1. Dialog Handling - MUST register BEFORE click

```javascript
// ✅ CORRECT - Handler registered BEFORE action
page.once('dialog', dialog => dialog.accept(tokenId));
await page.locator('[data-action="app.manualEntry"]').click();
await page.locator('#resultScreen.active').waitFor();

// ❌ WRONG - Race condition, dialog handler too late
await page.locator('[data-action="app.manualEntry"]').click();
page.on('dialog', dialog => dialog.accept(tokenId));  // Dialog already dismissed!
```

### 2. Event Listener Registration - BEFORE triggering action

```javascript
// ✅ CORRECT - Listener registered BEFORE action
manager.addEventListener('transaction:added', handler);
manager.addTransaction(tx);

// ❌ WRONG - Event fires before listener ready
manager.addTransaction(tx);
manager.addEventListener('transaction:added', handler);  // Missed event!
```

### 3. Conditional Rendering - Check screen visibility first

```javascript
// ✅ CORRECT - Only re-render if history screen active
const historyScreen = document.getElementById('historyScreen');
if (historyScreen?.classList.contains('active')) {
  UIManager.renderTransactions();
}

// ❌ WRONG - Renders even when screen hidden
UIManager.renderTransactions();  // Wastes cycles, doesn't update visible UI
```

### 4. Mode-Specific Features - Verify mode before testing

```javascript
// ✅ CORRECT - Check mode availability
test('should show admin panel in networked mode', async () => {
  await scanner.selectNetworkedMode();
  // ... auth flow
  await page.locator('#admin-view').waitFor({ state: 'visible' });
});

// ❌ WRONG - Admin view doesn't exist in standalone mode
test('should show admin panel', async () => {
  await scanner.selectStandaloneMode();
  await page.locator('#admin-view').waitFor({ state: 'visible' });  // Will timeout!
});
```

## Common Pitfalls & Solutions

### Pitfall 1: Missing `.active` class in selectors

**Symptom**: Test times out waiting for screen to appear
**Cause**: Selector matches hidden screen
**Solution**: Always include `.active` in screen selectors

```javascript
// ❌ WRONG
await page.locator('#scanScreen').waitFor({ state: 'visible' });

// ✅ CORRECT
await page.locator('#scanScreen.active').waitFor({ state: 'visible' });
```

### Pitfall 2: Screen name mapping confusion

**Symptom**: `showScreen()` doesn't work
**Cause**: Using wrong name format
**Solution**: Use camelCase WITHOUT "Screen" suffix

```javascript
// ❌ WRONG
uiManager.showScreen('teamEntryScreen');

// ✅ CORRECT
uiManager.showScreen('teamEntry');  // Maps to #teamEntryScreen
```

### Pitfall 3: Using window globals in tests

**Symptom**: `window.DataManager is undefined`
**Cause**: ES6 modules don't expose window globals
**Solution**: Use dependency injection or page.evaluate()

```javascript
// ❌ WRONG
const transactions = await page.evaluate(() => window.DataManager.transactions);

// ✅ CORRECT
const transactions = await page.evaluate(() => {
  return JSON.parse(localStorage.getItem('transactions') || '[]');
});
```

### Pitfall 4: Overlay screen back navigation

**Symptom**: Closing history returns to wrong screen
**Cause**: Overlays don't update previousScreen
**Solution**: Understand overlay vs normal screen distinction

```javascript
// Overlays use previousScreen for back navigation
closeHistory() {
  if (this.uiManager.previousScreen) {
    this.uiManager.showScreen(this.uiManager.previousScreen);
  } else {
    this.uiManager.showScreen('scan');  // Fallback
  }
}
```

### Pitfall 5: Event timing in E2E tests

**Symptom**: UI doesn't update after transaction
**Cause**: Test doesn't wait for event propagation
**Solution**: Wait for visible UI changes, not events

```javascript
// ✅ CORRECT - Wait for visible effect
await scanner.manualScan('rat002');
await expect(page.locator('#historyBadge')).toHaveText('1');

// ❌ WRONG - Can't directly observe CustomEvent in Playwright
await page.waitForEvent('transaction:added');  // Not supported
```

## Test Debugging Checklist

When a Playwright test fails:

1. **Check active screen**:
   ```javascript
   const activeScreen = await page.locator('.screen.active').getAttribute('id');
   console.log('Active screen:', activeScreen);
   ```

2. **Verify data-action exists**:
   ```javascript
   const action = await page.locator('[data-action="app.confirmTeamId"]').getAttribute('data-action');
   console.log('Button action:', action);
   ```

3. **Check mode lock**:
   ```javascript
   const mode = await page.evaluate(() => localStorage.getItem('aln_game_session_mode'));
   console.log('Locked mode:', mode);
   ```

4. **Inspect localStorage**:
   ```javascript
   const transactions = await page.evaluate(() => localStorage.getItem('transactions'));
   console.log('Stored transactions:', transactions);
   ```

5. **Verify view visibility** (networked mode):
   ```javascript
   const viewVisible = await page.locator('#scanner-view').isVisible();
   console.log('Scanner view visible:', viewVisible);
   ```

## Testing Resources

- **Page Object**: `tests/e2e/page-objects/GMScannerPage.js` (316 lines)
- **L2 E2E Tests**: `tests/e2e/specs/02-standalone-mode.spec.js` (299 lines)
- **L3 Full Stack**: `../../backend/tests/e2e/flows/07b-gm-scanner-networked-blackmarket.test.js`
- **Test Helpers**: `../../backend/tests/e2e/fixtures/` (token data, session setup)

## Admin Panel DataManager Architecture

### Overview
The Admin Panel uses **ES6 Dependency Injection** to pass DataManager through the service layer. This replaced the anti-pattern of accessing `window.DataManager` (which is undefined in ES6 modules).

### Dependency Injection Chain
```
App.js
  ├─> creates DataManager
  └─> NetworkedSession(config, dataManager)
        └─> AdminController(client, dataManager)
              └─> MonitoringDisplay(client, dataManager)
```

**Implementation:**
```javascript
// 1. App creates and passes DataManager
this.dataManager = new DataManager(...);
this.networkedSession = new NetworkedSession(config, this.dataManager);

// 2. NetworkedSession passes to AdminController
this.services.adminController = new AdminController(client, this.dataManager);

// 3. AdminController passes to MonitoringDisplay
this.modules.monitoringDisplay = new MonitoringDisplay(client, this.dataManager);

// 4. MonitoringDisplay stores injected dependency
constructor(client, dataManager) {
  this.connection = client;
  this.dataManager = dataManager;  // ✅ Use this
  // NEVER: window.DataManager       // ❌ Undefined
}
```

### History Auto-Update Event Flow
```
Backend broadcast (transaction:new)
  → OrchestratorClient (message:received event)
    → MonitoringDisplay._handleMessage()
      → this.dataManager.addTransaction()
        → DataManager emits 'transaction:added' (CustomEvent)
          → ScreenUpdateManager.onDataUpdate('transaction:added', data)
            → Global handlers run (badge, stats update)
            → Screen handler runs IF historyScreen is active
              → UIManager.renderTransactions()
                → DOM updates with new transaction
```

**Key Implementation Details:**

1. **EventTarget Pattern (NOT EventEmitter)**
```javascript
// CORRECT (Browser API)
DataManager.addEventListener('transaction:added', handler);
DataManager.dispatchEvent(new CustomEvent('transaction:added', {detail: tx}));

// WRONG (Node.js API - doesn't exist in browser)
DataManager.on('transaction:added', handler);
DataManager.emit('transaction:added', tx);
```

2. **ScreenUpdateManager Pattern**
```javascript
// main.js - Declarative event registration via ScreenUpdateManager

// Global handlers: Run on EVERY event regardless of active screen
screenUpdateManager.registerGlobalHandler('transaction:added', () => {
  UIManager.updateHistoryBadge();
  UIManager.updateSessionStats();
});

// Screen handlers: Run ONLY when that screen is active
screenUpdateManager.registerScreen('history', {
  'transaction:added': () => {
    UIManager.updateHistoryStats();
    UIManager.renderTransactions();
  }
});

// Wire to data source (replaces manual addEventListener calls)
screenUpdateManager.connectToDataSource(DataManager, [
  'transaction:added', 'transaction:deleted', 'data:cleared', ...
]);
```

**Benefits:**
- No scattered visibility checks throughout codebase
- Adding new screens is trivial: just call `registerScreen()`
- Global vs screen-specific concerns clearly separated

3. **Mode-Aware Data Source Routing**
```javascript
// UIManager._getDataSource()
_getDataSource() {
  const isStandalone = this.sessionModeManager?.isStandalone();
  if (isStandalone) {
    return this.standaloneDataManager;  // Local scoring
  }
  return this.dataManager;  // Backend authoritative
}
```

### Admin Panel Common Issues

**Problem: History doesn't auto-update**
- **Symptom**: Transactions appear only after closing/reopening history screen
- **Cause**: MonitoringDisplay accessing `window.DataManager` (undefined)
- **Fix**: Verify DI chain passes dataManager through all layers
- **Files**: `src/admin/MonitoringDisplay.js`, `src/app/adminController.js`, `src/network/networkedSession.js`, `src/app/app.js`

**Problem: "Cannot read property 'transactions' of undefined"**
- **Symptom**: Browser console error when accessing DataManager
- **Cause**: Missing dataManager parameter in constructor
- **Fix**: Check AdminController passes dataManager to MonitoringDisplay
- **Verification**: `console.log(this.dataManager)` in MonitoringDisplay constructor

**Problem: E2E test selector not finding transactions**
- **Symptom**: Test fails with "Expected 1, received 0" for transaction count
- **Cause**: Test uses wrong CSS selector
- **Fix**: Use `#historyContainer .transaction-card` (NOT `#history-list .transaction-item`)
- **File**: backend/tests/e2e/flows/07d-gm-scanner-admin-panel.test.js:689, 758

### Admin Panel Key Files
- `src/ui/ScreenUpdateManager.js` - Centralized event-to-screen routing
- `src/main.js` - ScreenUpdateManager registration and wiring
- `src/admin/MonitoringDisplay.js` - Transaction history, receives dataManager via DI
- `src/app/adminController.js` - AdminController DI (receives and passes dataManager)
- `src/network/networkedSession.js` - NetworkedSession DI (receives and passes dataManager)
- `src/app/app.js` - NetworkedSession creation (passes this.dataManager)
- `src/ui/uiManager.js` - _getDataSource() mode routing, renderTransactions()

### Admin Panel E2E Test Pattern
```javascript
// Initialize Scanner 1 (monitoring)
const gmScanner1 = await initializeGMScannerWithMode(page1, 'networked', 'blackmarket', {...});
await gmScanner1.navigateToAdminPanel();  // ← CRITICAL: Initializes admin modules
await gmScanner1.viewFullHistory();

// Initialize Scanner 2 (scanning)
const gmScanner2 = await initializeGMScannerWithMode(page2, 'networked', 'blackmarket', {...});
await gmScanner2.enterTeam('001');
await gmScanner2.manualScan(tokenId);

// Verify Scanner 1 auto-updates
await expect(page1.locator('#historyContainer .transaction-card')).toHaveCount(1);
```

**Critical Test Requirements:**
1. Initialize admin modules BEFORE monitoring (navigateToAdminPanel)
2. Use correct DOM selectors matching actual HTML
3. Wait for transaction:new broadcast to propagate
4. Verify history screen has 'active' class before expecting updates
