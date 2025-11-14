# ALNScanner Screen Flow Diagrams

## 1. Complete Screen Transition Graph

```
STARTUP SEQUENCE
================

App DOMContentLoaded
        ↓
App.init()
        ↓
InitializationSteps (Phases 1A-1J)
        ↓
determineInitialScreen()
        ├─ First-time user? → gameModeScreen
        ├─ Saved mode exists? 
        │   ├─ Connection OK? → teamEntry
        │   └─ Connection lost? → gameModeScreen + wizard
        └─ Default: gameModeScreen


MAIN GAMEPLAY FLOW
==================

                    ┌─────────────────┐
                    │  gameModeScreen │
                    │  (Mode Select)  │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
              Click Networked   Click Standalone
                    │                 │
                    ▼                 ▼
          ┌──────────────────┐  ┌──────────────┐
          │  Connection      │  │  teamEntry   │
          │  Wizard Modal    │  │  (Numpad)    │
          └────────┬─────────┘  └────────┬─────┘
                   │                     │
         Auth success?                   │
           ✓              ▼◄─────────────┘
           │    Input team number (1-10 digits)
           │              │
           └─────┬────────┘
                 │
                 ▼
         ┌─────────────────┐
         │  teamEntry      │
         │  (Numpad)       │
         └────────┬────────┘
                  │
         Click Enter (team ID ready)
                  │
                  ▼
         ┌─────────────────┐
         │  scanScreen     │
         │  (NFC scanning) │
         └────────┬────────┘
                  │
      ┌──────────┬┴──────────┬──────────┐
      │          │           │          │
    Scan      Manual       Back         Click
   Token      Entry      to Team    Scoreboard
      │          │        Entry       (Black
      ▼          ▼         │         Market
 [PROCESS]  [PROCESS]     │         only)
      │          │         │          │
      └──────┬───┘         │          ▼
             │             │    ┌──────────────┐
             ▼             │    │scoreboard    │
    ┌─────────────────┐    │    │(Rankings)    │
    │  resultScreen   │    │    └────┬─────────┘
    │  (Token result) │    │         │
    └────────┬────────┘    │    Click on team
             │              │         │
      ┌──────┴──┐            │         ▼
      │         │            │    ┌──────────────┐
  Continue   Finish       ◄──┤    │teamDetails   │
  Scanning   Team             │    │(Breakdown)   │
      │         │             │    └──────┬───────┘
      └─┐       │             │           │
        │       │             │      Click Back
        │       └─────┬───────┴─────────────┤
        │             │                     │
        ▼             ▼                     ▼
   [Scan]     [Team Entry]      [Scoreboard]


OVERLAY SCREENS & MODALS
========================

From ANY screen:
  └─ Click (📋) History     → historyScreen
  └─ Click (🏆) Scoreboard  → scoreboardScreen (Black Market only)
  └─ Click (⚙️) Settings    → settingsScreen
  └─ Click (🔗) Connection  → connectionModal


BACK NAVIGATION RULES
====================

historyScreen → UIManager.previousScreen or teamEntry
scoreboardScreen → UIManager.previousScreen or teamEntry
teamDetailsScreen → scoreboardScreen (always)
settingsScreen → [wherever you came from] or teamEntry

Note: historyScreen, scoreboardScreen, teamDetailsScreen, 
      gameModeScreen, loadingScreen are NOT saved as previousScreen


VIEW TABS (NETWORKED MODE ONLY)
===============================

#viewSelector (3 tabs) - Hidden in standalone, shown in networked
┌─────────────────────────────────────────────┐
│ [📱 Scanner] [⚙️ Admin] [🐛 Debug]          │
└─────────────────────────────────────────────┘
       │              │             │
       ▼              ▼             ▼
  #scanner-view  #admin-view  #debug-view
  (Main screens) (Orchestrator (Console)
                  controls)
```

---

## 2. Screen Dependency Tree

