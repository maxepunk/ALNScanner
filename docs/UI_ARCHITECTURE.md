# UI Architecture

> **Purpose:** Conceptual understanding of the UI system for debugging and development. Created by tracing actual code flows in `src/`.
>
> **Related:** See `UI_TESTING_REFERENCE.md` for Playwright selectors.

## Screen System Overview

The scanner uses a single-page app with 9 screens, each a `<div class="screen">` element. Only one screen is visible at a time via the `.active` CSS class.

```
┌────────────────────────────────────────────────────────────────┐
│                        index.html                               │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ #scanner-view (default)                                   │  │
│  │  ├── #loadingScreen     - Initial app load               │  │
│  │  ├── #gameModeScreen    - Mode selection                 │  │
│  │  ├── #settingsScreen    - Device config                  │  │
│  │  ├── #teamEntryScreen   - Team selection                 │  │
│  │  ├── #scanScreen        - NFC scanning                   │  │
│  │  ├── #resultScreen      - Transaction result             │  │
│  │  ├── #historyScreen     - Transaction log                │  │
│  │  ├── #scoreboardScreen  - Rankings (overlay)             │  │
│  │  └── #teamDetailsScreen - Group breakdown (overlay)      │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ #admin-view (networked mode only)                        │  │
│  │  └── Admin panel with Session/Video/System controls      │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ #debug-view (networked mode only)                        │  │
│  │  └── Real-time debug console                             │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

**Key Files:**
- Screen rendering: `src/ui/uiManager.js`
- View switching: `src/app/app.js` → `viewController.switchView()`

## Navigation Flow

### Screen Transitions

```
                    ┌─────────────┐
                    │  Loading    │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
         ┌──────────│ Game Mode   │──────────┐
         │          │  Selection  │          │
         │          └─────────────┘          │
         ▼                                   ▼
  ┌────────────┐                      ┌────────────┐
  │ Standalone │                      │ Networked  │
  │   Mode     │                      │    Mode    │
  └──────┬─────┘                      └─────┬──────┘
         │                                   │
         │                     ┌─────────────┤
         │                     │ Connection  │
         │                     │   Wizard    │
         │                     └─────────────┘
         │                                   │
         ▼                                   ▼
    ┌──────────────────────────────────────────┐
    │              Team Entry                   │
    │  (Input field OR clickable team list)    │
    └──────────────────┬───────────────────────┘
                       │
                       ▼
    ┌──────────────────────────────────────────┐
    │              Scan Screen                  │
    │     NFC auto-starts on team confirm       │
    └──────────┬──────────────────┬────────────┘
               │                  │
               ▼                  ▼
    ┌──────────────┐      ┌──────────────┐
    │    Result    │      │   History    │
    │   (success)  │◄────►│   (overlay)  │
    └──────┬───────┘      └──────────────┘
           │
           ├──── Tap anywhere → Scan Screen (continue)
           │
           └──── Finish Team → Team Entry
```

### Back Navigation

`UIManager.showScreen()` tracks `previousScreen` for overlay screens:

| Current Screen | Back Action | Returns To |
|----------------|-------------|------------|
| historyScreen | closeHistory | scanScreen (or previous) |
| scoreboardScreen | closeScoreboard | scanScreen (or previous) |
| teamDetailsScreen | closeTeamDetails | scoreboardScreen |
| resultScreen | finishTeam | teamEntryScreen |

**Logic:** Overlay screens (history, scoreboard, teamDetails) don't update the back stack. Regular screens do.

## Mode Selection (SessionModeManager)

Mode selection is a one-way lock - once selected, cannot change until page reload.

```
┌─────────────────────────────────────────────────────────────┐
│                    Mode Selection Flow                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Page Load                                                  │
│      │                                                       │
│      ├─── Check localStorage for saved mode                  │
│      │         │                                             │
│      │         ├─── Found: Restore mode (not locked yet)    │
│      │         │         │                                   │
│      │         │         ├─── Auth token valid?              │
│      │         │         │         │                         │
│      │         │         │         ├── Yes: Proceed to team  │
│      │         │         │         │         entry, LOCK     │
│      │         │         │         │                         │
│      │         │         │         └── No: Clear mode, show  │
│      │         │         │               game mode screen    │
│      │         │         │                                   │
│      │         │         └─── Standalone: Proceed to team    │
│      │         │               entry, LOCK                   │
│      │         │                                             │
│      │         └─── Not found: Show game mode screen         │
│      │                                                       │
│      └─── User selects mode                                  │
│                │                                             │
│                ├─── Networked: Show connection wizard        │
│                │         │                                   │
│                │         └─── On success: LOCK, team entry   │
│                │                                             │
│                └─── Standalone: LOCK, team entry             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Principle:** Mode locking prevents inconsistent state during gameplay.

**Key File:** `src/app/sessionModeManager.js`

## View System (Networked Mode Only)

In networked mode, the app has 3 views accessible via tab buttons:

| View | Purpose | Contains |
|------|---------|----------|
| Scanner | Default gameplay | All 9 screens |
| Admin | Game control | Session, Video, System panels |
| Debug | Troubleshooting | Real-time debug log |

**View switching:** `App.switchView(viewName)` → `viewController.switchView(viewName)`

