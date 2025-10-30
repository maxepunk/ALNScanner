# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ALNScanner is the **Game Master (GM) Scanner** for the "About Last Night" immersive crime thriller game. It's a Progressive Web App that GMs use to track team transactions via NFC token scanning during live gameplay. This is NOT the player-facing app.

## Recent Changes

### October 2025: Field Standardization
- Removed `ConnectionManager.stationMode` alias property
- Use `ConnectionManager.mode` exclusively

## Key Differences from Player Scanner

- **This app (ALNScanner)**: GM tool with NFC scanning, team management, leaderboards, admin controls
- **Player app (aln-memory-scanner)**: Player tool with QR scanning, memory display, audio/images

## Core Functionality

### Dual Operation Modes
The scanner operates in two distinct modes, chosen at startup:

1. **Networked Mode**: Connects to backend orchestrator via WebSocket
   - Real-time session management and video control
   - Admin panel for orchestrator control (session, video, monitoring)
   - Transaction queue with offline fallback
   - Team scores synced across all connected scanners

2. **Standalone Mode**: Fully offline operation
   - Local-only transaction storage
   - No orchestrator connection required
   - Simplified scoring and team tracking
   - Ideal for GitHub Pages deployment

**CRITICAL**: Mode is locked once selected - cannot switch during active gameplay.

### NFC-Based Team Gameplay
- Teams tap physical NFC/RFID tokens at GM stations
- Tracks transactions, scores, and group completions
- Two game modes: Detective (star ratings) and Black Market (currency)
- Real-time leaderboard and analytics

### Token Management
- Reads tokens via Web NFC API (Android Chrome/Edge only)
- Uses shared token database via git submodule at `data/`
- Does NOT generate QR codes (that's the Player Scanner's job)

## Development Commands

### Token Synchronization
```bash
# Get latest tokens from shared repository
python3 sync.py

# Sync and deploy to GitHub Pages
python3 sync.py --deploy

# Local sync only (no GitHub push)
python3 sync.py --local
```

### Testing and Development
```bash
# Local development (any HTTP server works)
python3 -m http.server 8000

# For HTTPS (required for NFC testing)
# Generate self-signed cert first:
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Serve with HTTPS
npx http-server -S -C cert.pem -K key.pem
```

**Testing without NFC:**
- Open `index.html` in any browser
- Use "Manual Entry" button to simulate NFC scans
- Debug panel available via Debug tab (networked mode) or 🐛 button

**Testing with NFC:**
- Requires Android device with Chrome 89+ or Edge 89+
- Must be served over HTTPS (Web NFC API requirement)
- Connect device to same network as development server

## Architecture

### Frontend Overview
The application is a **monolithic single-file PWA** (`index.html`) with modular JavaScript extracted into separate files:
- **No Build Process**: Pure HTML/JS/CSS without transpilation or bundling
- **Inline CSS**: All styles embedded in `<style>` tags (lines 7-1373 in index.html)
- **Module Loading**: Sequential `<script>` tags load modules in dependency order (lines 1817-1839)
- **Global Scope**: Modules expose objects to `window` for cross-module communication
- **Event-Driven**: Uses EventEmitter pattern and WebSocket events for state updates

### File Structure
```
ALNScanner/
├── index.html                           # Main PWA entry point
├── sw.js                                # Service worker for offline support
├── sync.py                              # Token sync tool
├── data/                                # Git submodule → ALN-TokenData
│   └── tokens.json                      # Shared token database
├── js/
│   ├── app/
│   │   ├── app.js                       # Main application coordinator
│   │   ├── sessionModeManager.js        # Networked vs Standalone mode logic
│   │   └── initializationSteps.js       # Phased startup sequence
│   ├── core/
│   │   ├── dataManager.js               # Scoring, groups, transactions (both modes)
│   │   ├── standaloneDataManager.js     # Standalone-only local storage
│   │   └── tokenManager.js              # Token database and fuzzy matching
│   ├── network/
│   │   ├── orchestratorClient.js        # WebSocket client for backend
│   │   ├── connectionManager.js         # Connection state and auth
│   │   └── networkedQueueManager.js     # Offline queue for failed sends
│   ├── ui/
│   │   ├── uiManager.js                 # Screen navigation and rendering
│   │   └── settings.js                  # Persistent configuration
│   └── utils/
│       ├── adminModule.js               # Admin panel (Session/Video/System control)
│       ├── config.js                    # Configuration constants
│       ├── debug.js                     # Debug logging utilities
│       └── nfcHandler.js                # Web NFC API wrapper
├── gm-scanner-test-plan.md              # Test coverage gap analysis
├── MAINTENANCE.md                       # Token sync instructions
└── README.md                            # User-facing documentation
```

