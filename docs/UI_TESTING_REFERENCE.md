# UI Testing Reference

> **Purpose:** Structured reference for Playwright E2E test writing. Contains verified selectors and navigation patterns.
>
> **Last verified:** 2026-01-06 against `index.html` and `tests/e2e/page-objects/GMScannerPage.js`

## Screen Selectors

All screens use `.active` class to toggle visibility. Use `#screenId.active` for Playwright `waitFor()`.

| Screen Name | Element ID | Active State Selector | Purpose |
|-------------|------------|----------------------|---------|
| Loading | `#loadingScreen` | `#loadingScreen.active` | Initial app load |
| Settings | `#settingsScreen` | `#settingsScreen.active` | Device ID, mode toggle, data management |
| Game Mode | `#gameModeScreen` | `#gameModeScreen.active` | Networked vs Standalone selection |
| Team Entry | `#teamEntryScreen` | `#teamEntryScreen.active` | Team selection (input + list) |
| Scan | `#scanScreen` | `#scanScreen.active` | NFC interface + stats |
| Result | `#resultScreen` | `#resultScreen.active` | Transaction outcome display |
| History | `#historyScreen` | `#historyScreen.active` | Transaction log |
| Scoreboard | `#scoreboardScreen` | `#scoreboardScreen.active` | Black Market rankings (networked) |
| Team Details | `#teamDetailsScreen` | `#teamDetailsScreen.active` | Group progress breakdown |

## View Selectors (Networked Mode Only)

Views are top-level containers. Only visible in networked mode.

| View Name | Element ID | Tab Selector | Purpose |
|-----------|------------|--------------|---------|
| Scanner | `#scanner-view` | `button[data-view="scanner"]` | Default scanning interface |
| Admin | `#admin-view` | `button[data-view="admin"]` | Session/Video/System control |
| Debug | `#debug-view` | `button[data-view="debug"]` | Real-time debug console |

## Action Selectors

### Navigation Actions

| Action | Selector | Triggers Navigation To | Notes |
|--------|----------|----------------------|-------|
| Select Standalone Mode | `button[data-action="app.selectGameMode"][data-arg="standalone"]` | teamEntry | Locks mode |
| Select Networked Mode | `button[data-action="app.selectGameMode"][data-arg="networked"]` | connectionModal | Shows wizard |
| Confirm Team | `button[data-action="app.confirmTeamId"]` | scan | Starts NFC listener |
| Finish Team | `button[data-action="app.finishTeam"]` | teamEntry | Present on scan + result |
| Continue Scan | (tap anywhere on result screen) | scan | Quick-dismiss pattern |
| Show History | `button[data-action="app.showHistory"]` | history | Nav button |
| Close History | `button[data-action="app.closeHistory"]` | (previous screen) | Back button |
| Show Scoreboard | `button[data-action="app.showScoreboard"]` | scoreboard | Nav button (networked) |
| Close Scoreboard | `button[data-action="app.closeScoreboard"]` | (previous screen) | Back button |
| Show Settings | `button[data-action="app.showSettings"]` | settings | Nav button |
| Save Settings | `button[data-action="app.saveSettings"]` | teamEntry | Save & proceed |
| Close Team Details | `button[data-action="app.closeTeamDetails"]` | scoreboard | Back button |

### View Switching Actions

| Action | Selector | Result |
|--------|----------|--------|
| Switch to Scanner View | `button[data-action="app.switchView"][data-arg="scanner"]` | Shows scanner-view |
| Switch to Admin View | `button[data-action="app.switchView"][data-arg="admin"]` | Shows admin-view |
| Switch to Debug View | `button[data-action="app.switchView"][data-arg="debug"]` | Shows debug-view |

### Scan Actions

| Action | Selector | Result |
|--------|----------|--------|
| Manual Entry | `button[data-action="app.manualEntry"]` | Opens prompt dialog |
| Toggle Mode | `#modeIndicator[data-action="app.toggleMode"]` | Switches detective/blackmarket |

### Admin Panel Actions (Networked Mode)

