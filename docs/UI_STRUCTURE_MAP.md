# ALNScanner UI Structure and Screen Flow Map

## Complete Screen Inventory

### All Screen IDs (from index.html)
The app defines the following screen elements, all with class `screen` (hidden by default, shown via `.active` class):

| Screen ID | Screen Name | Purpose | Container |
|-----------|-------------|---------|-----------|
| `loadingScreen` | Loading | Initial app load, token database loading | scanner-view (lines 1463-1468) |
| `settingsScreen` | Settings | Device ID configuration, mode toggle, data management | scanner-view (lines 1471-1505) |
| `gameModeScreen` | Game Mode Selection | Choose networked vs standalone operation | scanner-view (lines 1508-1551) |
| `teamEntryScreen` | Team Entry | Numeric keypad for team ID input (1-10 digits) | scanner-view (lines 1553-1570) |
| `scanScreen` | Scan | NFC/RFID scanning interface with live stats | scanner-view (lines 1572-1595) |
| `resultScreen` | Result | Transaction result display with token details | scanner-view (lines 1597-1623) |
| `historyScreen` | History | Transaction log with filters and statistics | scanner-view (lines 1625-1662) |
| `scoreboardScreen` | Scoreboard | Black Market team rankings (networked & standalone) | scanner-view (lines 1664-1676) |
| `teamDetailsScreen` | Team Details | Detailed token breakdown, bonuses, admin controls | scanner-view (lines 1678-1719) |

**Container Structure:**
- All screens are nested inside `#scanner-view` (lines 1459-1722)
- `#scanner-view` is a view container that can be hidden/shown with tab switching
- `#admin-view` and `#debug-view` are parallel view containers (networked mode only)

---

## Screen Visibility Management

### CSS-Based Visibility
```css
.screen {
    display: none;  /* All hidden by default */
}

.screen.active {
    display: block;  /* Shown when .active class present */
}
```

### UIManager.showScreen(screenName)
**Location:** `js/ui/uiManager.js:102-125`

**Implementation:**
1. Hides all `.screen` elements
2. Adds `.active` class to target screen
3. Tracks `previousScreen` for back navigation (excludes overlay screens)

**Back Navigation Logic:**
- Tracks previous screen automatically (except: historyScreen, scoreboardScreen, teamDetailsScreen, gameModeScreen, loadingScreen)
- Overlay screens are NOT saved as previousScreen
- Back buttons use `UIManager.previousScreen` or default to 'teamEntry'

**Code Snippet:**
```javascript
showScreen(screenName) {
    // Track previous screen for back navigation
    const current = document.querySelector('.screen.active');
    if (current && current.id !== 'historyScreen' &&
        current.id !== 'scoreboardScreen' &&
        current.id !== 'teamDetailsScreen' &&
        current.id !== 'gameModeScreen' &&
        current.id !== 'loadingScreen' &&
        screenName !== 'history' &&
        screenName !== 'scoreboard' &&
        screenName !== 'teamDetails') {
        this.previousScreen = current.id.replace('Screen', '');
    }

    // Hide all screens
    Object.values(this.screens).forEach(screen => {
        screen.classList.remove('active');
    });

    // Show requested screen
    if (this.screens[screenName]) {
        this.screens[screenName].classList.add('active');
    }
}
```

---

## Initial Screen Determination

### Startup Sequence (InitializationSteps.js)

The app determines which screen to show on first load using phased initialization:

**Phase 1A-1J: Initialization Phases**
1. **Phase 1A:** Load token database (TokenManager)
2. **Phase 1B:** Apply URL mode override (?mode=blackmarket)
3. **Phase 1C-1D:** UI and SessionModeManager initialization
4. **Phase 1E-1I:** Module initialization (Settings, DataManager, NFC detection)
5. **Phase 1J:** Service Worker registration

**Then: determineInitialScreen() Decision Tree**

Location: `js/app/initializationSteps.js:152-171`

```
┌─────────────────────────────────────────┐
│  Start App                              │
└──────────────────┬──────────────────────┘
                   │
        Call determineInitialScreen()
                   │
        ┌──────────┴──────────┐
        │                     │
   Has saved mode?       No saved mode
   (localStorage)        (first-time user)
        │                     │
        NO                    YES
        │                     │
        ▼                     ▼
  Show gameModeScreen   Is connection ready?
  (Choose mode)         (if networked mode)
                             │
                    ┌────────┴────────┐
                    │                 │
                   YES               NO
                    │                 │
                    ▼                 ▼
              Show teamEntry    Clear mode + show
                             gameModeScreen +
                             show connection wizard
```