### Module Responsibilities

#### App Layer (`js/app/`)
- **app.js**: Main coordinator, handles UI events, NFC processing, admin actions
  - Uses dependency injection pattern for testability
  - Delegates initialization logic to initializationSteps.js
- **sessionModeManager.js**: Enforces networked vs standalone mode separation
  - Locks mode selection after initial choice
  - Prevents mode switching during active gameplay
- **initializationSteps.js**: Phased startup sequence (11 phases: 1A-1J)
  - Phase 1A: Load token database
  - Phase 1B: Apply URL mode override
  - Phase 1C: Connection restoration logic
  - Phase 1D: Initialize UI Manager
  - Phase 1E: Create SessionModeManager (CRITICAL: before viewController)
  - Phase 1F: Initialize view controller
  - Phase 1G: Load settings
  - Phase 1H: Load DataManager
  - Phase 1I: Detect NFC support
  - Phase 1J: Register service worker

#### Core Layer (`js/core/`)
- **dataManager.js**: Transaction storage, scoring calculations, group completions (used by both modes)
  - Class-based architecture with EventTarget for pub/sub
  - Dependency injection for tokenManager, settings, debug, uiManager, app
  - Manages backendScores Map for orchestrator-sourced scores
  - localStorage persistence for transactions and scannedTokens Set
  - SCORING_CONFIG with BASE_VALUES (1-5 star ratings) and TYPE_MULTIPLIERS
- **standaloneDataManager.js**: Local-only persistence for standalone mode
  - Simplified scoring without orchestrator
  - Team management and local transaction storage
- **tokenManager.js**: Token database loading, fuzzy ID matching, group inventory
  - Fuzzy matching supports various RFID formats (with/without colons)
  - Builds group inventory for completion bonus tracking

#### Network Layer (`js/network/`)
- **orchestratorClient.js**: WebSocket connection to backend, event-driven architecture
- **connectionManager.js**: Authentication, connection state, retry logic
- **networkedQueueManager.js**: Queue transactions when offline, retry when reconnected

#### UI Layer (`js/ui/`)
- **uiManager.js**: Screen transitions, stats rendering, team details, scoreboard
- **settings.js**: localStorage persistence for station config

#### Utils Layer (`js/utils/`)
- **adminModule.js**: Admin panel functionality (SessionManager, VideoController, SystemMonitor, MonitoringDisplay)
- **nfcHandler.js**: Web NFC API with simulation fallback
- **debug.js**: Debug panel and logging
- **config.js**: App-wide constants

### Initialization Flow
```
1. Load token database (tokenManager.js)
2. Apply URL mode override if present (?mode=blackmarket)
3. Create SessionModeManager (locked mode selection)
4. Determine initial screen:
   - If networked: Show connection wizard
   - If standalone: Show team entry
5. Register service worker
6. Initialize view controller and UI
```

### Networked Mode Architecture
When operating with orchestrator backend:

1. **Authentication**: HTTP POST to `/api/admin/auth` with password
2. **WebSocket Connection**: Connect with JWT token in handshake.auth
3. **Admin Panel**: Three-tab interface (Scanner / Admin / Debug)
   - Scanner view: Standard NFC scanning
   - Admin view: Session management, video controls, system monitoring
   - Debug view: Real-time logs
4. **Transaction Flow**:
   - Scan token → Queue transaction
   - NetworkedQueueManager sends via WebSocket
   - Backend confirms → Update local state
   - If offline: Queue locally, retry on reconnect

### WebSocket Communication Patterns

**Authentication Flow:**
```javascript
// 1. HTTP Authentication (initial)
POST /api/admin/auth { password }
→ { token: "JWT...", expiresIn: 86400 }

// 2. WebSocket Handshake (with token)
io.connect(url, {
  auth: {
    token: "JWT...",
    deviceId: "GM_Station_1",
    deviceType: "gm",
    version: "1.0.0"
  }
})

// 3. Auto-Sync on Connect
← sync:full { session, scores, recentTransactions, videoStatus, devices }
```

