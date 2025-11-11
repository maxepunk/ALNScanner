# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ IMPORTANT: Modern ES6 Architecture (Nov 2025)

**This scanner now uses ES6 modules with Vite build system.**

Previous architecture (20+ script tags) was migrated to modern ES6 modules. See [docs/plans/2025-11-11-es6-module-migration.md](docs/plans/2025-11-11-es6-module-migration.md) for complete migration details.

### What Changed
- **Before**: Single HTML file with 20+ `<script>` tags, global namespace pollution
- **After**: ES6 modules with `import`/`export`, Vite build system, code splitting
- **Breaking Change**: Must use `npm run dev` (cannot open index.html directly)

## Project Overview

ALNScanner is the **Game Master (GM) Scanner** for "About Last Night" - a PWA for tracking team transactions via NFC token scanning during a 2-hour immersive game. This is the GM control tool, NOT the player-facing scanner.

**Key Facts:**
- ES6 module architecture with Vite 5.x build system
- Dual operation modes: Networked (WebSocket) OR Standalone (offline)
- Two game modes: Detective (star ratings) OR Black Market (currency)
- Android Chrome/Edge 89+ required for NFC
- Automated testing: Jest (598 unit tests) + Playwright (E2E)
- Automated deployment to GitHub Pages

## Development Commands

### Local Development
```bash
# Install dependencies (first time)
npm install

# Development server with hot reload (HTTPS on port 8443)
npm run dev

# Build for production
npm run build         # Output to dist/
npm run preview       # Test production build locally

# Run tests
npm test              # Jest unit tests (598 tests)
npm run test:e2e      # Playwright E2E tests
npm run test:all      # All tests
```

### Token Synchronization
```bash
# Sync tokens from shared repository (git submodule)
git submodule update --init --recursive
```

### Testing with Backend
```bash
# 1. Start orchestrator (from backend/)
cd ../../backend && npm run dev

# 2. Open scanner (Vite dev server auto-opens browser)
# 3. Select "Networked Mode"
# 4. Enter orchestrator URL: https://[IP]:3000
# 5. Authenticate with admin password
```

### Deployment
```bash
# Automatic deployment to GitHub Pages on push to main
git push origin main

# Manual deployment
npm run build
# Copy dist/ to server
```

## Architecture Overview

### Dual Operation Modes (SessionModeManager)

**1. Networked Mode** - WebSocket-driven with orchestrator backend
- Real-time state sync via Socket.io
- Admin panel (Session/Video/System control)
- Transaction queue with offline fallback
- Backend authoritative scoring

**2. Standalone Mode** - Fully offline operation
- localStorage persistence only
- No orchestrator dependency
- Local scoring calculations
- GitHub Pages deployable

**CRITICAL**: Mode is locked once selected - cannot switch until page reload.

### Dual Game Modes (Settings.mode)

**1. Detective Mode** (`mode: 'detective'`)
- Star ratings (1-5 ⭐)
- Simple cumulative scoring

**2. Black Market Mode** (`mode: 'blackmarket'`)
- Currency-based scoring ($100 - $10,000)
- Type multipliers (Personal 1x, Business 3x, Technical 5x)
- Group completion bonuses (2x - 20x)
- Exclusive scoreboard feature

## Game Business Logic

### Scoring System (Black Market Mode Only)

**Base Values (dataManager.js:32-38):**
```javascript
BASE_VALUES: {
    1: 100,      // 1-star token = $100
    2: 500,      // 2-star = $500
    3: 1000,     // 3-star = $1,000
    4: 5000,     // 4-star = $5,000
    5: 10000     // 5-star = $10,000
}
```

**Type Multipliers (dataManager.js:39-44):**
```javascript
TYPE_MULTIPLIERS: {
    'Personal': 1,    // 1x (baseline)
    'Business': 3,    // 3x
    'Technical': 5,   // 5x
    'UNKNOWN': 0      // 0x (no points)
}
```

**Token Score Formula:**
```
tokenScore = BASE_VALUES[valueRating] × TYPE_MULTIPLIERS[memoryType]

Example: 5-star Technical token = $10,000 × 5 = $50,000
```