```
UIManager.screens object maps screen names to elements:

UIManager.screens = {
    loading:        #loadingScreen
    settings:       #settingsScreen
    gameModeScreen: #gameModeScreen
    teamEntry:      #teamEntryScreen
    scan:           #scanScreen
    result:         #resultScreen
    history:        #historyScreen
    scoreboard:     #scoreboardScreen
    teamDetails:    #teamDetailsScreen
}

Screen Display Hierarchy:
┌─ Container (.container)
│  ├─ #viewSelector (view-tab buttons) - Hidden in standalone
│  │
│  └─ View Content (.view-content)
│     └─ #scanner-view (active by default)
│        ├─ #loadingScreen (active on startup)
│        ├─ #settingsScreen
│        ├─ #gameModeScreen
│        ├─ #teamEntryScreen
│        ├─ #scanScreen
│        ├─ #resultScreen
│        ├─ #historyScreen
│        ├─ #scoreboardScreen
│        └─ #teamDetailsScreen
│
│     #admin-view (hidden in standalone, shown in networked)
│        └─ Session/Video/System sections
│
│     #debug-view (hidden by default)
│        └─ Debug console content

Modal Overlays (NOT in view structure):
├─ #connectionModal (connection wizard)
└─ #error-container (toast notifications)
```

---

## 3. SessionModeManager State Flow

```
SessionModeManager FSM
======================

     ┌──────────┐
     │   NULL   │ (Initial state)
     └────┬─────┘
          │
    selectGameMode()
          │
    ┌─────┴──────────┐
    │                │
    ▼                ▼
┌──────────┐    ┌────────────┐
│NETWORKED │    │STANDALONE  │
│(locked)  │    │(locked)    │
└────┬─────┘    └────┬───────┘
     │                │
     │         initStandaloneMode()
     │                │
     │                ▼
     │         teamEntry (direct)
     │
initNetworkedMode()
     │
     ▼
Connection Wizard Modal
     │
     ├─ Auth Success → connectionManager initialized
     │                 → teamEntry
     │
     └─ Auth Failure → connectionModal stays open
                      → user can retry or cancel

clearMode() [on connection loss]
     │
     ▼
  mode = null
  locked = false
     │
     ▼
  gameModeScreen (need to choose mode again)

Properties:
  mode: null | 'networked' | 'standalone'
  locked: boolean (once set, cannot change)
```

---

## 4. UIManager.showScreen() Logic

```
UIManager.showScreen(screenName)
=================================

Input: screenName (e.g., 'scan', 'result', 'history')

Step 1: Track Previous Screen
────────────────────────────
  Get current active screen
  If current NOT in [historyScreen, scoreboardScreen, 
                     teamDetailsScreen, gameModeScreen, 
                     loadingScreen]
  AND screenName NOT in ['history', 'scoreboard', 'teamDetails']
    → Store current.id as previousScreen (stripped of 'Screen' suffix)

Step 2: Hide All Screens
────────────────────────
  For each screen in UIManager.screens
    → Remove 'active' class

Step 3: Show Target Screen
──────────────────────────
  Add 'active' class to UIManager.screens[screenName]

Result: Only one .screen.active at a time


CSS Classes Applied:
════════════════════
.screen {
    display: none;  /* Default: hidden */
}

.screen.active {
    display: block;  /* Shown when active class present */
}


Navigation Stack:
════════════════
UIManager.previousScreen stores ONE screen (most recent non-overlay)

Example:
  teamEntry → scanScreen → resultScreen
  previousScreen = 'scan'
  
  resultScreen → historyScreen (doesn't update previousScreen)
  previousScreen still = 'scan'
  
  historyScreen [close] → goes to previousScreen = 'scan'
```

---

## 5. View Switching Architecture (Networked Mode)

```
App.switchView(viewName) Flow
==============================

Input: viewName ('scanner', 'admin', or 'debug')

Step 1: Hide All View Contents
───────────────────────────────
  document.querySelectorAll('.view-content')
    → style.display = 'none'

Step 2: Show Selected View
──────────────────────────
  Get #${viewName}-view element
  → style.display = 'block'

Step 3: Update Tab Highlighting
────────────────────────────────
  Remove 'active' class from all .view-tab buttons
  Add 'active' class to button[data-view="${viewName}"]

Step 4: View-Specific Initialization
─────────────────────────────────────
  if viewName === 'admin':
    → Initialize admin modules if not done
    → Refresh system monitor
    → Fetch current session state
    → Update admin panel displays


View Content Structure:
═════════════════════

Before:
  #scanner-view (active, display: block)
    - All main screens (.screen)
  
  #admin-view (inactive, display: none)
  
  #debug-view (inactive, display: none)

After switchView('admin'):
  #scanner-view (inactive, display: none)
  
  #admin-view (active, display: block)
  
  #debug-view (inactive, display: none)


Important Distinction:
════════════════════
- Screens (.screen) control WHAT you see within a view
- Views (.view-content) control WHICH entire interface you see
- Screens only work within active view
- Switching views doesn't change active screen, just hides parent view
```

