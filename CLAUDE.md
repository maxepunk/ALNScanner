# CLAUDE.md

Last verified: 2026-02-06

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For cross-cutting concerns (scoring logic, operation modes, game modes, token schema), see @../CLAUDE.md.
For scoring implementation details, see @../docs/SCORING_LOGIC.md.

## ⚠️ IMPORTANT: Modern ES6 Architecture (Nov 2025)

**This scanner now uses ES6 modules with Vite build system.**

Previous architecture (20+ script tags) was migrated to modern ES6 modules (Nov 2025).

### What Changed
- **Before**: Single HTML file with 20+ `<script>` tags, global namespace pollution
- **After**: ES6 modules with `import`/`export`, Vite build system, code splitting
- **Breaking Change**: Must use `npm run dev` (cannot open index.html directly)

## Project Overview

ALNScanner is the **Game Master (GM) Scanner** for "About Last Night" - a PWA for tracking team transactions via NFC token scanning during a 2-hour immersive game. This is the GM control tool, NOT the player-facing scanner.

**Key Facts:**
- ES6 module architecture with Vite 7.x build system
- Dual operation modes: Networked (WebSocket) OR Standalone (offline)
- Two game modes: Detective (star ratings) OR Black Market (currency)
- Android Chrome/Edge 89+ required for NFC
- Automated testing: Jest (759 unit tests) + Playwright (E2E)
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
npm test              # Jest unit tests (L1: 759 tests, ~15-30s)
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
- Currency-based scoring ($10,000 - $750,000)
- Type multipliers (Personal 1x, Business 3x, Technical 5x)
- Group completion bonuses (2x - 20x)
- Exclusive scoreboard feature

### Storage Strategy Pattern (Phase 2 Architecture)

**UnifiedDataManager** uses the Strategy Pattern to handle both operation modes:

```
UnifiedDataManager (Facade)
├── IStorageStrategy (Interface)
│   ├── LocalStorage     → Standalone mode (localStorage persistence)
│   └── NetworkedStorage → Networked mode (WebSocket sync)
└── Delegates all operations to active strategy
```

**Key Files:**
- `src/core/unifiedDataManager.js` - Facade that delegates to active strategy
- `src/core/storage/IStorageStrategy.js` - Interface defining required methods
- `src/core/storage/LocalStorage.js` - Standalone mode implementation
- `src/core/storage/NetworkedStorage.js` - Networked mode implementation

**Strategy Selection:**
- Mode determined at startup by SessionModeManager
- `unifiedDataManager.setStrategy(strategy)` called during initialization
- Once set, strategy handles all data operations for the session

## Testing Architecture

### Test Taxonomy

The scanner uses a 3-tier testing strategy:

**L1: Smoke Tests (Unit-level Verification)**
- **Location**: `tests/unit/` (759 tests)
- **Scope**: Module-level testing with mocks
- **Purpose**: Verify individual components work correctly in isolation
- **Run**: `npm test`
- **Duration**: ~15-30s
- **Coverage**: 759 tests across all modules (app, core, network, ui, utils)

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
│   │   ├── app/                    # App layer (app.js, SessionModeManager, etc.)
│   │   ├── core/                   # Business logic (UnifiedDataManager, TokenManager, Storage)
│   │   ├── network/                # WebSocket layer (OrchestratorClient, etc.)
│   │   ├── ui/                     # UI management (UIManager, Settings)
│   │   └── utils/                  # Utilities (Config, Debug, NFC)
│   └── e2e/                        # L2: Playwright E2E (scanner only)
│       └── specs/
│           ├── 00-smoke-no-globals.spec.js
│           ├── 00-smoke.spec.js
│           ├── 01-integration.spec.js
│           ├── 02-standalone-mode.spec.js
│           ├── 99-diagnostic.spec.js
│           └── phase2-validation.spec.js
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
- UnifiedDataManager emits CustomEvents via its storage strategies
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
  dataManager: mockUnifiedDataManager,
  tokenManager: mockTokenManager
});
```

**Test Pattern: JWT Token Validation**
- app.js validates JWT token expiration before allowing networked mode
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
- Runs all L1 tests (759/759 passing)
- Verifies production build succeeds
- Checks bundle size (<10MB)
- Validates critical files present

## Game Business Logic

### Scoring System (Black Market Mode Only)

**Scoring Configuration (scoring.js:20-25):**

Values are dynamically loaded from the shared `data/scoring-config.json` submodule (not hardcoded):
```javascript
import sharedConfig from '../../data/scoring-config.json';

