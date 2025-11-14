# ALNScanner UI Map - Quick Reference Summary

## Document Overview

This folder contains comprehensive documentation of the ALNScanner UI structure and screen flow:

1. **UI_STRUCTURE_MAP.md** - Detailed reference of all screens, navigation logic, and implementation details
2. **SCREEN_FLOW_DIAGRAMS.md** - Visual diagrams showing screen transitions, state flows, and modal behaviors
3. **UI_MAP_SUMMARY.md** - This quick reference guide

---

## All Screens at a Glance

| Screen ID | Name | Purpose | Mode(s) |
|-----------|------|---------|---------|
| `#loadingScreen` | Loading | Token database load | Both |
| `#settingsScreen` | Settings | Device config | Both |
| `#gameModeScreen` | Game Mode | Choose networked/standalone | Both |
| `#teamEntryScreen` | Team Entry | Numpad for team ID | Both |
| `#scanScreen` | Scan | NFC scanning interface | Both |
| `#resultScreen` | Result | Token details display | Both |
| `#historyScreen` | History | Transaction log | Both |
| `#scoreboardScreen` | Scoreboard | Team rankings | Both |
| `#teamDetailsScreen` | Team Details | Token breakdown + bonuses | Both |

**View Tabs (Networked Only):**
- `#scanner-view` - Main gameplay (contains all screens above)
- `#admin-view` - Orchestrator controls (session, video, system)
- `#debug-view` - Debug console

---

## Initial Screen Decision

**First-time user:** `gameModeScreen` (choose mode)
**Returning user (networked):** `teamEntry` (if connected) or `gameModeScreen` (if connection lost)
**Returning user (standalone):** `teamEntry` (direct, no connection needed)

---

## Screen Transition Commands

```javascript
UIManager.showScreen('scan')           // Hide all, show scanScreen
App.showSettings()                     // UIManager.showScreen('settings')
App.showHistory()                      // UIManager.showScreen('history')
App.showScoreboard()                   // UIManager.showScreen('scoreboard')
App.showTeamDetails(teamId)            // UIManager.showScreen('teamDetails')
```

---

## View Tab Switching (Networked Mode Only)

```javascript
App.switchView('scanner')    // Show #scanner-view (all main screens)
App.switchView('admin')      // Show #admin-view (orchestrator controls)
App.switchView('debug')      // Show #debug-view (console)
```

---

## Key Navigation Patterns

### Main Gameplay Flow
```
gameModeScreen 
  ↓
[Choose Mode]
  ├─ Networked → Connection Wizard Modal
  └─ Standalone → teamEntry
  ↓
teamEntry
  ↓
[Enter team ID via numpad]
  ↓
scanScreen
  ↓
[Scan token with NFC]
  ↓
resultScreen
  ↓
[Continue or Finish]
  ├─ Continue → scanScreen
  └─ Finish → teamEntry
```

### Overlay Navigation (From Any Screen)
```
Header Buttons:
  🔗 Connection → connectionModal
  📋 History → historyScreen
  🏆 Scoreboard → scoreboardScreen (Black Market only)
  ⚙️ Settings → settingsScreen
```

---

## Back Navigation Rules

**Auto-tracked by UIManager.previousScreen (except overlay screens):**
- `historyScreen` → previous or `teamEntry`
- `scoreboardScreen` → previous or `teamEntry`
- `teamDetailsScreen` → `scoreboardScreen` (always)
- `settingsScreen` → (uses normal back button)

**Excluded from previousScreen tracking:**
- `loadingScreen`, `gameModeScreen`, `historyScreen`, `scoreboardScreen`, `teamDetailsScreen`

---

## Mode-Specific Features

### Standalone Mode
- No connection wizard
- No view tabs (hidden)
- No admin panel
- No GM interventions
- Scoreboard always available (all modes)
- Local-only scoring

### Networked Mode
- Connection wizard required
- View tabs visible (scanner/admin/debug)
- Admin panel available
- GM interventions (score adjustments)
- Real-time sync with orchestrator
- Video control from admin panel

---

## UI Implementation Quick Facts