**Group Completion Bonuses:**
- Collect ALL tokens in a group → unlock bonus multiplier
- Bonus Formula: `(groupMultiplier - 1) × totalBaseScore`
- Example: "Server Logs (x5)" with 3 tokens worth $15,000 base
  - Bonus = (5 - 1) × $15,000 = $60,000
  - Total = $15,000 + $60,000 = $75,000

**Group Completion Rules (dataManager.js:593-615):**
- Groups must have 2+ tokens
- Group multiplier must be > 1x
- Team must collect ALL tokens in group
- Only applies in Black Market mode

### Duplicate Detection

**Global Scope (Cross-Team):**
- Each token can only be scanned ONCE across ALL teams
- Tracked in `DataManager.scannedTokens` Set
- Persists in localStorage
- Prevents token sharing between teams

**Implementation (app.js:723-726):**
```javascript
if (DataManager.isTokenScanned(tokenId)) {
    Debug.log(`Duplicate token detected: ${tokenId}`, true);
    this.showDuplicateError(tokenId);
    return;
}
```

## Frontend Architecture

### ES6 Module Structure

**Project Structure:**
```
ALNScanner-es6-migration/
├── src/                    # ES6 modules (source code)
│   ├── main.js            # Entry point - orchestrates initialization
│   ├── app/               # Application layer
│   │   ├── App.js         # Main application controller
│   │   ├── AdminController.js
│   │   ├── SessionModeManager.js
│   │   └── initializationSteps.js
│   ├── core/              # Core business logic
│   │   ├── dataManager.js
│   │   └── tokenManager.js
│   ├── network/           # Network layer (WebSocket)
│   │   ├── OrchestratorClient.js
│   │   ├── ConnectionManager.js
│   │   ├── NetworkedSession.js
│   │   └── networkedQueueManager.js
│   ├── ui/                # UI management
│   │   ├── uiManager.js
│   │   └── settings.js
│   └── utils/             # Utilities
│       ├── config.js
│       ├── debug.js
│       ├── nfcHandler.js
│       └── adminModule.js
├── tests/
│   ├── unit/              # Jest unit tests (598 tests)
│   └── e2e/               # Playwright E2E tests
├── dist/                  # Build output (gitignored)
├── index.html             # Minimal HTML - loads single module script
├── vite.config.js         # Build configuration
└── playwright.config.js   # E2E test configuration
```

**Build System:**
- **Vite 5.x**: Fast dev server with hot module reload
- **Production**: Minified, code-split bundles
- **Module Loading**: Single `<script type="module" src="/src/main.js">`
- **Development**: https://localhost:8443 with self-signed cert (for NFC API)

**Key Architectural Changes (from migration):**
- ✅ All modules use `import`/`export` (no `window.XXX` pollution)
- ✅ Removed Node.js `global` fallbacks (browser-only code)
- ✅ Event-driven initialization (no imperative sequencing)
- ✅ Dependency injection throughout
- ✅ Real browser E2E testing (Playwright catches jsdom misses)

### Screen System (9 Screens)

**Core Screens:**
- `loadingScreen` - Initial app load
- `gameModeScreen` - Networked vs Standalone selection
- `settingsScreen` - Device ID, mode toggle, data management
- `teamEntryScreen` - Numeric keypad (6-digit team ID)
- `scanScreen` - NFC interface + stats
- `resultScreen` - Transaction outcome
- `historyScreen` - Transaction log
- `scoreboardScreen` - Black Market rankings (networked only)
- `teamDetailsScreen` - Group progress breakdown

**View System (Networked Mode Only):**
- `scanner-view` - Default scanning interface
- `admin-view` - Session/Video/System control
- `debug-view` - Real-time debug console

**Navigation (uiManager.js:showScreen()):**
- CSS class `.active` shows/hides screens
- Back button uses `UIManager.previousScreen`
- Overlay screens (history, scoreboard) don't update back stack

### Module Responsibilities

