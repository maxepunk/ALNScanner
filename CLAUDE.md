# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ALNScanner is the **Game Master (GM) Scanner** for the "About Last Night" immersive crime thriller game. It's a Progressive Web App that GMs use to track team transactions via NFC token scanning during live gameplay. This is NOT the player-facing app.

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
2. **WebSocket Connection**: Connect with JWT token
3. **Admin Panel**: Three-tab interface (Scanner / Admin / Debug)
   - Scanner view: Standard NFC scanning
   - Admin view: Session management, video controls, system monitoring
   - Debug view: Real-time logs
4. **Transaction Flow**:
   - Scan token → Queue transaction
   - NetworkedQueueManager sends via WebSocket
   - Backend confirms → Update local state
   - If offline: Queue locally, retry on reconnect

### Admin Module Components
**Only available in networked mode** (`js/utils/adminModule.js`):

- **SessionManager**: Create/pause/resume/end sessions, view details
  - Event-driven updates via `session:update` broadcasts
  - Rich session status display with team counts and transaction stats
- **VideoController**: Play/pause/stop/skip videos, manage queue
  - Auto-populated video dropdown from server's video directory
  - Queue visibility with progress tracking
  - Manual video control (play/pause/stop/skip)
  - Video:progress event handling for real-time updates
- **SystemMonitor**: Health checks, system status
  - Backend health monitoring
  - VLC connection status
  - System resource checks
- **AdminOperations**: Reset scores, clear transactions, system reset
  - Dangerous operations with confirmation dialogs
- **MonitoringDisplay**: Event-driven UI updates (listens to WebSocket broadcasts)
  - Receives `game:state`, `session:update`, `transaction:new` events
  - Null-safe event handling for malformed broadcasts

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
console.log(Settings.stationMode);  // 'detective' or 'blackmarket'

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

### Testing Without Backend
1. Open `index.html` in browser
2. Select "Standalone Mode"
3. Use "Manual Entry" button to simulate scans
4. Open Debug panel (🐛 button) for logs