**Code Logic:**
```javascript
function determineInitialScreen(sessionModeManager) {
    const savedMode = sessionModeManager.restoreMode();

    // Case 1: No saved mode (first-time user)
    if (!savedMode) {
        return { screen: 'gameModeScreen', action: null };
    }

    // Case 2: Has saved mode - check if connection still valid
    if (!sessionModeManager.isConnectionReady()) {
        return {
            screen: 'gameModeScreen',
            action: 'clearModeAndShowWizard'
        };
    }

    // Case 3: Saved mode + connection ready - proceed to team entry
    return { screen: 'teamEntry', action: null };
}
```

### Initial Screen by Scenario

| Scenario | Initial Screen | Notes |
|----------|----------------|-------|
| **First Load** | `gameModeScreen` | User selects networked or standalone |
| **Networked Mode Selected** | Connection Wizard Modal | Shows discovery + manual entry form |
| **Networked Mode Connected** | `teamEntry` | Connection successful, ready to scan |
| **Networked Mode Failed** | `gameModeScreen` | Connection lost/unavailable, re-show mode selection |
| **Standalone Mode Selected** | `teamEntry` | No connection needed, direct to scanning |
| **Returning User (Networked)** | `teamEntry` (if connected) or `gameModeScreen` | Checks if connection still active |
| **Returning User (Standalone)** | `teamEntry` | Restores saved mode from localStorage |

---

## Screen Transition Flow Diagram

### Main Gameplay Loop

```
┌──────────────┐
│  Loading     │ (Initial app load, loading token database)
└───────┬──────┘
        │
        ▼
┌──────────────────────────┐
│  Game Mode Selection     │ (Choose networked or standalone)
│  [Networked / Standalone]│
└───────┬──────────────────┘
        │
    ┌───┴────┐
    │         │
    ▼         ▼
[Networked] [Standalone]
    │         │
    │    ┌────┴───────────┐
    │    │                │
    ▼    ▼                ▼
  [Connection]      [Team Entry]
   [Wizard]              │
   Modal                 │
    │                    │
    └────────┬───────────┘
             │
             ▼
       ┌──────────────┐
       │  Team Entry  │ (Enter team ID via numpad)
       └──────┬───────┘
              │
              ▼
       ┌──────────────┐
       │  Scan        │ (NFC/RFID scanning)
       │  [Start/    │ (Shows team stats)
       │   Manual]   │
       └──────┬───────┘
              │
              ▼
       ┌──────────────┐
       │  Result      │ (Token details, value, group)
       │ [Continue /  │
       │  Finish]     │
       └──────┬───────┘
              │
        ┌─────┴─────┐
        │           │
   Continue?    Finish Team?
        │           │
        ▼           ▼
   [Scan]    [Team Entry]
              (back to top)
```

### Navigation from All Screens

| Current Screen | Navigation Actions | Destination |
|----------------|-------------------|-------------|
| `loadingScreen` | (automatic) | `gameModeScreen` |
| `gameModeScreen` | Select Networked | Connection Wizard Modal |
| `gameModeScreen` | Select Standalone | `teamEntry` |
| `settingsScreen` | Save & Start | `teamEntry` |
| `teamEntryScreen` | Enter Team ID | `scanScreen` |
| `scanScreen` | Start Scanning | NFC listener active |
| `scanScreen` | Manual Entry | Prompt for RFID |
| `scanScreen` | Back to Team Entry | `teamEntry` |
| `resultScreen` | Scan Another | `scanScreen` |
| `resultScreen` | Finish Team | `teamEntry` |
| `scanScreen` | Click History Button (📋) | `historyScreen` |
| `historyScreen` | Back | previousScreen or `teamEntry` |
| `scanScreen` | Click Scoreboard Button (🏆) | `scoreboardScreen` (Black Market only) |
| `scoreboardScreen` | Click Team | `teamDetailsScreen` |
| `teamDetailsScreen` | Back | `scoreboardScreen` |
| `scoreboardScreen` | Back | previousScreen or `teamEntry` |
| `*` | Click Settings (⚙️) | `settingsScreen` |
| `*` | Click Connection Status (🔗) | Connection Wizard Modal |

### Modal Dialogs (Not Screen-Based)

**Connection Wizard Modal** (`#connectionModal`)
- Modal overlay with form
- Triggered by:
  - Game mode selection (networked mode)
  - Clicking connection status indicator
  - Failed connection restoration
- Actions:
  - Scan for servers (UDP discovery)
  - Manual server entry
  - Authenticate with password
  - On success: Close modal, show `teamEntry`
  - On cancel: Return to `gameModeScreen`

---

## View Tabs (Networked Mode Only)