| Action | Selector | Purpose |
|--------|----------|---------|
| Set Idle Loop | `button[data-action="app.adminSetIdleLoop"]` | Display mode |
| Set Scoreboard | `button[data-action="app.adminSetScoreboard"]` | Display mode |
| Play Video | `button[data-action="app.adminPlayVideo"]` | Video control |
| Pause Video | `button[data-action="app.adminPauseVideo"]` | Video control |
| Stop Video | `button[data-action="app.adminStopVideo"]` | Video control |
| Skip Video | `button[data-action="app.adminSkipVideo"]` | Video control |
| Add to Queue | `button[data-action="app.adminAddVideoToQueue"]` | Video queue |
| Clear Queue | `button[data-action="app.adminClearQueue"]` | Video queue |
| Reset Scores | `button[data-action="app.adminResetScores"]` | Scoring |
| View Full History | `button[data-action="app.viewFullHistory"]` | Game activity |
| Adjust Score | `button[data-action="app.adjustTeamScore"]` | Team details |
| Show Team Details | `button[data-action="app.showTeamDetails"]` | From scoreboard |

### Data Management Actions

| Action | Selector | Purpose |
|--------|----------|---------|
| Export JSON | `button[data-action="dataManager.exportData"][data-arg="json"]` | Data export |
| Export CSV | `button[data-action="dataManager.exportData"][data-arg="csv"]` | Data export |
| Clear All Data | `button[data-action="dataManager.clearData"]` | Data reset |

### Connection Wizard Actions

| Action | Selector | Purpose |
|--------|----------|---------|
| Scan for Servers | `button[data-action="connectionWizard.scanForServers"]` | Server discovery |
| Cancel Networked Mode | `button[data-action="connectionWizard.cancelNetworkedMode"]` | Back to mode selection |
| Show Wizard | `a[data-action="connectionWizard.showConnectionWizard"]` | Connection status link |

## Form Elements

| Element | Selector | Type | Purpose |
|---------|----------|------|---------|
| Team Name Input | `#teamNameInput` | text | Team name entry (standalone) |
| Team List | `#teamList` | listbox | Clickable team list (networked) |
| Team List Item | `.team-list-item` | div | Individual team in list |
| Team List Label | `#teamListLabel` | label | "Select Team" label |
| Device ID | `#deviceId` | text | Settings input |
| Server URL | `#serverUrl` | text | Settings input (networked) |
| GM Password | `#gmPassword` | password | Settings input (networked) |
| Score Adjustment | `#scoreAdjustmentInput` | number | Team details input |

## Modal Elements

| Element | Selector | Purpose |
|---------|----------|---------|
| Connection Modal | `#connectionModal` | Networked mode wizard |
| Modal visible | `#connectionModal.modal` | Check visibility |

## Display Elements

| Element | Selector | Purpose |
|---------|----------|---------|
| Current Team | `#currentTeam` | Shows active team on scan screen |
| Scan Status | `#scanStatus` | NFC scan status text |
| Token Count | `#teamTokenCount` | Tokens scanned for team |
| Total Value | `#teamTotalValue` | Total score for team |
| Result Status | `#resultStatus` | Transaction result status |
| Result Title | `#resultTitle` | Token name/title |
| Result Value | `#resultValue` | Points earned |
| History Badge | `#historyBadge` | Unseen transaction count |
| Total Scans | `#totalScans` | History screen stat |
| Mode Indicator | `#modeIndicator` | Current game mode display |
| Connection Status | `#connectionStatus` | Backend connection state |
| Scoreboard Button | `#scoreboardButton` | Nav button (hidden in standalone) |

## Expected Navigation Flows

### Standalone Mode Happy Path

| Step | Starting Screen | User Action | Expected Result |
|------|-----------------|-------------|-----------------|
| 1 | gameModeScreen | Click standalone button | teamEntryScreen active |
| 2 | teamEntryScreen | Enter team name + click Confirm | scanScreen active, NFC starts |
| 3 | scanScreen | Manual entry with token ID | resultScreen active |
| 4 | resultScreen | Click Continue Scan | scanScreen active |
| 5 | resultScreen | Click Finish Team | teamEntryScreen active |

