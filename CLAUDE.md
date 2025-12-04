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
npm test              # Jest unit tests (L1: 598 tests, ~15-30s)
npm run test:e2e      # Playwright E2E tests (L2: scanner only, ~2-3 min)
npm run test:all      # All tests (L1 + L2)

# Pre-merge verification
./verify-merge-ready.sh  # 8-phase readiness check (tests + build + artifacts)
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

## Testing Architecture

### Test Taxonomy

The scanner uses a 3-tier testing strategy:

**L1: Smoke Tests (Unit-level Verification)**
- **Location**: `tests/unit/` (598 tests)
- **Scope**: Module-level testing with mocks
- **Purpose**: Verify individual components work correctly in isolation
- **Run**: `npm test`
- **Duration**: ~15-30s
- **Coverage**: 598 tests across all modules (app, core, network, ui, utils)

**L2: Scanner E2E Tests (No Orchestrator)**
- **Location**: `tests/e2e/specs/`
- **Scope**: Full scanner testing WITHOUT backend orchestrator
- **Purpose**: Verify scanner works standalone in real browser environment
- **Run**: `npm run test:e2e`
- **Duration**: ~2-3 minutes
- **Coverage**: Standalone mode, UI navigation, localStorage persistence
- **Environment**: Playwright with Chromium (real browser, not jsdom)

**L3: Full Stack E2E Tests (Scanner + Orchestrator)**
- **Location**: `../../backend/tests/e2e/flows/` (parent repo)
- **Scope**: Complete integration testing with live orchestrator backend
- **Purpose**: Verify end-to-end transaction flow, WebSocket communication, scoring
- **Run**: From parent repo: `cd ../../backend && npm run test:e2e`
- **Duration**: ~4-5 minutes
- **Coverage**: Networked mode, WebSocket auth, transaction submission, scoring validation
- **Environment**: Playwright + live backend server

### Test Directory Structure

```
ALNScanner/
├── tests/
│   ├── unit/                       # L1: Jest unit tests
│   │   ├── app/                    # App layer (App.js, SessionModeManager, etc.)
│   │   ├── core/                   # Business logic (DataManager, TokenManager)
│   │   ├── network/                # WebSocket layer (OrchestratorClient, etc.)
│   │   ├── ui/                     # UI management (UIManager, Settings)
│   │   └── utils/                  # Utilities (Config, Debug, NFC)
│   └── e2e/                        # L2: Playwright E2E (scanner only)
│       └── specs/
│           ├── standalone-mode.spec.js
│           └── ui-navigation.spec.js
└── ...

../../backend/tests/e2e/flows/      # L3: Full stack E2E (parent repo)
├── 07b-gm-scanner-networked-blackmarket.test.js  # Transaction flow
├── 07c-gm-scanner-scoring-parity.test.js         # Scoring validation
└── ...
```

### Testing Best Practices

**When to Run Which Tests:**
- **Daily Development**: L1 only (`npm test` - fast feedback)
- **Pre-PR**: L1 + L2 (`npm run test:all` - verify scanner works standalone)
- **Pre-Merge**: L1 + L2 + L3 + CI checks (`./verify-merge-ready.sh` - full validation)

**Test Pattern: Event-Driven Architecture**
- DataManager and StandaloneDataManager emit CustomEvents
- Tests register event listeners BEFORE triggering actions (avoid race conditions)
- Example pattern:
```javascript
it('should emit event when transaction added', (done) => {
  // CRITICAL: Register listener BEFORE action
  manager.addEventListener('transaction:added', (event) => {
    expect(event.detail.transaction).toBeDefined();
    done();
  });

  // Then trigger action
  manager.addTransaction({ /* ... */ });
});
```

**Test Pattern: Dependency Injection**
- All modules accept dependencies via constructor (testability)
- Tests inject mocks for controlled behavior
- Example:
```javascript
const app = new App({
  sessionModeManager: mockSessionModeManager,
  dataManager: mockDataManager,
  standaloneDataManager: mockStandaloneDataManager,
  tokenManager: mockTokenManager
});
```