### View Container Structure

**Location:** `index.html:1443-1457`

The app has three parallel **view containers** (different from screens):
1. `#scanner-view` (default, contains all main screens)
2. `#admin-view` (orchestrator control panel)
3. `#debug-view` (real-time console)

**View Tab Selector:**
```html
<div id="viewSelector" class="view-selector" style="display: none;">
    <!-- Only visible in networked mode -->
    <button class="view-tab active" data-view="scanner" onclick="App.switchView('scanner')">
        <span class="tab-icon">📱</span>
        <span class="tab-text">Scanner</span>
    </button>
    <button class="view-tab" data-view="admin" onclick="App.switchView('admin')">
        <span class="tab-icon">⚙️</span>
        <span class="tab-text">Admin</span>
    </button>
    <button class="view-tab" data-view="debug" onclick="App.switchView('debug')">
        <span class="tab-icon">🐛</span>
        <span class="tab-text">Debug</span>
    </button>
</div>
```

### View Switching Logic

**Location:** `js/app/app.js:146-187` (App.viewController.switchView)

```javascript
switchView(viewName) {
    // Hide all view contents
    document.querySelectorAll('.view-content').forEach(view => {
        view.style.display = 'none';
    });

    // Show selected view
    const selectedView = document.getElementById(`${viewName}-view`);
    if (selectedView) {
        selectedView.style.display = 'block';
    }

    // Update tab highlighting
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    const activeTab = document.querySelector(`[data-view="${viewName}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }

    this.currentView = viewName;

    // Trigger view-specific initialization
    if (viewName === 'admin') {
        // Initialize admin panel on first switch
        if (!this.adminInstances) {
            this.initAdminModules();
        }
        if (this.adminInstances) {
            this.adminInstances.systemMonitor.refresh();
            this.fetchCurrentSession();
        }
        // Update admin panel displays
        if (typeof App !== 'undefined') {
            App.updateAdminPanel();
        }
    }
}
```

### View Tab Behavior

**Display Control:**
- `#viewSelector` is hidden by default (`style="display: none"`)
- Shown only in networked mode: `document.getElementById('viewSelector').style.display = 'flex'` (SessionModeManager.initNetworkedMode())

**Active Tab Indicator:**
- Uses CSS class `.active` on tab button
- Tab with `data-view="scanner"` starts active (line 1445)

**View Content Structure:**
```html
<!-- Scanner View (Default) -->
<div id="scanner-view" class="view-content">
    <!-- All main screens nested here -->
    <div id="loadingScreen" class="screen active">...</div>
    <div id="teamEntryScreen" class="screen">...</div>
    ...
</div>

<!-- Admin View (Networked Mode Only) -->
<div id="admin-view" class="view-content" style="display: none;">
    <!-- Admin panel sections -->
    <section class="admin-section">...</section>
    ...
</div>

<!-- Debug View -->
<div id="debug-view" class="view-content" style="display: none;">
    <div id="debugContent" class="debug-content"></div>
</div>
```

**Important:** Screens work WITHIN the active view container. When you switch views, you're showing/hiding entire view containers, not individual screens. The screens are only visible when their parent view is active.

---

## Screen Visibility Prerequisites and Conditional Logic

### Settings Screen
- Always available
- Accessed via Settings button (⚙️)
- Used for device ID configuration and mode toggle

### Scoreboard Screen
- **Black Market Mode ONLY** (detective mode hides scoreboard button)
- Networked and Standalone modes both support scoreboard
- Accessed via Scoreboard button (🏆) - only visible in Black Market mode
- Code check: `if (Settings.mode !== 'blackmarket') { return; }`

### Team Details Screen
- Accessed by clicking a team entry on scoreboard
- Requires at least one transaction recorded
- Shows detailed token breakdown with bonuses
- Networked mode: Shows GM intervention controls (score adjustment)
- Standalone mode: No intervention controls

### History Screen
- Always accessible via History button (📋)
- Shows all transactions with search/filter
- Badge shows transaction count (hidden when empty)

### Admin View
- **Networked Mode ONLY**
- Hidden by default (`style="display: none"`)
- Initialized only after connection established
- Contains three admin sections:
  1. Session Management (create/pause/resume/end sessions)
  2. Video Controls (play/pause/stop, queue management)
  3. System Status (orchestrator health, VLC status, device list)

### Debug View
- Available in all modes (networked and standalone)
- Real-time debug console output
- Populated by Debug module logging

---

## Screen IDs and CSS Class Reference

### UIManager Screen Mapping
**Location:** `js/ui/uiManager.js:18-28`