---

## 6. Initialization Decision Tree

```
InitializationSteps.determineInitialScreen()
=============================================

START
  │
  ▼
Load sessionModeManager.restoreMode()
  │
  ├─ Returns null (no saved mode)
  │   │
  │   └─→ Return { screen: 'gameModeScreen', action: null }
  │       └─→ User must choose mode
  │
  └─ Returns 'networked' or 'standalone' (has saved mode)
      │
      ▼
    sessionModeManager.isConnectionReady()?
      │
      ├─ NO (connection lost or unavailable)
      │   │
      │   └─→ Return { 
      │         screen: 'gameModeScreen',
      │         action: 'clearModeAndShowWizard'
      │       }
      │       └─→ Clear mode + show connection wizard
      │
      └─ YES (connection active or standalone)
          │
          └─→ Return { screen: 'teamEntry', action: null }
              └─→ Proceed directly to scanning


isConnectionReady() Implementation:
═══════════════════════════════════

if mode !== 'networked':
    return true  // Standalone doesn't need connection

if mode === 'networked':
    return window.connectionManager?.client?.isConnected === true
    
Note: Property is 'isConnected' not 'connected'
```

---

## 7. Connection Wizard Modal Flow

```
Connection Wizard Modal (#connectionModal)
===========================================

Trigger:
  1. App.selectGameMode('networked')
  2. Click connection status indicator (🔗)
  3. Connection restoration fail detected

Display:
  showConnectionWizard()
    → modal.style.display = 'flex'
    → Auto-triggers scanForServers() after 100ms


Modal Content:
┌──────────────────────────────────────┐
│ Connect to Game Server               │
├──────────────────────────────────────┤
│                                      │
│  [🔍 Scan for Game Servers] (primary)
│  Discovery Status: searching...      │
│                                      │
│  ─── OR Enter Manually ───           │
│                                      │
│  Server Address: [____________]      │
│  Station Name:   [____________]      │
│  GM Password:    [____________]      │
│                                      │
│  [Connection Status Message]         │
│                                      │
│  [Connect] [Cancel]                  │
└──────────────────────────────────────┘


User Flow:
──────────
Option A: Auto-discovery
  [🔍 Scan] → UDP broadcast → Found servers appear
            → Click server → Auto-fill form
            → [Connect] → handleConnectionSubmit()

Option B: Manual entry
  Server: 10.0.0.135:3000
  Station: GM Station 1
  Password: admin-password
  [Connect] → handleConnectionSubmit()

Option C: Cancel
  [Cancel] → Modal closes
          → SessionModeManager.clearMode()
          → UIManager.showScreen('gameModeScreen')


handleConnectionSubmit() Steps:
──────────────────────────────
1. Validate inputs (server, station, password)
2. Test health check: GET /health (3s timeout)
3. Authenticate: POST /api/admin/auth
4. Get JWT token from response
5. Store in window.connectionManager
6. Call connectionManager.connect()
7. If connected:
   - Show success message
   - Set sessionModeManager.mode = 'networked'
   - Set sessionModeManager.locked = true
   - Show #viewSelector tabs
   - Close modal
   - Transition to teamEntry
8. If failed:
   - Show error message
   - Keep modal open for retry
```

---

## 8. Screen Visibility Rules by Mode

```
Mode: STANDALONE
════════════════
#viewSelector:                 HIDDEN
#scanner-view:                 VISIBLE
  #loadingScreen:             (active on load)
  #gameModeScreen:            (active after init)
  #teamEntryScreen:           (active after mode selection)
  #scanScreen:                (active after team entry)
  #resultScreen:              (active after scan)
  #settingsScreen:            (visible on demand)
  #historyScreen:             (visible on demand)
  #scoreboardScreen:          ALWAYS VISIBLE
  #teamDetailsScreen:         (visible on demand)
#admin-view:                   HIDDEN
#debug-view:                   HIDDEN

Special: Scoreboard Button (🏆)
  - Black Market mode: VISIBLE
  - Detective mode: HIDDEN (style.display = 'none')


Mode: NETWORKED
═══════════════
#viewSelector:                 VISIBLE (3 tabs)
  [📱 Scanner] [⚙️ Admin] [🐛 Debug]

#scanner-view:                 VISIBLE (default tab)
  [Same screens as standalone]

#admin-view:                   VISIBLE (admin tab)
  Session Management
    - Create/Pause/Resume/End session
    - View session details
    - Connected devices list
  Video Controls
    - Play/Pause/Stop/Skip
    - Manual queue management
    - Video progress tracking
  System Status
    - Orchestrator health
    - VLC connection status
    - Device monitoring

#debug-view:                   VISIBLE (debug tab)
  - Real-time debug output
  - Event logs
  - WebSocket event monitoring


Mode-Specific Controls:
════════════════════════
GM Intervention (Admin Score Adjustment)
  - Standalone: NOT AVAILABLE (hidden)
  - Networked: AVAILABLE (visible in teamDetailsScreen)
    → Input adjustment amount (+ or -)
    → Optional reason text
    → Synced to orchestrator

Admin Panel
  - Standalone: NOT AVAILABLE (admin tab hidden)
  - Networked: AVAILABLE (admin tab visible, initialized on switch)
```

