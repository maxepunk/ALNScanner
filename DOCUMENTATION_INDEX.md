# ALNScanner Documentation Index

This folder contains comprehensive UI/UX documentation for the ALNScanner GM Scanner application.

## Quick Navigation

### For Quick Reference
Start here: **[UI_MAP_SUMMARY.md](UI_MAP_SUMMARY.md)** - One-page quick reference of screens, navigation, and common tasks

### For Complete Details
Read: **[UI_STRUCTURE_MAP.md](UI_STRUCTURE_MAP.md)** - Comprehensive reference with line numbers, code snippets, and implementation details

### For Visual Understanding
Study: **[SCREEN_FLOW_DIAGRAMS.md](SCREEN_FLOW_DIAGRAMS.md)** - ASCII diagrams showing state flows, transitions, and architecture

---

## Document Contents Summary

### UI_MAP_SUMMARY.md (282 lines)
**Quick reference guide covering:**
- All 9 screens and 3 view tabs at a glance
- Initial screen determination logic
- Screen transition commands
- Navigation patterns and back button rules
- Mode-specific features (standalone vs networked)
- File locations for quick lookup
- Common development tasks
- Error/notification display
- Connection wizard modal flow
- Admin view structure

**Best for:** Finding specific information quickly, refreshing memory on a particular feature

---

### UI_STRUCTURE_MAP.md (526 lines)
**Comprehensive technical reference covering:**

**1. Complete Screen Inventory**
- All 9 screen elements with HTML IDs
- Screen purposes and container structure
- CSS-based visibility management

**2. Screen Visibility Management**
- UIManager.showScreen() implementation (lines 102-125 in uiManager.js)
- Back navigation logic with code snippets
- Screen exclusion rules

**3. Initial Screen Determination**
- Startup sequence (Phases 1A-1J)
- Decision tree with code logic
- Initial screen by scenario (7 different cases)

**4. Screen Transition Flow Diagram**
- Main gameplay loop with ASCII diagram
- Navigation from all screens table
- Modal dialog descriptions

**5. View Tabs (Networked Mode Only)**
- View container structure
- View switching logic with implementation
- Important distinction: screens vs views

**6. Screen Visibility Prerequisites**
- Settings screen availability
- Scoreboard mode restrictions
- Team details requirements
- Admin view networking requirement
- Debug view availability

**7. Screen IDs and CSS Reference**
- UIManager screen mapping
- CSS classes for styling

**8. Key Implementation Details**
- Screen transition trigger methods
- Error display system (Phase 4.3)
- ConnectionManager integration

**9. Summary Quick Reference Table**
- Complete action/destination mapping

**10. File Cross-References**
- Key implementation files
- CSS styling locations

**Best for:** Understanding how the UI works at implementation level, debugging issues, making changes

---

### SCREEN_FLOW_DIAGRAMS.md (800+ lines)
**Visual architecture documentation with 10 detailed diagrams:**

**1. Complete Screen Transition Graph**
- Startup sequence flow
- Main gameplay loop diagram
- Overlay screens and modals
- Back navigation rules
- View tabs structure

**2. Screen Dependency Tree**
- UIManager.screens mapping
- Display hierarchy
- Modal overlays

**3. SessionModeManager State Flow**
- FSM with state transitions
- Mode locking behavior
- clearMode() behavior

**4. UIManager.showScreen() Logic**
- Step-by-step implementation
- CSS classes applied
- Navigation stack behavior

**5. View Switching Architecture**
- App.switchView() flow
- View content structure
- Important distinction between screens and views

**6. Initialization Decision Tree**
- determineInitialScreen() logic
- isConnectionReady() implementation

**7. Connection Wizard Modal Flow**
- Trigger conditions
- Modal content layout
- User flow options (discovery, manual, cancel)
- handleConnectionSubmit() steps

**8. Screen Visibility Rules by Mode**
- Standalone mode visibility
- Networked mode visibility
- Mode-specific controls

**9. Error & Notification Display**
- Error container structure
- Toast notification types
- Auto-dismiss behavior
- Examples

**10. Complete Navigation Reference**
- Keyboard navigation (numpad)
- Button navigation (header + screen buttons)
- Context-sensitive navigation

**Best for:** Understanding the overall architecture, explaining to others, planning changes, visual learners

---

## Understanding the ALNScanner UI

### Core Concepts