**App Layer ([src/app/](src/app/)):**
- [App.js](src/app/App.js) - Main coordinator, NFC processing, admin actions (ES6 class)
- [SessionModeManager.js](src/app/SessionModeManager.js) - Mode locking (networked/standalone)
- [initializationSteps.js](src/app/initializationSteps.js) - 11-phase startup sequence (1A-1J)
- [AdminController.js](src/app/AdminController.js) - Admin module lifecycle management

**Core Layer ([src/core/](src/core/)):**
- [dataManager.js](src/core/dataManager.js) - Transaction storage, scoring, group completion (both modes)
- [tokenManager.js](src/core/tokenManager.js) - Token database loading, fuzzy matching, group inventory

**Network Layer ([src/network/](src/network/)):**
- [OrchestratorClient.js](src/network/OrchestratorClient.js) - WebSocket client (Socket.io) - **Fixed: no `global` fallback**
- [ConnectionManager.js](src/network/ConnectionManager.js) - Auth, connection state, retry logic
- [NetworkedSession.js](src/network/NetworkedSession.js) - Service factory and lifecycle orchestrator
- [networkedQueueManager.js](src/network/networkedQueueManager.js) - Offline transaction queue

**UI Layer ([src/ui/](src/ui/)):**
- [uiManager.js](src/ui/uiManager.js) - Screen navigation, stats rendering, error display
- [settings.js](src/ui/settings.js) - localStorage persistence for config

**Utils Layer ([src/utils/](src/utils/)):**
- [adminModule.js](src/utils/adminModule.js) - SessionManager, VideoController, SystemMonitor (named exports)
- [nfcHandler.js](src/utils/nfcHandler.js) - Web NFC API wrapper
- [debug.js](src/utils/debug.js) - Debug panel and logging (singleton class)
- [config.js](src/utils/config.js) - App constants

## Transaction Flow

### Networked Mode Flow

```
1. NFC Scan → processNFCRead(result)
2. Global Duplicate Check (scannedTokens Set)
3. Token Lookup (fuzzy matching via TokenManager)
4. Queue Transaction
   ├─ NetworkedQueueManager.queueTransaction()
   ├─ If connected: socket.emit('transaction:submit')
   └─ If offline: localStorage queue for later
5. Backend Processing
   ├─ Validates token
   ├─ Calculates score with bonuses
   ├─ Stores in session
   └─ Broadcasts transaction:new to all GMs
6. Client Receives Broadcast
   ├─ DataManager.addTransaction()
   ├─ Update backendScores Map
   └─ UI refresh
7. Show Result Screen
```

### Standalone Mode Flow

```
1. NFC Scan → processNFCRead(result)
2. Global Duplicate Check
3. Token Lookup
4. Local Storage
   ├─ DataManager.addTransaction()
   ├─ StandaloneDataManager.addTransaction()
   ├─ Calculate points locally
   └─ Check group completion
5. UI Update → Show Result
```

## Backend Integration Contracts

### HTTP Endpoints (OpenAPI)

**Authentication:**
- `POST /api/admin/auth` - Get JWT token for WebSocket auth

**Token Data:**
- `GET /api/tokens` - Fetch token database (ESP32 scanner use)

**Player Scanner:**
- `POST /api/scan` - Submit scan (fire-and-forget)

**Session Query:**
- `GET /api/session` - Get current session (read-only)
- `GET /api/state` - Get global game state

### WebSocket Events (AsyncAPI)

**Authentication Flow:**
1. HTTP POST `/api/admin/auth` → JWT token
2. Socket.io connect with `handshake.auth.token`
3. Server validates JWT at connection time
4. Success: Auto-send `sync:full` event
5. Failure: Connection rejected with `connect_error`

**Client → Server:**
- `transaction:submit` - Submit token scan (queued via NetworkedQueueManager)
- `gm:command` - Admin actions (session, video, system)

**Server → Client (Broadcasts):**
- `sync:full` - Complete state snapshot (auto-sent on connect)
- `transaction:new` - New transaction processed
- `session:update` - Session lifecycle changes
- `video:status` - Video playback state
- `score:updated` - Team score changed
- `gm:command:ack` - Command response (success/failure)
- `device:connected` / `device:disconnected` - Device tracking