**Test Pattern: JWT Token Validation**
- App.js validates JWT token expiration before allowing networked mode
- Tests must provide valid tokens in localStorage:
```javascript
const createValidToken = (expiresInHours = 24) => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + (expiresInHours * 3600),
    iat: Math.floor(Date.now() / 1000)
  }));
  return `${header}.${payload}.test-signature`;
};

localStorage.setItem('aln_auth_token', createValidToken());
```

### CI/CD Integration

**GitHub Actions Workflow** (`.github/workflows/test.yml`):
- **Job 1: Unit Tests** - Runs L1 with coverage reporting
- **Job 2: Build Verification** - Vite build + artifact validation
- **Job 3: Integration Check** - Critical file verification + smoke tests
- **Job 4: Summary** - Aggregate results, fail if any job failed

**Local Verification** (`./verify-merge-ready.sh`):
- 8-phase pre-merge checklist
- Runs all L1 tests (598/598 passing)
- Verifies production build succeeds
- Checks bundle size (<10MB)
- Validates critical files present

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
ALNScanner/
├── src/                    # ES6 modules (source code)
│   ├── main.js            # Entry point - orchestrates initialization
│   ├── app/               # Application layer
│   │   ├── App.js         # Main application controller
│   │   ├── AdminController.js
│   │   ├── SessionModeManager.js
│   │   └── initializationSteps.js
│   ├── admin/             # Admin panel modules (Phase 2/3 refactor)
│   │   ├── AdminOperations.js
│   │   ├── MonitoringDisplay.js
│   │   ├── SessionManager.js
│   │   ├── SystemMonitor.js
│   │   ├── VideoController.js
│   │   └── utils/
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
│   │   ├── settings.js
│   │   ├── ScreenUpdateManager.js  # Phase 3: Centralized event routing
│   │   └── connectionWizard.js
│   ├── styles/            # CSS architecture (Phase 1 refactor)
│   └── utils/             # Utilities
│       ├── config.js
│       ├── debug.js
│       ├── domEventBindings.js
│       └── nfcHandler.js
├── tests/
│   ├── unit/              # Jest unit tests
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
- [ScreenUpdateManager.js](src/ui/ScreenUpdateManager.js) - Centralized event-to-screen routing (Phase 3)
- [connectionWizard.js](src/ui/connectionWizard.js) - Network auth flow UI

**Admin Layer ([src/admin/](src/admin/)) - Phase 2/3 Refactor:**
- [MonitoringDisplay.js](src/admin/MonitoringDisplay.js) - Transaction history, real-time updates
- [SessionManager.js](src/admin/SessionManager.js) - Session create/pause/resume/end
- [VideoController.js](src/admin/VideoController.js) - Video queue management
- [SystemMonitor.js](src/admin/SystemMonitor.js) - Health checks, system status
- [AdminOperations.js](src/admin/AdminOperations.js) - Admin action coordination

**Utils Layer ([src/utils/](src/utils/)):**
- [nfcHandler.js](src/utils/nfcHandler.js) - Web NFC API wrapper
- [debug.js](src/utils/debug.js) - Debug panel and logging (singleton class)
- [config.js](src/utils/config.js) - App constants
- [domEventBindings.js](src/utils/domEventBindings.js) - Event delegation for data-action buttons

### Event-to-Screen Routing (ScreenUpdateManager)

**Phase 3 refactor**: Centralized event routing replaces scattered visibility checks.

**Problem Solved:**
- Before: Each screen needed manual `if (screen.classList.contains('active'))` checks
- After: Declarative registration - ScreenUpdateManager handles routing automatically

**Architecture:**
```
DataManager emits 'transaction:added'
  → ScreenUpdateManager.onDataUpdate()
    → Run ALL global handlers (badge, stats - regardless of screen)
    → Check active screen ID
    → Run screen-specific handler IF registered for this event
```