**Screens** (`class="screen"`)
- 9 different UI screens that users see
- Hidden by default (`display: none`)
- One active at a time (`.active` class = `display: block`)
- Managed by `UIManager.showScreen(screenName)`
- All nested inside `#scanner-view` container

**Views** (`class="view-content"`)
- 3 parallel view containers: scanner, admin, debug
- Scanner view contains all 9 screens
- Admin view only in networked mode (orchestrator controls)
- Debug view available in both modes
- Managed by `App.switchView(viewName)`

**Modes**
- **Networked:** Connects to backend orchestrator, enables admin panel
- **Standalone:** Fully offline, no backend connection needed
- Selected once on startup, locked for session duration
- Controlled by `SessionModeManager`

**Navigation**
- Forward navigation: buttons/links call `UIManager.showScreen()`
- Back navigation: `UIManager.previousScreen` tracks last non-overlay screen
- Overlays (history, scoreboard, team details) don't update back stack

---

## Screen Roles Summary

| Screen | Role | Key Actions |
|--------|------|-------------|
| **loadingScreen** | Initial state while loading token database | Auto-transition to gameModeScreen |
| **gameModeScreen** | Mode selection | Choose networked or standalone |
| **teamEntryScreen** | Numpad input | Enter team ID (1-10 digits) |
| **scanScreen** | Main gameplay | NFC scan, manual entry, start/stop |
| **resultScreen** | Transaction confirmation | Show token details, continue or finish |
| **settingsScreen** | Configuration | Device ID, mode toggle, data management |
| **historyScreen** | Transaction log | View/filter all scanned tokens |
| **scoreboardScreen** | Rankings | View team scores (Black Market) |
| **teamDetailsScreen** | Breakdown | Detailed token analysis + admin controls |
| **admin-view** | Orchestrator control | Session, video, system management |
| **debug-view** | Logging | Real-time debug output |

---

## Implementation Architecture

### File Organization
```
ALNScanner/
├── index.html                  # All HTML + inline CSS
│   ├── Lines 7-1373:           CSS styles
│   ├── Lines 1377-1417:        Connection wizard modal
│   ├── Lines 1443-1457:        View tab selector
│   └── Lines 1462-1719:        Screen definitions
├── js/ui/
│   ├── uiManager.js            # Screen visibility management
│   └── settings.js             # Configuration persistence
├── js/app/
│   ├── app.js                  # Screen transition methods
│   ├── sessionModeManager.js   # Mode selection + locking
│   └── initializationSteps.js  # Startup sequence
└── [other modules...]
```

### Initialization Sequence (Phases 1A-1J)
1. **Phase 1A:** Load token database
2. **Phase 1B:** Apply URL mode override
3. **Phase 1C-1D:** UI and SessionModeManager init
4. **Phase 1E-1I:** Module initialization
5. **Phase 1J:** Service Worker registration
6. **Then:** determineInitialScreen() decides which screen to show

---

## How to Use These Documents

### Scenario 1: "I need to add a new screen"
1. Read: **UI_MAP_SUMMARY.md** - Understand the pattern
2. Read: **UI_STRUCTURE_MAP.md** Section 1 (screen inventory)
3. Read: **SCREEN_FLOW_DIAGRAMS.md** Section 4 (showScreen logic)
4. Check: `js/ui/uiManager.js` for mapping pattern

### Scenario 2: "A screen isn't showing up"
1. Read: **UI_MAP_SUMMARY.md** - Check initial screen logic
2. Read: **SCREEN_FLOW_DIAGRAMS.md** Section 6 (initialization tree)
3. Check: localStorage for mode selection
4. Check: connection status if networked mode

### Scenario 3: "I need to understand back navigation"
1. Read: **UI_STRUCTURE_MAP.md** Section 2 (visibility management)
2. Read: **SCREEN_FLOW_DIAGRAMS.md** Section 4 (showScreen logic)
3. Review: `UIManager.previousScreen` tracking rules

### Scenario 4: "User can't connect/no admin panel"
1. Read: **SCREEN_FLOW_DIAGRAMS.md** Section 7 (connection wizard)
2. Read: **SCREEN_FLOW_DIAGRAMS.md** Section 8 (visibility rules)
3. Check: `SessionModeManager` mode and lock status

### Scenario 5: "I need to explain the flow to someone"
1. Share: **UI_MAP_SUMMARY.md** for overview
2. Share: **SCREEN_FLOW_DIAGRAMS.md** Section 1 for visual
3. Reference: Specific sections for deep dives