export const SCORING_CONFIG = {
    BASE_VALUES: Object.fromEntries(
        Object.entries(sharedConfig.baseValues).map(([k, v]) => [parseInt(k), v])
    ),
    TYPE_MULTIPLIERS: { ...sharedConfig.typeMultipliers }
};
```

**Token Score Formula:**
```
tokenScore = BASE_VALUES[valueRating] × TYPE_MULTIPLIERS[memoryType]

Example: 5-star Technical token = $150,000 × 5 = $750,000
```

**Group Completion Bonuses:**
- Collect ALL tokens in a group → unlock bonus multiplier
- Bonus Formula: `(groupMultiplier - 1) × totalBaseScore`
- Example: "Server Logs (x5)" with 3 tokens worth $15,000 base
  - Bonus = (5 - 1) × $15,000 = $60,000
  - Total = $15,000 + $60,000 = $75,000

**Group Completion Rules (LocalStorage.js:345-386):**
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

**Implementation (app.js:729-733):**
```javascript
if (this.dataManager.isTokenScanned(tokenId)) {
    this.debug.log(`Duplicate token detected: ${tokenId}`, true);
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
│   │   ├── app.js         # Main application controller
│   │   ├── adminController.js
│   │   ├── sessionModeManager.js
│   │   └── initializationSteps.js
│   ├── admin/             # Admin panel modules (Phase 2/3 refactor)
│   │   ├── AdminOperations.js
│   │   ├── DisplayController.js    # HDMI display mode toggling
│   │   ├── MonitoringDisplay.js
│   │   ├── SessionManager.js
│   │   ├── SystemMonitor.js
│   │   ├── VideoController.js
│   │   └── utils/
│   ├── core/              # Core business logic
│   │   ├── unifiedDataManager.js   # Facade for storage strategies
│   │   ├── dataManagerUtils.js     # Shared duplicate detection helpers
│   │   ├── tokenManager.js
│   │   ├── scoring.js              # Scoring config and utilities
│   │   ├── teamRegistry.js         # Team state management
│   │   └── storage/                # Storage strategy implementations
│   │       ├── IStorageStrategy.js
│   │       ├── LocalStorage.js     # Standalone mode
│   │       └── NetworkedStorage.js # Networked mode
│   ├── services/          # Cross-cutting services
│   │   └── StateValidationService.js  # JWT/session validation on restore
│   ├── network/           # Network layer (WebSocket)
│   │   ├── orchestratorClient.js
│   │   ├── connectionManager.js
│   │   ├── networkedSession.js
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
- **Vite 7.x**: Fast dev server with hot module reload
- **Production**: Minified, code-split bundles
- **Module Loading**: Single `<script type="module" src="/src/main.js">`
- **Development**: https://localhost:8443 with self-signed cert (for NFC API)

**Key Architectural Changes (from migration):**
- ✅ All modules use `import`/`export` (no `window.XXX` pollution)
- ✅ Removed Node.js `global` fallbacks (browser-only code)
- ✅ Event-driven initialization (no imperative sequencing)
- ✅ Dependency injection throughout
- ✅ Real browser E2E testing (Playwright catches jsdom misses)

### Screen System (8 Screens)

**Core Screens:**
- `loadingScreen` - Initial app load
- `gameModeScreen` - Networked vs Standalone selection
- `teamEntryScreen` - Team selection (Dropdown or Text Input)
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
- [app.js](src/app/app.js) - Main coordinator, NFC processing, admin actions (ES6 class)
- [sessionModeManager.js](src/app/sessionModeManager.js) - Mode locking (networked/standalone)
- [initializationSteps.js](src/app/initializationSteps.js) - 11-phase startup sequence (1A-1J)
- [adminController.js](src/app/adminController.js) - Admin module lifecycle management

**Core Layer ([src/core/](src/core/)):**
- [scoring.js](src/core/scoring.js) - Centralized scoring config (SCORING_CONFIG) and utilities
- [unifiedDataManager.js](src/core/unifiedDataManager.js) - Facade pattern delegating to storage strategies
- [dataManagerUtils.js](src/core/dataManagerUtils.js) - Shared duplicate detection helpers (extracted from DataManager)
- [tokenManager.js](src/core/tokenManager.js) - Token database loading, fuzzy matching, group inventory
- [teamRegistry.js](src/core/teamRegistry.js) - Team state management for standalone mode
- [storage/IStorageStrategy.js](src/core/storage/IStorageStrategy.js) - Interface for storage implementations
- [storage/LocalStorage.js](src/core/storage/LocalStorage.js) - Standalone mode: localStorage persistence, group completion
- [storage/NetworkedStorage.js](src/core/storage/NetworkedStorage.js) - Networked mode: WebSocket sync

**Network Layer ([src/network/](src/network/)):**
- [orchestratorClient.js](src/network/orchestratorClient.js) - WebSocket client (Socket.io) - **Fixed: no `global` fallback**
- **GOTCHA**: `orchestratorClient.js:_setupMessageHandlers()` has an explicit `messageTypes` array — new backend events MUST be added to this list or they silently won't arrive at the GM Scanner
- [connectionManager.js](src/network/connectionManager.js) - Auth, connection state, retry logic
- [networkedSession.js](src/network/networkedSession.js) - Service factory and lifecycle orchestrator
- [networkedQueueManager.js](src/network/networkedQueueManager.js) - Offline transaction queue

**UI Layer ([src/ui/](src/ui/)):**
- [uiManager.js](src/ui/uiManager.js) - Screen navigation, stats rendering, error display
  - `renderScoreboard(container?)` - Parameterized: defaults to `#scoreboardContainer`, accepts any container
- [settings.js](src/ui/settings.js) - localStorage persistence for config
- [ScreenUpdateManager.js](src/ui/ScreenUpdateManager.js) - Centralized event-to-screen routing (Phase 3)
- [connectionWizard.js](src/ui/connectionWizard.js) - Network auth flow UI

**Services Layer ([src/services/](src/services/)):**
- [StateValidationService.js](src/services/StateValidationService.js) - Validates JWT token, orchestrator reachability, and session existence before restoring networked mode (prevents stale cache issues)

**Admin Layer ([src/admin/](src/admin/)) - Phase 2/3 Refactor:**
- [MonitoringDisplay.js](src/admin/MonitoringDisplay.js) - Game Activity display (player discoveries + GM transactions)
- [SessionManager.js](src/admin/SessionManager.js) - Session create/pause/resume/end
- [VideoController.js](src/admin/VideoController.js) - Video queue management
- [DisplayController.js](src/admin/DisplayController.js) - HDMI display mode toggling (idle loop vs scoreboard)
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
  'transaction:added': () => UIManager.renderGameActivity(container),
  'transaction:deleted': () => UIManager.renderGameActivity(container)
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

**Container Handlers (DOM elements that update regardless of screen):**
```javascript
// Container handlers run for ANY matching container present in DOM
// Unlike screen handlers, these don't check for .active class
screenUpdateManager.registerContainer('admin-score-board', {
  'team-score:updated': (eventData, container) => {
    UIManager.renderScoreboard(container);
  }
});
```

**Difference: Screen vs Container Handlers:**
- `registerScreen()`: Only runs when that screen has `.active` class
- `registerContainer()`: Runs for any container present in DOM (e.g., both scoreboards)

**Current Containers:**
- `scoreboardContainer` - Main scoreboard screen (scanner-view)
- `admin-score-board` - Admin panel inline scoreboard (admin-view)

**Key Files:**
- `src/ui/ScreenUpdateManager.js` - The manager class
- `src/main.js:84-259` - Registration and wiring

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
4. Local Storage (via UnifiedDataManager → LocalStorage strategy)
   ├─ unifiedDataManager.addTransaction()
   ├─ LocalStorage.addTransaction()
   ├─ Calculate points locally (scoring.js)
   └─ Check group completion (LocalStorage._checkGroupCompletion)
5. UI Update → Show Result
```

## Backend Integration Contracts

### HTTP Endpoints (OpenAPI)

**Authentication:**
- `POST /api/admin/auth` - Get JWT token for WebSocket auth

**Token Data:**
- `GET /api/tokens` - Fetch token database (ESP32 scanner use)

**Player Scanner:**
- `POST /api/scan` - Submit scan (persisted to session.playerScans, broadcast to GMs)

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
  - **REQUIRED**: `deviceType: 'gm'` field for duplicate detection logic
- `gm:command` - Admin actions (session, video, system)

**Server → Client (Broadcasts):**
- `sync:full` - Complete state snapshot (auto-sent on connect, includes playerScans)
- `transaction:new` - New GM transaction processed
- `player:scan` - Player scanner activity (persisted to session.playerScans)
- `session:update` - Session lifecycle changes
- `video:status` - Video playback state
- `score:updated` - Team score changed (mapped to internal `team-score:updated` event)
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

### Fuzzy Matching (tokenManager.js:207-233)

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

**Connection Restoration Logic (initializationSteps.js:187-224):**
- No saved mode → Show game mode selection
- Saved mode + connection lost → Clear mode, show wizard
- Saved mode + connection ready → Proceed to team entry

## Admin Panel (Networked Mode Only)

### SessionManager (src/admin/SessionManager.js)

**Session Creation:**
Sessions start with an empty teams array. Teams are created dynamically during gameplay:
```javascript
// Create session (teams array typically empty - teams added dynamically)
socket.emit('gm:command', {
    event: 'gm:command',
    data: { action: 'session:create', payload: { name, teams: [] } },
    timestamp: new Date().toISOString()
});

// Add team mid-game (via team entry UI)
socket.emit('gm:command', {
    data: { action: 'session:addTeam', payload: { teamId: 'TeamName' } }
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
- **Verification**: Check `package.json` devDependencies includes `"@vitejs/plugin-basic-ssl": "^2.1.0"`

**Problem: Vite dev server starts but page won't load**
```
Failed to load module script: MIME type text/html not supported
```
- **Cause**: Browser trying to load HTML instead of JavaScript module
- **Fix**: Clear browser cache and hard reload (Ctrl+Shift+R)
- **Workaround**: Stop dev server, delete `node_modules/.vite`, restart `npm run dev`

**Problem: Production build succeeds but dist/ directory empty**
```
vite v7.x.x building for production...
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
  at orchestratorClient.js:15
```
- **Cause**: Browser-only code using Node.js `global` fallback
- **Fix**: Remove `global` fallback from orchestratorClient.js (already fixed in ES6 migration)
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
- **Fix**: Already fixed in LocalStorage.js:345 (uses `tx.group` consistently)
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

## Playwright E2E Testing

For comprehensive Playwright testing patterns, see @docs/PLAYWRIGHT_TESTING_GUIDE.md.

**Quick Reference:**
- Screen selectors: Always use `.active` class (e.g., `#teamEntryScreen.active`)
- Button selectors: Use `data-action` attributes (e.g., `button[data-action="app.confirmTeamId"]`)
- Dialog handling: Register handler BEFORE click action
- Screen names: Use camelCase WITHOUT "Screen" suffix in `showScreen()`

**Testing Resources:**
- Page Object: `tests/e2e/page-objects/GMScannerPage.js`
- L2 E2E Tests: `tests/e2e/specs/02-standalone-mode.spec.js`
- L3 Full Stack: `../../backend/tests/e2e/flows/07b-gm-scanner-networked-blackmarket.test.js`

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

**Start here:**
- `DOCUMENTATION_INDEX.md` - Master documentation index with all links

**UI/UX documentation:**
- `docs/UI_TESTING_REFERENCE.md` - Playwright selectors, navigation flows, page object patterns
- `docs/UI_ARCHITECTURE.md` - Conceptual overview: screens, views, event routing, mode selection

**User flows:**
- `docs/NETWORKED_MODE_QUICK_REFERENCE.md` - Networked mode quick reference
- `docs/NETWORKED_MODE_USER_FLOW.md` - Complete user flow documentation

**For backend integration**, see:
- `../backend/CLAUDE.md` - Orchestrator architecture
- `../backend/contracts/openapi.yaml` - HTTP API contract
- `../backend/contracts/asyncapi.yaml` - WebSocket event contract

**For token management**, see:
- `MAINTENANCE.md` - Token sync instructions
- `README.md` - User-facing documentation