**Tab selector:** `button[data-view="scanner|admin|debug"]`

**Visibility:** View tabs hidden in standalone mode.

## Event Routing

Two independent event paths handle UI updates:

**1. Transaction/scoring events** — DataManager emits events (`transaction:added`, `team-score:updated`, etc.) handled by simple `addEventListener` calls in `main.js`. Handlers self-guard with null checks on DOM elements (no screen scoping needed).

**2. Service domain state** — `service:state` WebSocket events populate StateStore. MonitoringDisplay subscribes to store domains and delegates to specialized renderers (VideoRenderer, CueRenderer, HealthRenderer, etc.).

```
┌─────────────────────────────────────────────────────────────┐
│                    Event Flow                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Transaction path:                                          │
│   DataManager emits 'transaction:added'                      │
│     → main.js listeners:                                     │
│         • updateHistoryBadge() + updateSessionStats()        │
│         • refreshHistoryScreen() (null-guarded)              │
│         • refreshScoreboards() (null-guarded)                │
│         • refreshAdminGameActivity() (null-guarded)          │
│                                                              │
│   Service state path:                                        │
│   service:state WebSocket → StateStore.update(domain, state) │
│     → MonitoringDisplay store subscriptions                  │
│         • renderer.render(state, prev)                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Files:** `src/main.js` (transaction event wiring), `src/admin/MonitoringDisplay.js` (store subscriptions)

## Initialization Sequence

11-phase startup sequence with dependency ordering:

```
Phase 0:   Show loading screen
    │
Phase 1D:  Initialize UIManager (cache screen refs)
    │
Phase 1E:  Create SessionModeManager (BEFORE view controller)
    │
Phase 1F:  Initialize view controller
    │
Phase 1G:  Load settings from localStorage
    │
Phase 1H:  Initialize DataManager (empty state)
    │
Phase 1I:  Detect NFC support
    │
Phase 1A:  Load token database (CRITICAL: fails if missing)
    │
Phase 1B:  Apply URL mode override (?mode=blackmarket)
    │
Phase 1J:  Register service worker
    │
Phase 1C:  Determine initial screen (restoration logic)
             │
             ├─── No saved mode → gameModeScreen
             │
             ├─── Saved + connection lost → clear mode, gameModeScreen
             │
             └─── Saved + connection valid → teamEntryScreen
```

**Key File:** `src/app/initializationSteps.js`

## Data-Action Event Delegation

All button clicks use `data-action` attributes routed through event delegation:

```
Click on button[data-action="app.confirmTeamId"]
    │
    ▼
domEventBindings.js catches click
    │
    ▼
Parses action: target="app", method="confirmTeamId"
    │
    ▼
Calls app.confirmTeamId(arg)
    │
    ▼
Method shows scanScreen, starts NFC
```

**Supported targets:** app, dataManager, settings, debug, uiManager, connectionWizard, queueStatusManager

**Key File:** `src/utils/domEventBindings.js`

## Mode Differences

| Feature | Standalone | Networked |
|---------|------------|-----------|
| View tabs | Hidden | Visible (Scanner/Admin/Debug) |
| Team entry | Text input only | Dropdown + Add Team |
| Scoreboard button | Hidden | Visible |
| Admin panel | Not available | Full session/video control |
| Data source | localStorage | Backend WebSocket |
| Connection status | Hidden | Visible (link to wizard) |

## Quick-Dismiss Pattern

Result screen uses "tap anywhere" instead of Continue button:

1. Transaction completes → resultScreen shown
2. `_enableResultScreenQuickDismiss()` adds click listener
3. User taps anywhere (not on buttons) → returns to scanScreen
4. "Finish Team" button still navigates to teamEntryScreen

**Implementation:** `src/ui/uiManager.js` (`_enableResultScreenQuickDismiss` method)

## File Locations

### Core Navigation

| Concept | Implementation File |
|---------|-------------------|
| Screen transitions | `src/ui/uiManager.js` |
| View switching | `src/app/app.js` (viewController) |
| Back navigation | `src/ui/uiManager.js` (previousScreen) |
| Mode locking | `src/app/sessionModeManager.js` |

### Event Architecture

| Concept | Implementation File |
|---------|-------------------|
| Transaction event wiring | `src/main.js` |
| Service state subscriptions | `src/admin/MonitoringDisplay.js` |
| State container | `src/core/stateStore.js` |
| Data-action delegation | `src/utils/domEventBindings.js` |

### Initialization

| Concept | Implementation File |
|---------|-------------------|
| Startup sequence | `src/app/initializationSteps.js` |
| App orchestration | `src/app/app.js` |
| Entry point | `src/main.js` |

### Admin Panel (Networked Only)

| Module | Implementation File |
|--------|-------------------|
| Session controls | `src/admin/SessionManager.js` |
| Video controls | `src/admin/VideoController.js` |
| System monitor | `src/admin/SystemMonitor.js` |
| Game activity | `src/admin/MonitoringDisplay.js` |

### Network Layer

| Concept | Implementation File |
|---------|-------------------|
| Connection state | `src/network/connectionManager.js` |
| WebSocket client | `src/network/OrchestratorClient.js` |
| Connection wizard | `src/ui/connectionWizard.js` |