**Client-to-Server Events:**
- `gm:scan`: Submit token scan transaction
  ```javascript
  emit('gm:scan', { tokenId, teamId, deviceId, timestamp })
  ← wait for gm:scan:ack { success, transaction }
  ```
- `gm:command`: Admin control actions (session, video, system)
  ```javascript
  emit('gm:command', { action: 'session:create', payload: { name, teams } })
  ← wait for gm:command:ack { success, data }
  ```
- `request:state`: Request full state snapshot (rate-limited)

**Server-to-Client Events (Broadcasts):**
- `sync:full`: Complete state snapshot (on connect/reconnect)
- `session:update`: Session lifecycle changes (create/pause/resume/end)
- `transaction:new`: New transaction processed (all stations notified)
- `video:status`: Video playback state changes (current, queue, progress)
- `device:connected` / `device:disconnected`: Device tracking
- `game:state`: Full game state broadcast (session + scores + transactions)

**OrchestratorClient Event Handling** (`js/network/orchestratorClient.js`):
- Line 131-146: Connection lifecycle (connect/disconnect/reconnect)
- Line 206-219: Auto-sync on reconnect (NetworkedQueueManager.syncQueue())
- Line 254-418: Event handler registration and routing
- Custom event emitter pattern: `on(event, handler)`, `emit(event, data)`

**NetworkedQueueManager** (`js/network/networkedQueueManager.js`):
- Queues transactions when offline (localStorage persistence)
- Automatic retry on reconnect with exponential backoff
- Deduplication to prevent double-submission
- Rate limiting to prevent server overload

### Admin Module Components
**Only available in networked mode** (`js/utils/adminModule.js`):

- **SessionManager**: Create/pause/resume/end sessions, view details
  - Event-driven updates via `session:update` broadcasts
  - Rich session status display with team counts and transaction stats
  - Uses WebSocket `gm:command` events (NOT HTTP) per AsyncAPI contract
  - Promise-based API with timeout handling (5s default)
  - Maintains `currentSession` state from broadcasts (single source of truth)
- **VideoController**: Play/pause/stop/skip videos, manage queue
  - Auto-populated video dropdown from server's video directory (via `/api/videos`)
  - Queue visibility with progress tracking
  - Manual video control (play/pause/stop/skip)
  - Video:progress event handling for real-time updates
  - Supports queue reordering and manual file addition
- **SystemMonitor**: Health checks, system status
  - Backend health monitoring
  - VLC connection status
  - System resource checks
- **AdminOperations**: Reset scores, clear transactions, system reset
  - Dangerous operations with confirmation dialogs