**Event Envelope Pattern (AsyncAPI Decision #2):**
```javascript
{
  event: "transaction:new",
  data: { /* payload */ },
  timestamp: "2025-11-02T10:30:00Z"
}
```

## Token Database

### Structure

**Git Submodule:**
- Path: `data/` → https://github.com/maxepunk/ALN-TokenData.git
- Shared between GM Scanner and Player Scanner
- Sync: `python3 sync.py`

**Token Schema (tokens.json):**
```json
{
  "token_id": {
    "SF_RFID": "token_id",           // Required: Unique identifier
    "SF_ValueRating": 1-5,            // Required: Star rating (1-5)
    "SF_MemoryType": "Technical",     // Required: Personal|Business|Technical
    "SF_Group": "Group Name (xN)",    // Optional: Group with multiplier
    "image": "assets/images/...",     // Player scanner only
    "audio": null,                    // Player scanner only
    "video": null                     // Player scanner only
  }
}
```

**Valid Memory Types:**
- `Personal` - 1x multiplier
- `Business` - 3x multiplier
- `Technical` - 5x multiplier
- Any other value → treated as `UNKNOWN` (0x multiplier)

### Fuzzy Matching (tokenManager.js:212-263)

Handles various RFID formats:
- Case insensitive (`ABC123` matches `abc123`)
- With/without colons (`a1:b2:c3` matches `a1b2c3`)
- With/without hyphens (`a1-b2-c3` matches `a1b2c3`)

## Initialization Sequence

**11 Phases (initializationSteps.js):**
1. **Phase 1D**: Initialize UIManager
2. **Phase 0**: Show loading screen
3. **Phase 1E**: Create SessionModeManager (CRITICAL: before viewController)
4. **Phase 1F**: Initialize view controller
5. **Phase 1G**: Load settings
6. **Phase 1H**: Load DataManager (transactions + scannedTokens)
7. **Phase 1I**: Detect NFC support
8. **Phase 1A**: Load token database (CRITICAL: fails if missing)
9. **Phase 1B**: Apply URL mode override (?mode=blackmarket)
10. **Phase 1J**: Register service worker
11. **Phase 1C**: Determine initial screen (connection restoration logic)

**Connection Restoration Logic (initializationSteps.js:146-171):**
- No saved mode → Show game mode selection
- Saved mode + connection lost → Clear mode, show wizard
- Saved mode + connection ready → Proceed to team entry

## Admin Panel (Networked Mode Only)

### SessionManager (adminModule.js:12-146)

**WebSocket Commands (NOT HTTP):**
```javascript
// Create session
socket.emit('gm:command', {
    event: 'gm:command',
    data: { action: 'session:create', payload: { name, teams } },
    timestamp: new Date().toISOString()
});

// Pause/Resume/End
socket.emit('gm:command', {
    data: { action: 'session:pause|resume|end', payload: {} }
});
```

**Event-Driven State:**
- Listens to `session:update` broadcasts for state changes
- `currentSession` property updated from broadcasts
- Promise-based API with 5s timeout
- MonitoringDisplay handles DOM updates (separation of concerns)

### VideoController

**Features:**
- Play/pause/stop/skip controls
- Manual video addition to queue
- Queue management (reorder, clear)
- Progress tracking via `video:progress` events

**Video List:**
- Populated from `GET /api/videos` (backend's video directory)

### SystemMonitor

**Health Checks:**
- Backend connectivity
- VLC connection status
- System resource monitoring

## Debugging

### Console Access

All modules exposed on `window` for debugging:
```javascript
window.App              // Main application
window.DataManager      // Transaction and scoring
window.TokenManager     // Token database
window.UIManager        // UI rendering
window.Settings         // Configuration
window.Debug            // Debug logging

// Networked mode only:
window.sessionModeManager  // Mode management
window.connectionManager   // Backend connection
window.orchestratorClient  // WebSocket client
window.queueManager        // Transaction queue
```

### Common Debug Tasks

```javascript
// Check current mode
console.log(Settings.mode);  // 'detective' or 'blackmarket'

// View all transactions
console.table(DataManager.transactions);

// Check token database
console.log(TokenManager.database);
console.log(Object.keys(TokenManager.database).length);

// Test token lookup
TokenManager.findToken('a1b2c3d4');

// View scanned tokens registry
console.log([...DataManager.scannedTokens]);

// Force UI update
UIManager.updateSessionStats();

// Check connection status (networked mode)
console.log(window.connectionManager?.isConnected);
console.log(window.connectionManager?.client?.socket?.connected);

// View pending queue
console.log(window.queueManager?.getStatus());

// Calculate team score
DataManager.calculateTeamScoreWithBonuses('001');
```

### Frontend-Specific Debugging

**UI Not Updating:**
```javascript
// Check active screen
document.querySelector('.screen.active')?.id

// Force screen transition
UIManager.showScreen('teamEntry')

// Verify DataManager initialized
console.log(DataManager?.transactions?.length)

// Check mode lock
window.sessionModeManager?.locked
window.sessionModeManager?.mode
```

**WebSocket Issues:**
```javascript
// Monitor all WebSocket events
window.connectionManager?.client?.socket.onAny((event, data) => {
  console.log('WS Event:', event, data);
});
```

**LocalStorage Debugging:**
```javascript
// View stored transactions
JSON.parse(localStorage.getItem('transactions') || '[]')

// Check game mode
localStorage.getItem('gameSessionMode')

// View all scanner settings
Object.keys(localStorage).filter(k => k.startsWith('aln_') || k.includes('mode') || k.includes('orchestrator'))
```

## Common Issues

### NFC Not Working
- **Cause**: Not served over HTTPS
- **Fix**: Use `npx http-server -S` with cert
- **Workaround**: Use "Manual Entry" button

### Tokens Not Recognized
- **Cause**: Token ID format mismatch
- **Debug**: `TokenManager.findToken('id')` in console
- **Fix**: Fuzzy matching handles colons/case, but check database keys

### Scoring Issues
- **Cause**: Invalid memory type (not Personal/Business/Technical)
- **Result**: Treated as UNKNOWN (0x multiplier)
- **Debug**: Check `token?.SF_MemoryType` value

### Connection Lost After Reload
- **Cause**: JWT token expired (24h) or invalid
- **Fix**: Connection wizard auto-shows, re-authenticate

### Group Bonuses Not Applied
- **Cause**: Missing tokens in group OR group has only 1 token
- **Debug**: Check `DataManager.getTeamCompletedGroups('teamId')`
- **Rule**: Groups need 2+ tokens AND multiplier > 1x

## Important Notes

- **NO BUILD PROCESS**: Pure HTML/JS/CSS, deploy index.html directly
- **NO QR CODES**: This app uses NFC only (QR codes are Player Scanner's job)
- **SHARED TOKENS**: Both scanners use same token database via git submodule
- **GM FOCUSED**: All features designed for game master operations
- **MODE LOCKING**: Once networked/standalone selected, cannot change until reload
- **CLASS-BASED**: DataManager uses ES6 classes with dependency injection
- **EVENT-DRIVEN**: EventTarget pattern for pub/sub, WebSocket for networked mode
- **HTTPS REQUIRED**: Web NFC API only works over HTTPS (except localhost)

## Related Documentation

**For detailed UI/UX documentation**, see:
- `DOCUMENTATION_INDEX.md` - Master index
- `UI_MAP_SUMMARY.md` - Quick reference (282 lines)
- `UI_STRUCTURE_MAP.md` - Technical reference with line numbers (526 lines)
- `SCREEN_FLOW_DIAGRAMS.md` - 10 ASCII diagrams (800+ lines)
- `docs/NETWORKED_MODE_QUICK_REFERENCE.md` - User flow guide (238 lines)

**For backend integration**, see:
- `../backend/CLAUDE.md` - Orchestrator architecture
- `../backend/contracts/openapi.yaml` - HTTP API contract
- `../backend/contracts/asyncapi.yaml` - WebSocket event contract

**For token management**, see:
- `MAINTENANCE.md` - Token sync instructions
- `README.md` - User-facing documentation