**Usage Pattern:**
```javascript
// 1. Global handlers: Always run (badge updates, stats, etc.)
screenUpdateManager.registerGlobalHandler('transaction:added', () => {
  UIManager.updateHistoryBadge();
  UIManager.updateSessionStats();
});

// 2. Screen-specific handlers: Only run when that screen is active
screenUpdateManager.registerScreen('history', {
  'transaction:added': () => UIManager.renderTransactions(),
  'transaction:deleted': () => UIManager.renderTransactions()
});

screenUpdateManager.registerScreen('scoreboard', {
  'team-score:updated': () => UIManager.renderScoreboard()
});

// 3. Wire to data sources
screenUpdateManager.connectToDataSource(DataManager, [
  'transaction:added', 'transaction:deleted', 'team-score:updated'
]);

// 4. Set app context for handlers that need it
screenUpdateManager.setAppContext(app);
```

**Adding a New Screen:**
```javascript
// In main.js, register the new screen's event handlers
screenUpdateManager.registerScreen('myNewScreen', {
  'transaction:added': (eventData, app) => {
    // eventData: payload from the event
    // app: App instance (for accessing currentTeamId, etc.)
    UIManager.renderMyNewScreen();
  }
});
```

**Key Files:**
- `src/ui/ScreenUpdateManager.js` - The manager class
- `src/main.js:85-203` - Registration and wiring

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

### SessionManager (src/admin/SessionManager.js)

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

## Troubleshooting

### Build Issues

**Problem: Vite build fails with "Cannot find module '@vitejs/plugin-basic-ssl'"**
```
Error: Cannot find module '@vitejs/plugin-basic-ssl'
```
- **Cause**: Missing HTTPS plugin required for Web NFC API
- **Fix**: Install plugin: `npm install --save-dev @vitejs/plugin-basic-ssl`
- **Verification**: Check `package.json` devDependencies includes `"@vitejs/plugin-basic-ssl": "^1.1.0"`

**Problem: Vite dev server starts but page won't load**
```
Failed to load module script: MIME type text/html not supported
```
- **Cause**: Browser trying to load HTML instead of JavaScript module
- **Fix**: Clear browser cache and hard reload (Ctrl+Shift+R)
- **Workaround**: Stop dev server, delete `node_modules/.vite`, restart `npm run dev`

**Problem: Production build succeeds but dist/ directory empty**
```
vite v5.4.11 building for production...
✓ built in 2s
```
- **Cause**: Vite config issue or missing source files
- **Fix**: Check `vite.config.js` has correct `build.outDir: 'dist'`
- **Verification**: `ls -la dist/` should show index.html and assets/ directory

### Test Issues

**Problem: Jest fails with "SyntaxError: Cannot use import statement outside a module"**
```
SyntaxError: Cannot use import statement outside a module
  > 1 | import { Debug } from '../utils/debug.js';
```
- **Cause**: Missing or incorrect Babel configuration for ES6 modules
- **Fix**: Ensure `babel.config.js` exists at project root with:
```javascript
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }]
  ]
};
```
- **Verification**: Check `package.json` includes `"@babel/preset-env": "^7.26.0"` in devDependencies

**Problem: Tests fail with "ReferenceError: global is not defined"**
```
ReferenceError: global is not defined
  at OrchestratorClient.js:15
```
- **Cause**: Browser-only code using Node.js `global` fallback
- **Fix**: Remove `global` fallback from OrchestratorClient.js (already fixed in ES6 migration)
- **Verification**: `grep -r "global\." src/` should return no results

**Problem: Tests timeout waiting for event listeners**
```
Timeout - Async callback was not invoked within the 5000 ms timeout
```
- **Cause**: Event listener registered AFTER action triggered (race condition)
- **Fix**: Always register event listeners BEFORE triggering actions:
```javascript
// CORRECT
manager.addEventListener('event', handler);
manager.triggerAction();

// WRONG - race condition
manager.triggerAction();
manager.addEventListener('event', handler);
```

**Problem: Mock errors "TypeError: X is not a function"**
```
TypeError: this.sessionModeManager?.isStandalone is not a function
```
- **Cause**: Incomplete mock object missing required methods
- **Fix**: Add all expected methods to mock:
```javascript
const mockSessionModeManager = {
  isNetworked: jest.fn(() => false),
  isStandalone: jest.fn(() => false),
  setMode: jest.fn()
};
```

### Runtime Issues