```javascript
this.screens = {
    loading: document.getElementById('loadingScreen'),
    settings: document.getElementById('settingsScreen'),
    gameModeScreen: document.getElementById('gameModeScreen'),
    teamEntry: document.getElementById('teamEntryScreen'),
    scan: document.getElementById('scanScreen'),
    result: document.getElementById('resultScreen'),
    history: document.getElementById('historyScreen'),
    scoreboard: document.getElementById('scoreboardScreen'),
    teamDetails: document.getElementById('teamDetailsScreen')
};
```

### CSS Classes for Styling
```css
.screen          /* Base class for all screens (display: none) */
.screen.active   /* Applied when screen is visible (display: block) */
.view-content    /* Container for screens or admin/debug views */
.view-tab        /* Tab button styling */
.view-tab.active /* Active tab highlighting */
.view-selector   /* Tab bar container */
```

---

## Key Implementation Details

### Screen Transition Triggers
All screen transitions go through **App methods** (js/app/app.js):

```javascript
// Screen Navigation Methods
App.showSettings()          // Show settings
App.showHistory()           // Show transaction history + update stats
App.closeHistory()          // Return to previous screen
App.showScoreboard()        // Show team rankings (Black Market only)
App.closeScoreboard()       // Return to previous screen
App.showTeamDetails(teamId) // Show team detail breakdown
App.closeTeamDetails()      // Return to scoreboard
App.toggleMode()            // Switch detective/black market mode
App.selectGameMode(mode)    // Set networked or standalone mode
```

### Error Display System (Phase 4.3)
```javascript
// Two error notification methods (not screens)
UIManager.showError(message, duration)    // Persistent error (auto-dismiss in 5s)
UIManager.showToast(message, type, time)  // Toast notification (info/success/warning/error)

// Both use fixed-position error container at top-right corner
// Do NOT affect screen visibility
```

### ConnectionManager Integration
The Connection Wizard is initiated by:
1. `SessionModeManager.initNetworkedMode()` - on mode selection
2. `App.selectGameMode('networked')` - user clicked networked option
3. Clicking connection status indicator at top

Function: `showConnectionWizard()` (inline in index.html:2068-2074)

---

## Summary: Screen Transition Quick Reference

**By User Action:**

| Action | Current Screen | Destination | Method |
|--------|----------------|-------------|--------|
| App loads | (none) | Loading → GameModeScreen | App.init() → InitializationSteps |
| Select mode | GameModeScreen | (Networked: Wizard) or (Standalone: TeamEntry) | App.selectGameMode() → SessionModeManager.setMode() |
| Connect networked | Wizard Modal | TeamEntry | handleConnectionSubmit() |
| Enter team ID | TeamEntry | ScanScreen | App.confirmTeamId() → UIManager.showScreen('scan') |
| Scan token | ScanScreen | ResultScreen | App.processScan() → UIManager.showScreen('result') |
| Scan another | ResultScreen | ScanScreen | App.continueScan() |
| Finish team | ResultScreen | TeamEntry | App.finishTeam() |
| Click history | Any | HistoryScreen | App.showHistory() |
| Click back (history) | HistoryScreen | PreviousScreen | App.closeHistory() |
| Click scoreboard | ScanScreen | ScoreboardScreen | App.showScoreboard() (Black Market only) |
| Click team (on board) | ScoreboardScreen | TeamDetailsScreen | App.showTeamDetails(teamId) |
| Click back (details) | TeamDetailsScreen | ScoreboardScreen | App.closeTeamDetails() |
| Click settings | Any | SettingsScreen | App.showSettings() |
| Click connection icon | Any | Connection Wizard | showConnectionWizard() |
| Switch view tab | CurrentView | SelectedView | App.switchView(viewName) |

---

## File Cross-References

### Key Implementation Files
- **Screen definitions:** `index.html:1462-1719` (all `.screen` elements)
- **View tabs:** `index.html:1443-1457` (viewSelector)
- **UIManager:** `js/ui/uiManager.js` (showScreen, screen visibility)
- **SessionModeManager:** `js/app/sessionModeManager.js` (mode selection, connection)
- **Initialization:** `js/app/initializationSteps.js` (startup sequence)
- **App Navigation:** `js/app/app.js` (screen transition methods)
- **Settings:** `js/ui/settings.js` (device config)
- **Connection Wizard:** `index.html:1377-1417` (modal UI)

### CSS Styling
- **Screen visibility:** `index.html:240-246` (.screen / .screen.active)
- **View tabs:** `index.html:278-312` (.view-selector / .view-tab)
- **Error display:** `index.html:1168-1216` (.error-container / .toast)
- **Modal:** `index.html:1221-1373` (.modal / .modal-content)