---

## 9. Error & Notification Display (Not Screens)

```
Error Display System
════════════════════

Fixed Position Container: #error-container (top-right corner)
  └─ Position: fixed, top: 20px, right: 20px
  └─ z-index: 9999 (above all screens)


Types:

1. Error Message
   UIManager.showError(message, duration = 5000)
   ├─ Auto-dismisses after 5 seconds
   ├─ Slide-out animation
   └─ Example: "Failed to scan token"

2. Toast Notification
   UIManager.showToast(message, type, duration = 3000)
   ├─ type: 'info' | 'success' | 'warning' | 'error'
   ├─ Auto-dismisses after 3 seconds (customizable)
   ├─ Color-coded by type
   └─ Examples:
       - UIManager.showToast("Connected!", "success")
       - UIManager.showToast("No connection", "warning")
       - UIManager.showToast("System reset complete", "success")


CSS Classes:
  .error-message    (red background, auto-dismiss)
  .toast            (base toast style)
  .toast-info       (blue)
  .toast-success    (green)
  .toast-warning    (orange)
  .toast-error      (red)


Examples NOT considered screens:
  ├─ "Team registered: Team 001"
  ├─ "Token scanned successfully"
  ├─ "Connection lost - retrying..."
  ├─ "Admin adjustment submitted"
  └─ Any transient notification


Do NOT conflict with screen visibility - appear on top
regardless of which screen is active.
```

---

## 10. Complete Navigation Reference

```
KEYBOARD NUMPAD NAVIGATION
══════════════════════════

Only on teamEntryScreen:
  0-9           → Append digit to team ID
  Clear button  → Reset team ID
  Enter button  → Confirm and proceed to scanScreen


BUTTON NAVIGATION
════════════════

Header Buttons (always visible):
  🔗 Connection Status → showConnectionWizard()
  📋 History          → App.showHistory()
  🏆 Scoreboard       → App.showScoreboard() (Black Market only)
  ⚙️ Settings         → App.showSettings()

Screen Buttons:
  gameModeScreen:
    [🌐 Networked Game]   → App.selectGameMode('networked')
    [📱 Standalone Game]  → App.selectGameMode('standalone')

  settingsScreen:
    [Save & Start]        → App.saveSettings()
    [Data Export/Clear]   → DataManager methods

  teamEntryScreen:
    [0-9] numpad          → App.appendNumber(n)
    [Clear]               → App.clearTeamId()
    [Enter]               → App.confirmTeamId()

  scanScreen:
    [Start Scanning]      → App.startScan()
    [Manual Entry]        → App.manualEntry()
    [Back to Team Entry]  → App.cancelScan()

  resultScreen:
    [Scan Another Token]  → App.continueScan()
    [Finish Team]         → App.finishTeam()

  historyScreen:
    [Back]                → App.closeHistory()

  scoreboardScreen:
    [Click Team Card]     → App.showTeamDetails(teamId)
    [Back]                → App.closeScoreboard()

  teamDetailsScreen:
    [Adjust Score]        → App.adjustTeamScore() (Networked only)
    [Back to Scoreboard]  → App.closeTeamDetails()

  admin-view tabs (Networked mode):
    [Session Management]  → Create/manage sessions
    [Video Controls]      → Play/queue videos
    [System Status]       → Monitor health


CONTEXT-SENSITIVE NAVIGATION
════════════════════════════

Based on current screen:
  scanScreen with data → [Scan Another] enabled
  scanScreen no data   → [Finish Team] enabled
  scoreboardScreen     → Teams clickable only if has transactions
  historyScreen        → [Back] returns to scanScreen or teamEntry
  teamDetailsScreen    → [Back] always returns to scoreboardScreen
```