**Screen Visibility:**
- All `.screen` elements hidden by default (`display: none`)
- One `.screen.active` at a time (`display: block`)
- CSS classes controlled by `UIManager.showScreen()`

**View Containers:**
- Only one `.view-content` visible at a time
- Views selected by `App.switchView()`
- Screens only visible within active view

**Modals:**
- `#connectionModal` - Fixed position overlay (connection wizard)
- `#error-container` - Fixed position container (error/toast messages)
- Both positioned above screens (`z-index: 9999`)

---

## File Locations

**HTML Elements:**
- All screen definitions: `index.html:1462-1719`
- View tab selector: `index.html:1443-1457`
- Connection modal: `index.html:1377-1417`
- CSS styles: `index.html:7-1373`

**JavaScript Logic:**
- Screen management: `js/ui/uiManager.js`
- Screen transitions: `js/app/app.js` (App methods)
- Mode selection: `js/app/sessionModeManager.js`
- Initialization: `js/app/initializationSteps.js`
- Settings: `js/ui/settings.js`

---

## Common Development Tasks

### Add a New Screen
1. Add element to `index.html` with `class="screen"` and unique id
2. Register in `UIManager.screens` mapping (js/ui/uiManager.js:18-28)
3. Add navigation trigger (App method or button onclick)
4. Call `UIManager.showScreen(screenName)` to display

### Check Current Screen
```javascript
document.querySelector('.screen.active')?.id
```

### Get Navigation History
```javascript
UIManager.previousScreen  // Most recent non-overlay screen
```

### Toggle Between Modes (Mid-Gameplay)
```javascript
Settings.mode = 'blackmarket';  // or 'detective'
UIManager.updateModeDisplay(Settings.mode);
UIManager.updateNavigationButtons();  // Show/hide scoreboard button
```

---

## Error & Notification Display (Not Screens)

```javascript
UIManager.showError(message, duration)    // 5s default, top-right
UIManager.showToast(message, type, duration)  // 3s default, color-coded
// Types: 'info', 'success', 'warning', 'error'
```

---

## Mode Selection Flow

```
SessionModeManager.setMode('networked' | 'standalone')
  ├─ Sets mode on SessionModeManager instance
  ├─ Sets localStorage.gameSessionMode
  ├─ Locks mode (cannot change during session)
  └─ Triggers initialization:
      ├─ networked: showConnectionWizard()
      └─ standalone: UIManager.showScreen('teamEntry')
```

---

## Connection Wizard Modal

**Triggered by:**
1. `App.selectGameMode('networked')`
2. Clicking connection status indicator (🔗)
3. Failed connection restoration

**Actions:**
- Scan for servers (UDP broadcast)
- Manual server entry
- Authenticate with password
- On success: Close modal, transition to `teamEntry`
- On cancel: Return to `gameModeScreen`

---

## Admin View Structure (Networked Mode Only)

```
#admin-view (view-content)
  ├─ Session Management Section
  │  ├─ Create/Pause/Resume/End session
  │  ├─ View session details
  │  └─ Connected devices list
  ├─ Video Controls Section
  │  ├─ Play/Pause/Stop/Skip
  │  ├─ Manual queue management
  │  └─ Video progress tracking
  └─ System Status Section
     ├─ Orchestrator health
     ├─ VLC connection status
     └─ Device monitoring
```

---

## Testing Without Backend

1. Select Standalone Mode (no connection needed)
2. Use Manual Entry instead of NFC scanning
3. View debug panel for logs
4. Test all screens locally

---

## Related Documentation

- **Backend API Contract:** `../backend/contracts/openapi.yaml`
- **WebSocket Events:** `../backend/contracts/asyncapi.yaml`
- **Token Data Schema:** `data/tokens.json`
- **Main CLAUDE.md:** Root project documentation

---

## Version Information

This documentation maps the UI structure for:
- ALNScanner Phase 5.3+ (class-based DataManager)
- Module architecture with extracted JS files
- Networked + Standalone mode support
- Admin panel with orchestrator integration

Last Updated: October 2024