---

## Key Files Referenced

**Implementation:**
- `/home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner/index.html` - All screens + HTML
- `/home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner/js/ui/uiManager.js` - Screen management
- `/home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner/js/app/app.js` - Navigation methods
- `/home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner/js/app/sessionModeManager.js` - Mode logic
- `/home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner/js/app/initializationSteps.js` - Startup

**Testing:**
- `/home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner/gm-scanner-test-plan.md` - Test coverage
- See also: `CLAUDE.md` in this folder for debugging tips

---

## Related Documentation

- **Backend Orchestrator:** `../backend/CLAUDE.md` - Server-side architecture
- **API Contract:** `../backend/contracts/openapi.yaml` - HTTP endpoints
- **WebSocket Contract:** `../backend/contracts/asyncapi.yaml` - Real-time events
- **Player Scanner:** `../aln-memory-scanner/` - Companion app documentation
- **Token Data:** `data/tokens.json` - Game token definitions

---

## Version & Scope

**Covers:**
- ALNScanner Phase 5.3+ (class-based DataManager)
- Module architecture with extracted JS files
- Networked + Standalone dual-mode support
- Admin panel with orchestrator integration
- Error notification system (Phase 4.3)

**Created:** October 2024
**Scope:** UI structure, screen flow, navigation logic only
**Not covered:** Game logic, scoring algorithms, WebSocket implementation details (see CLAUDE.md for those)

---

## Quick Links to Specific Topics

**Getting Started:**
- UIManager basics → [UI_STRUCTURE_MAP.md](UI_STRUCTURE_MAP.md#screen-visibility-management)
- Startup process → [UI_STRUCTURE_MAP.md](UI_STRUCTURE_MAP.md#initial-screen-determination)

**Screen-Specific:**
- All screens list → [UI_MAP_SUMMARY.md](UI_MAP_SUMMARY.md#all-screens-at-a-glance)
- Screen transitions → [SCREEN_FLOW_DIAGRAMS.md](SCREEN_FLOW_DIAGRAMS.md#1-complete-screen-transition-graph)

**Mode Selection:**
- Mode selection flow → [SCREEN_FLOW_DIAGRAMS.md](SCREEN_FLOW_DIAGRAMS.md#3-sessionmodemanager-state-flow)
- Networked mode → [SCREEN_FLOW_DIAGRAMS.md](SCREEN_FLOW_DIAGRAMS.md#7-connection-wizard-modal-flow)
- Standalone mode → [SCREEN_FLOW_DIAGRAMS.md](SCREEN_FLOW_DIAGRAMS.md#8-screen-visibility-rules-by-mode)

**Navigation:**
- Navigation patterns → [UI_MAP_SUMMARY.md](UI_MAP_SUMMARY.md#key-navigation-patterns)
- Back button logic → [UI_STRUCTURE_MAP.md](UI_STRUCTURE_MAP.md#back-navigation-logic)
- All button navigation → [SCREEN_FLOW_DIAGRAMS.md](SCREEN_FLOW_DIAGRAMS.md#10-complete-navigation-reference)

**View Tabs:**
- View switching → [UI_STRUCTURE_MAP.md](UI_STRUCTURE_MAP.md#view-tabs-networked-mode-only)
- View architecture → [SCREEN_FLOW_DIAGRAMS.md](SCREEN_FLOW_DIAGRAMS.md#5-view-switching-architecture)

---

## Notes for Developers

**Important Distinctions:**
1. **Screens** vs **Views** - Screens control UI within a view; views control which section you're in
2. **Networked** vs **Standalone** - Different connection requirements and available features
3. **Overlay** screens - Don't update back navigation (history, scoreboard, team details)
4. **Modal** overlays - Fixed position, don't interact with screen system (connection wizard)

**Common Mistakes:**
- Forgetting to register new screen in `UIManager.screens` mapping
- Assuming back button works like browser back (it's custom-tracked)
- Not checking mode before accessing admin features
- Assuming error messages are screens (they're separate overlays)

**Best Practices:**
- Always go through `UIManager.showScreen()` for screen changes
- Use `App` methods for navigation (they handle pre-conditions)
- Check `Settings.mode` before showing mode-specific features
- Use `UIManager.showError()` for errors, not alerts