### Networked Mode Connection Flow

| Step | Starting Screen | User Action | Expected Result |
|------|-----------------|-------------|-----------------|
| 1 | gameModeScreen | Click networked button | connectionModal visible |
| 2 | connectionModal | Enter server URL + password | Modal closes, teamEntryScreen |
| 3 | teamEntryScreen | Click team from list | scanScreen active, NFC starts |

### History/Scoreboard Navigation

| Step | Starting Screen | User Action | Expected Result |
|------|-----------------|-------------|-----------------|
| 1 | scanScreen | Click history button | historyScreen active |
| 2 | historyScreen | Click Back | scanScreen active |
| 1 | scanScreen | Click scoreboard button | scoreboardScreen active |
| 2 | scoreboardScreen | Click team row | teamDetailsScreen active |
| 3 | teamDetailsScreen | Click Back | scoreboardScreen active |

## Quick-Dismiss Pattern (Result Screen)

The result screen uses a "tap anywhere" pattern instead of a dedicated Continue button:

```javascript
// After manualScan(), to continue scanning:
// Click anywhere on result screen (except Finish Team button)
await page.locator('#resultScreen.active').click({ position: { x: 100, y: 100 } });
await page.locator('#scanScreen.active').waitFor({ state: 'visible' });
```

**Implementation:** `src/ui/uiManager.js:159-180` - adds click listener on result screen.

## Page Object Pattern

The `GMScannerPage` class in `tests/e2e/page-objects/GMScannerPage.js` encapsulates these selectors.

> **Note:** The page object's `continueScan()` method is outdated - it references a removed button.
> Use the quick-dismiss pattern above, or update the page object.

**Key methods:**
- `goto()` - Navigate to scanner, wait for gameModeScreen
- `selectStandaloneMode()` - Click standalone, wait for teamEntryScreen
- `enterTeam(name)` - Fill team input
- `confirmTeam()` - Click confirm, wait for scanScreen
- `manualScan(tokenId)` - Handle prompt dialog, wait for resultScreen
- `continueScan()` - **OUTDATED** - use quick-dismiss pattern instead
- `finishTeam()` - Click finish, wait for teamEntryScreen
- `openHistory()` / `closeHistory()` - History navigation

**Example usage (current):**
```javascript
const scanner = new GMScannerPage(page);
await scanner.goto();
await scanner.selectStandaloneMode();
await scanner.enterTeam('Team Alpha');
await scanner.confirmTeam();
await scanner.manualScan('abc123');
expect(await scanner.getResultStatus()).toContain('Transaction Complete');

// Use quick-dismiss instead of continueScan()
await page.locator('#resultScreen.active').click({ position: { x: 100, y: 100 } });
await page.locator('#scanScreen.active').waitFor({ state: 'visible' });
```

## Dialog Handling

Manual entry uses browser prompt dialog:

```javascript
// Register handler BEFORE clicking button
page.once('dialog', dialog => dialog.accept('token-id'));
await page.locator('button[data-action="app.manualEntry"]').click();
await page.locator('#resultScreen.active').waitFor({ state: 'visible' });
```

## Common Assertions

```javascript
// Screen is active
await expect(page.locator('#scanScreen.active')).toBeVisible();

// Element contains text
await expect(page.locator('#currentTeam')).toContainText('Team Alpha');

// Button is enabled/disabled
await expect(page.locator('button[data-action="app.confirmTeamId"]')).toBeEnabled();

// Mode indicator shows correct mode
await expect(page.locator('#modeIndicator')).toContainText('Detective');

// Team appears in list (networked)
await expect(page.locator('#teamList .team-list-item:has-text("001")')).toBeVisible();
```

## Test File Locations

| Test Type | Location | Purpose |
|-----------|----------|---------|
| L2 E2E (Scanner Only) | `tests/e2e/specs/` | Standalone mode, UI navigation |
| Page Objects | `tests/e2e/page-objects/GMScannerPage.js` | Selector encapsulation |
| L3 E2E (Full Stack) | `../../backend/tests/e2e/flows/` | Networked mode with backend |