**Problem: WebSocket connection fails with "Transport error"**
```
Transport error
Socket.io connection rejected
```
- **Cause**: Invalid or expired JWT token
- **Fix**:
  1. Check localStorage: `localStorage.getItem('aln_auth_token')`
  2. Decode token payload (base64): `atob(token.split('.')[1])`
  3. Verify `exp` (expiration) timestamp is in future
  4. Re-authenticate if expired: Clear localStorage, reconnect, enter admin password

**Problem: "Failed to fetch" when connecting to orchestrator**
```
Failed to fetch
TypeError: NetworkError when attempting to fetch resource
```
- **Cause**: CORS issue or orchestrator not running
- **Fix**:
  1. Verify orchestrator is running: `curl -k https://[IP]:3000/health`
  2. Check scanner using correct protocol (https:// not http://)
  3. Verify orchestrator `.env` has `ENABLE_HTTPS=true`
  4. Check browser console for CORS errors

**Problem: NFC reads not working in dev mode**
```
SecurityError: Web NFC is only available in secure contexts
```
- **Cause**: Dev server not using HTTPS
- **Fix**: Vite config already includes HTTPS plugin, but browser may need cert trust
- **Steps**:
  1. Navigate to `https://localhost:8443`
  2. Browser shows "not private" warning
  3. Click "Advanced" → "Proceed to localhost (unsafe)"
  4. Certificate trusted, NFC now works

**Problem: Transactions not persisting after reload**
```
localStorage.getItem('transactions') returns null after reload
```
- **Cause**: localStorage quota exceeded or privacy mode
- **Fix**:
  1. Check quota: `navigator.storage.estimate()`
  2. Clear old data: `localStorage.clear()` (loses all data)
  3. Disable privacy/incognito mode (blocks localStorage)

**Problem: Group completion bonuses not calculating**
```
Expected bonus: $120,000, Received: $0
```
- **Cause**: Field name inconsistency (tx.tokenGroup vs tx.group)
- **Fix**: Already fixed in standaloneDataManager.js:249 (uses `tx.group` consistently)
- **Verification**: Check transaction object structure in localStorage:
```javascript
JSON.parse(localStorage.getItem('transactions'))[0]
// Should have 'group' field, not 'tokenGroup'
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

## UI Architecture & Playwright Testing Guide

### ⚠️ CRITICAL: Understanding the Actual UI Structure

**This section documents the ACTUAL implementation after ES6 migration. Use this as the source of truth for Playwright tests.**

### Screen System Architecture

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

### Screen Navigation Logic

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

### Standalone Mode Flow (Actual Implementation)

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

### Event System (data-action Pattern)

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

### Playwright Selector Patterns (MUST FOLLOW)

#### 1. Screen Selectors - ALWAYS include `.active`

```javascript
// ✅ CORRECT - Matches only when screen is visible
this.teamEntryScreen = page.locator('#teamEntryScreen.active');
await this.teamEntryScreen.waitFor({ state: 'visible' });

// ❌ WRONG - Matches hidden screen too, will cause flaky tests
this.teamEntryScreen = page.locator('#teamEntryScreen');
```

#### 2. Button Selectors - Use data-action attributes

```javascript
// ✅ CORRECT - Stable, matches actual event system
page.locator('button[data-action="app.confirmTeamId"]')
page.locator('button[data-action="app.selectGameMode"][data-arg="standalone"]')

// ❌ WRONG - Fragile, breaks with text changes
page.locator('text=Enter')
page.locator('button:has-text("Standalone Game")')
```

#### 3. Dynamic Content Selectors - Use specific container IDs

```javascript
// ✅ CORRECT - Specific container
await page.locator('#historyContainer .transaction-card').count();
await page.locator('#scoreboardContainer .scoreboard-entry').count();
await page.locator('#teamDetailsContainer .token-detail-card').count();

// ❌ WRONG - Ambiguous, might match wrong container
await page.locator('.history-container .transaction-card').count();
```

#### 4. Form Elements - Use IDs or name attributes

```javascript
// ✅ CORRECT
await page.locator('#deviceId').fill('TEST_001');
await page.locator('#teamDisplay').textContent();
await page.locator('#currentTeam').textContent();

// ❌ WRONG - Class selectors are unstable
await page.locator('.team-display').textContent();
```

### Page Object Model (GMScannerPage.js)

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

### Critical Playwright Test Patterns

#### 1. Dialog Handling - MUST register BEFORE click

```javascript
// ✅ CORRECT - Handler registered BEFORE action
page.once('dialog', dialog => dialog.accept(tokenId));
await page.locator('[data-action="app.manualEntry"]').click();
await page.locator('#resultScreen.active').waitFor();

// ❌ WRONG - Race condition, dialog handler too late
await page.locator('[data-action="app.manualEntry"]').click();
page.on('dialog', dialog => dialog.accept(tokenId));  // Dialog already dismissed!
```

#### 2. Event Listener Registration - BEFORE triggering action

```javascript
// ✅ CORRECT - Listener registered BEFORE action
manager.addEventListener('transaction:added', handler);
manager.addTransaction(tx);

// ❌ WRONG - Event fires before listener ready
manager.addTransaction(tx);
manager.addEventListener('transaction:added', handler);  // Missed event!
```

#### 3. Conditional Rendering - Check screen visibility first

```javascript
// ✅ CORRECT - Only re-render if history screen active
const historyScreen = document.getElementById('historyScreen');
if (historyScreen?.classList.contains('active')) {
  UIManager.renderTransactions();
}

// ❌ WRONG - Renders even when screen hidden
UIManager.renderTransactions();  // Wastes cycles, doesn't update visible UI
```

#### 4. Mode-Specific Features - Verify mode before testing

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

### Common Pitfalls & Solutions

#### Pitfall 1: Missing `.active` class in selectors

**Symptom**: Test times out waiting for screen to appear
**Cause**: Selector matches hidden screen
**Solution**: Always include `.active` in screen selectors

```javascript
// ❌ WRONG
await page.locator('#scanScreen').waitFor({ state: 'visible' });

// ✅ CORRECT
await page.locator('#scanScreen.active').waitFor({ state: 'visible' });
```

#### Pitfall 2: Screen name mapping confusion

**Symptom**: `showScreen()` doesn't work
**Cause**: Using wrong name format
**Solution**: Use camelCase WITHOUT "Screen" suffix

```javascript
// ❌ WRONG
uiManager.showScreen('teamEntryScreen');

// ✅ CORRECT
uiManager.showScreen('teamEntry');  // Maps to #teamEntryScreen
```

#### Pitfall 3: Using window globals in tests

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

#### Pitfall 4: Overlay screen back navigation

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

#### Pitfall 5: Event timing in E2E tests

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

### Test Debugging Checklist

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

### Testing Resources

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

**Phase 3 Refactor**: Event routing now goes through `ScreenUpdateManager` (see below).

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

2. **ScreenUpdateManager Pattern (Phase 3)**
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

### Common Issues

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

### Key Files
- `src/ui/ScreenUpdateManager.js` - Centralized event-to-screen routing (Phase 3)
- `src/main.js` - ScreenUpdateManager registration and wiring
- `src/admin/MonitoringDisplay.js` - Transaction history, receives dataManager via DI
- `src/app/adminController.js` - AdminController DI (receives and passes dataManager)
- `src/network/networkedSession.js` - NetworkedSession DI (receives and passes dataManager)
- `src/app/app.js` - NetworkedSession creation (passes this.dataManager)
- `src/ui/uiManager.js` - _getDataSource() mode routing, renderTransactions()

### Testing Notes
**E2E Test Pattern:**
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

## Important Notes

- **ES6 MODULE BUILD**: Uses Vite build system, deploy dist/ directory after `npm run build`
- **CANNOT OPEN DIRECTLY**: Must use `npm run dev` (no direct file:// opening)
- **NO QR CODES**: This app uses NFC only (QR codes are Player Scanner's job)
- **SHARED TOKENS**: Both scanners use same token database via git submodule
- **GM FOCUSED**: All features designed for game master operations
- **MODE LOCKING**: Once networked/standalone selected, cannot change until reload
- **CLASS-BASED**: All modules use ES6 classes with dependency injection
- **EVENT-DRIVEN**: EventTarget pattern for pub/sub, WebSocket for networked mode
- **HTTPS REQUIRED**: Web NFC API only works over HTTPS (dev server uses port 8443)

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