- **MonitoringDisplay**: Event-driven UI updates (listens to WebSocket broadcasts)
  - Receives `game:state`, `session:update`, `transaction:new` events
  - Null-safe event handling for malformed broadcasts (Phase 5 Bug #1 fix)
  - Updates DOM elements based on state changes without triggering commands

### Token Database Schema
```json
{
  "token_id": {
    "SF_RFID": "token_id",        // Required: Token identifier
    "SF_ValueRating": 1-5,         // Required: Star rating (1-5)
    "SF_MemoryType": "Technical",  // Required: Must be Personal, Business, or Technical
    "SF_Group": "Group (xN)"       // Required: Group with bonus multiplier
  }
}
```

**Valid Memory Types:**
- `Personal` - 1x multiplier
- `Business` - 3x multiplier
- `Technical` - 5x multiplier
- `UNKNOWN` - 0x multiplier (fallback for invalid types)

## Frontend Component Architecture

### UI Screens and Navigation
The app uses a **single-page navigation system** with screen visibility toggling (`js/ui/uiManager.js`):

**Screen Flow:**
```
Loading → Game Mode Selection → [Networked: Connection Wizard] → Team Entry → Scan → Result
                               ↘ [Standalone: Team Entry] ↗
```

**Available Screens:**
- **loadingScreen**: Initial app load, token database loading
- **gameModeScreen**: Choose networked vs standalone mode (lines 1508-1551 in index.html)
- **settingsScreen**: Device ID, mode toggle, data management (lines 1471-1505)
- **teamEntryScreen**: Numeric keypad for team ID input (lines 1553-1570)
- **scanScreen**: NFC scanning interface with stats (lines 1572-1595)
- **resultScreen**: Transaction result display (lines 1597-1623)
- **historyScreen**: Transaction log with filters (lines 1625-1662)
- **scoreboardScreen**: Black Market rankings (lines 1664-1676, networked only)
- **teamDetailsScreen**: Detailed team token breakdown (lines 1678-1706)

**View Tabs (Networked Mode Only):**
- **scanner-view**: Default scanning interface (lines 1459-1708)
- **admin-view**: Admin panel for orchestrator control (lines 1711-1804)
- **debug-view**: Real-time debug console (lines 1806-1809)

### UI Manager API (`js/ui/uiManager.js`)
**Core Methods:**
- `init()`: Initialize screen elements and error display container
- `showScreen(screenName)`: Toggle screen visibility with back navigation tracking
- `updateModeDisplay(mode)`: Update detective/blackmarket visual indicators
- `updateTeamDisplay(teamId)`: Update numeric team ID display
- `updateSessionStats()`: Refresh token count and score displays
- `updateHistoryBadge()`: Update transaction count badge in navigation
- `showError(message, duration)`: Display user-facing error notification (Phase 4.3)
- `showToast(message, type, duration)`: Display toast notifications (info/success/warning/error)

**Screen Management:**
- Tracks `previousScreen` for back button navigation
- Excludes overlay screens (history, scoreboard, teamDetails) from back stack
- Uses CSS class `.active` to show/hide screens

**Error Display System (Phase 4.3):**
- Fixed position error container (top-right corner)
- Auto-dismissing messages with slide-in/out animations
- Toast types: `info` (blue), `success` (green), `warning` (orange), `error` (red)
- Default durations: 5s for errors, 3s for toasts

### Connection Wizard Modal
**Modal UI Flow** (lines 1377-1417 in index.html):
1. **Discovery Section**: UDP broadcast scan for orchestrators
   - `scanForServers()`: Initiates discovery via ConnectionManager
   - `displayDiscoveredServers(servers)`: Renders found servers
   - `selectServer(url)`: Auto-fills form with discovered URL
2. **Manual Configuration**: Fallback form entry
   - Server Address: HTTP/HTTPS URL with auto-normalization
   - Station Name: Auto-increments (GM Station 1, 2, 3...)
   - GM Password: Admin authentication credential
3. **Connection Process**:
   - Health check: `GET /health` (3s timeout)
   - Authentication: `POST /api/admin/auth`
   - ConnectionManager stores JWT token
   - WebSocket connection established
   - Modal dismissed, transition to team entry

**Functions:**
- `showConnectionWizard()`: Display modal, auto-trigger scan
- `handleConnectionSubmit(event)`: Validate and establish connection
- `cancelNetworkedMode()`: Return to game mode selection

### CSS Architecture
**Design System** (lines 7-1373 in index.html):
- **Base Styles** (11-41): Reset, gradient background, container layout
- **Header** (46-151): Navigation buttons, connection status indicator, mode badge
- **Connection Status** (122-200): Colored dots (connected/connecting/disconnected)
- **Mode Indicator** (205-235): Detective (green) vs Black Market (orange) pills
- **Screen Management** (239-246): `.screen` visibility toggle via `.active` class
- **Status Messages** (251-273): Error/success/warning colored alerts
- **View Tabs** (278-312): Three-tab navigation for networked mode
- **Admin Sections** (317-424): Session/video/system control panels
- **Numpad** (429-460): 3x3 grid for team ID entry
- **Transaction Cards** (667-728): History list items with hover effects
- **Scoreboard** (803-875): Ranked entries with medal gradients (gold/silver/bronze)
- **Group Sections** (963-1037): Completion badges and progress bars
- **Debug Panel** (1102-1143): Fixed-position terminal-style console
- **Error Display** (1168-1216): Toast notification system (Phase 4.3)
- **Modal Styles** (1221-1373): Connection wizard overlay

### Event Flow and State Management

**Data Flow Pattern:**
```
User Action → App.js → DataManager → UIManager → DOM Update
           ↘ NetworkedQueueManager → WebSocket → Backend
```

**WebSocket Event Flow (Networked Mode):**
```
Backend Broadcast → OrchestratorClient.eventHandlers → AdminModule listeners → MonitoringDisplay → DOM
```

**Key Event Listeners:**
- `DOMContentLoaded`: App initialization (line 1849)
- NFC `reading` event: Token scan processing (nfcHandler.js)
- WebSocket events: `sync:full`, `session:update`, `transaction:new`, `video:status`
- Connection events: `status:changed`, `connection:error`, `reconnected`

**State Synchronization:**
1. **Local State** (DataManager):
   - transactions array (localStorage)
   - scannedTokens Set (deduplication)
   - teamScores Map (computed)
   - groupCompletions Map (bonus tracking)
2. **Backend State** (Networked):
   - backendScores Map (authoritative from sync:full)
   - currentSession (from SessionManager broadcasts)
   - videoQueue (from video:status events)
   - connectedDevices (from device:connected/disconnected)

**State Reconciliation:**
- On reconnect: `sync:full` event overwrites local state
- Transaction conflicts: Backend timestamp wins
- Score conflicts: Backend score takes precedence (stored in backendScores Map)
- Offline transactions: Queued in NetworkedQueueManager, submitted on reconnect

### NFC Integration (`js/utils/nfcHandler.js`)
**Web NFC API Wrapper:**
- `init()`: Feature detection (Chrome 89+, HTTPS required)
- `startScan()`: Begin NFC reader session
- `stopScan()`: Abort reader session
- `handleScan(ndef)`: Parse NDEF records, extract RFID
- Fallback: Manual entry dialog if NFC unavailable

**NFC Data Flow:**
1. User taps "Start Scanning" button
2. `navigator.nfc.scan()` initiates reader
3. `reading` event fires with NDEF data
4. RFID extracted from NDEF record
5. TokenManager.findToken() fuzzy matches ID
6. DataManager.processTransaction() scores token
7. UIManager.showScreen('result') displays outcome

### Service Worker (`sw.js`)
**PWA Offline Support:**
- Cache-first strategy for static assets
- Network-first for API calls
- Fallback to cached token database
- Enables install-to-home-screen prompt

## UI/UX Documentation

**Comprehensive UI documentation is available in the `/docs` folder and root-level markdown files:**

### Quick Reference
- **DOCUMENTATION_INDEX.md**: Master index of all UI documentation with quick navigation
- **UI_MAP_SUMMARY.md**: One-page quick reference of screens, navigation, and common tasks (282 lines)
  - Use this for: Finding specific information quickly, refreshing memory on features
  - Contains: Screen inventory, navigation patterns, mode-specific features, file locations

### Detailed Technical Reference
- **UI_STRUCTURE_MAP.md**: Comprehensive technical reference with line numbers and code snippets (526 lines)
  - Use this for: Understanding implementation details, debugging issues, making changes
  - Contains: Complete screen inventory, visibility management, startup sequence, transitions, CSS reference
  - Includes: UIManager.showScreen() implementation, back navigation logic, screen prerequisites

### Visual Architecture
- **SCREEN_FLOW_DIAGRAMS.md**: 10 detailed ASCII diagrams showing state flows and architecture (800+ lines)
  - Use this for: Understanding overall architecture, explaining to others, planning changes
  - Contains: Complete transition graph, dependency tree, SessionModeManager FSM, initialization tree
  - Includes: Connection wizard flow, view switching architecture, error display system

### Networked Mode Guide
- **docs/NETWORKED_MODE_QUICK_REFERENCE.md**: Step-by-step user flow for networked mode (238 lines)
  - Use this for: Understanding user experience, testing workflows, troubleshooting connection issues
  - Contains: Mode selection, connection wizard, admin panel usage, real-time sync behavior

### When to Use UI Documentation
**For Frontend Changes:**
1. Adding a new screen? → Read UI_STRUCTURE_MAP.md Section 1 + SCREEN_FLOW_DIAGRAMS.md Section 4
2. Changing navigation? → Read UI_MAP_SUMMARY.md navigation patterns + SCREEN_FLOW_DIAGRAMS.md Section 1
3. Debugging screen visibility? → Read UI_STRUCTURE_MAP.md Section 2 + check initialization logic
4. Understanding mode selection? → Read SCREEN_FLOW_DIAGRAMS.md Section 3 (SessionModeManager FSM)
5. Modifying connection flow? → Read SCREEN_FLOW_DIAGRAMS.md Section 7 + NETWORKED_MODE_QUICK_REFERENCE.md

**For UX Improvements:**
- Start with SCREEN_FLOW_DIAGRAMS.md Section 1 (complete transition graph) to understand current flow
- Reference UI_MAP_SUMMARY.md for navigation patterns and user journey
- Check NETWORKED_MODE_QUICK_REFERENCE.md for user-facing workflows
- Review error display system in SCREEN_FLOW_DIAGRAMS.md Section 9

**Key Architectural Concepts:**
- **Screens vs Views**: Screens are UI elements within a view; views are top-level sections (Scanner/Admin/Debug)
- **Modal Overlays**: Connection wizard is a modal, not a screen (fixed position, separate from screen system)
- **Overlay Screens**: History, scoreboard, and team details are overlays (don't update back stack)
- **Mode Locking**: Once networked/standalone selected, mode cannot change until page reload

## Important Notes

- **NO BUILD PROCESS**: Pure HTML/JS/CSS in single file (`index.html` contains all inline code)
  - All JavaScript modules defined in `<script>` tags
  - Inline CSS for styling
  - Self-contained for easy deployment
- **NFC ONLY**: Requires Android device with Chrome 89+ for NFC scanning
  - Web NFC API requires HTTPS (except localhost)
  - Manual entry fallback available for testing
- **NO QR CODES**: This app doesn't generate or use QR codes (that's Player Scanner's job)
- **SHARED TOKENS**: Both GM and Player apps use same token database via git submodule
- **GM FOCUSED**: All features designed for game master operations
- **MODE LOCKING**: Once networked/standalone selected, mode cannot change until reload
- **CLASS-BASED ARCHITECTURE**: Recent refactor (Phase 5.3.1) moved to class-based DataManager
  - Dependency injection for testability
  - EventTarget pattern for pub/sub
  - Defensive null-safe property access throughout

## Common Tasks

### Update tokens after changes
```bash
python3 sync.py --deploy
```

### Test networked mode locally
1. Start backend orchestrator: `cd ../backend && npm run dev`
2. Open scanner in Chrome on Android device
3. Select "Networked Mode"
4. Enter orchestrator URL (e.g., `http://192.168.1.100:3000`)
5. Authenticate with admin password

### Test standalone mode
1. Deploy to GitHub Pages: `python3 sync.py --deploy`
2. Visit `https://[username].github.io/ALNScanner/`
3. Select "Standalone Mode"
4. Use "Manual Entry" for testing without NFC

### Deploy to GitHub Pages
The app is served directly from the main branch:
```
https://[username].github.io/ALNScanner/
```

### GitHub Actions Workflow
**Automated Deployment via GitHub Actions:**

The repository includes a GitHub Actions workflow (`.github/workflows/sync.yml`) for automated token synchronization and deployment.

**Workflow: "Sync & Deploy GM Scanner"**
- **Trigger**: Manual dispatch via GitHub UI (Actions tab → "Run workflow" button)
- **Purpose**: Sync token submodule and deploy to GitHub Pages from GitHub's servers
- **Use case**: Update production site without local development environment

**Workflow Steps:**
1. Checkout repository with submodules (`actions/checkout@v4`)
2. Setup Python 3.x environment
3. Run `python3 sync.py --deploy`
4. Push changes (handled by sync.py script)

**How to Use:**
```
1. Navigate to repository on GitHub.com
2. Click "Actions" tab in top navigation
3. Select "Sync & Deploy GM Scanner" workflow
4. Click "Run workflow" button (green button on right)
5. Confirm by clicking "Run workflow" in dropdown
6. Wait 1-2 minutes for workflow to complete
7. Check GitHub Pages URL for updated deployment
```

**When to Use GitHub Actions:**
- Deploying from a machine without Python/git configured
- Quick emergency updates from any device with web access
- Automated deployment as part of CI/CD pipeline
- Token updates when local sync.py can't run

**Differences from Local Deployment:**
- **Local**: `python3 sync.py --deploy` runs on your machine
- **GitHub Actions**: Runs on GitHub's Ubuntu servers
- **Both**: Produce identical results (sync tokens → push → deploy)
- **Benefit**: No need for local development environment

**Note**: The GM Scanner workflow does NOT require QR code generation (unlike Player Scanner), making it lightweight and dependency-free.

## Relationship to Backend Orchestrator

The scanner can optionally connect to `../backend/` orchestrator for:
- **Session Management**: Coordinated gameplay sessions across devices
- **Video Playback**: Trigger videos on display screen via VLC
- **Real-time Sync**: Team scores synchronized across all connected scanners
- **Admin Controls**: Full orchestrator control from scanner admin panel

See `../backend/CLAUDE.md` for orchestrator architecture details.

## Relationship to Player Scanner

1. **Shared**: Both apps use `data/tokens.json` submodule
2. **Different**: GM app uses NFC, Player app uses QR codes OR NFC.
3. **Complementary**: GM tracks gameplay, Player displays memories

When making changes, remember this is the GM tool for managing live gameplay, not the player-facing memory collection app.

## Debugging and Development

### Console Access to Modules
All major modules are exposed on the window object for debugging:
```javascript
// Access core modules
window.App              // Main application
window.DataManager      // Transaction and scoring
window.TokenManager     // Token database
window.UIManager        // UI rendering
window.Settings         // Configuration
window.Debug            // Debug logging

// Networked mode only
window.sessionModeManager  // Mode management
window.connectionManager   // Backend connection
window.orchestratorClient  // WebSocket client
```

### Common Debug Tasks
```javascript
// Check current mode
console.log(Settings.mode);  // 'detective' or 'blackmarket'

// View all transactions
console.table(DataManager.transactions);

// Check token database
console.log(TokenManager.database);

// Test token lookup
TokenManager.findToken('a1b2c3d4');

// View scanned tokens registry
console.log([...DataManager.scannedTokens]);

// Force UI update
UIManager.updateSessionStats();

// Check connection status (networked mode)
console.log(window.connectionManager?.isConnected);
```

### Recent Bug Fixes (Phase 5)
- **Phase 5 Bug #1**: Added null safety for malformed `transaction:new` events in adminModule.js
- **Defensive Token Access**: All token property access uses optional chaining (`token?.SF_ValueRating`)
- **Event Handling**: Null checks before accessing WebSocket event payloads

### Frontend-Specific Debugging

**UI Not Updating:**
```javascript
// Check if screen is active
document.querySelector('.screen.active')?.id

// Force screen transition
UIManager.showScreen('teamEntry')

// Verify data manager initialized
console.log(DataManager?.transactions?.length)

// Check mode lock
window.sessionModeManager?.locked
window.sessionModeManager?.mode
```

**WebSocket Issues:**
```javascript
// Check connection status
window.connectionManager?.isConnected
window.connectionManager?.client?.socket?.connected

// View pending queue
window.queueManager?.queue

// Check event handlers
window.connectionManager?.client?.eventHandlers

// Monitor raw events
window.connectionManager?.client?.socket.onAny((event, data) => {
  console.log('WS Event:', event, data);
});
```

**Admin Panel Not Loading:**
```javascript
// Verify networked mode
window.sessionModeManager?.isNetworked()

// Check admin modules initialized
App.viewController?.sessionManager
App.viewController?.videoController

// View current session
App.viewController?.sessionManager?.currentSession
```

**NFC Scanning Issues:**
```javascript
// Check NFC support
'NDEFReader' in window

// Verify HTTPS (required for NFC)
window.location.protocol === 'https:'

// Test manual entry fallback
App.manualEntry()
```

**LocalStorage Debugging:**
```javascript
// View stored transactions
JSON.parse(localStorage.getItem('transactions') || '[]')

// Check game mode
localStorage.getItem('gameSessionMode')

// View all settings
Object.keys(localStorage).filter(k => k.startsWith('aln_'))
```

**CSS/Layout Issues:**
- View selector tabs only show in networked mode (check `#viewSelector` display)
- Connection status dot color indicates state (green=connected, orange=connecting, red=disconnected)
- Screen overlays (history, scoreboard) don't update `previousScreen` for back navigation
- Modal backdrop (`#connectionModal`) uses flexbox centering (check `.modal` display property)

### Testing Without Backend
1. Open `index.html` in browser
2. Select "Standalone Mode"
3. Use "Manual Entry" button to simulate scans
4. Open Debug panel (🐛 button) for logs

### Testing Networked Mode Without Orchestrator
```javascript
// Simulate connection failure gracefully
window.sessionModeManager = new SessionModeManager();
window.sessionModeManager.setMode('standalone');
UIManager.showScreen('teamEntry');
```