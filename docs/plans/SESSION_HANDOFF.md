# ES6 Migration - Session Handoff Document

**Branch:** `feature/es6-module-migration`
**Worktree:** `/home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner-es6-migration`
**Last Updated:** 2025-11-11
**Session Status:** Phase 3 COMPLETE ✅ | Ready for Phase 4: Network Layer
**Test Status:** 374/374 passing ✅

---

## Quick Resume Commands

```bash
# Navigate to worktree
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner-es6-migration

# Verify branch and status
git branch --show-current  # Should be: feature/es6-module-migration
git status
git log --oneline -20

# Run tests
npm test                    # All tests (374 passing)
npm run dev                 # Vite dev server (port 8443)

# Check what's committed
git log --oneline --graph -25
```

---

## Project Context

### What We're Doing
Converting ALNScanner (GM Scanner PWA) from script-tag architecture to ES6 modules with Vite build system, while maintaining:
- Dual operation modes (Networked/Standalone)
- Full backend compatibility (orchestrator on port 3000)
- All existing tests passing
- No breaking changes to AsyncAPI contract

### Why ES6 Migration
The branch already completed Phase 6 architecture refactoring (NetworkedSession, ConnectionManager, etc.) but still uses:
- Script tags for module loading
- `window.XXX` global exports
- No build system
- Hybrid CommonJS/browser pattern

We're adding:
- Vite build system (port 8443, HTTPS for NFC)
- True ES6 `import`/`export`
- Path aliases (`@utils`, `@core`, etc.)
- Production build with bundling

---

## Progress Summary

### ✅ COMPLETED

#### Phase 0-1: Build Infrastructure (5 commits)
- **Vite 7.2.2** installed and configured
  - Dev server: port 8443 (HTTPS)
  - API proxy to backend (port 3000)
  - Base path support for backend deployment
  - Config: `vite.config.js`
- **Playwright** E2E configured
  - Auto-starts Vite dev server
  - Config: `playwright.config.js`
- **Jest with Babel** for ES6 support
  - Path aliases match Vite config
  - TextEncoder/TextDecoder polyfills added
  - Config: `jest.config.js`
- **DEPLOYMENT.md** created (backend integration guide)

**Key Files:**
- `vite.config.js`
- `jest.config.js` (updated with Babel transform)
- `playwright.config.js` (updated for Vite)
- `package.json` (scripts: dev, build, build:backend)
- `tests/helpers/test-setup.js` (polyfills)

#### Phase 2: Utility Modules (4 commits, 50 tests) ✅ COMPLETE

All modules in `src/utils/` converted to ES6:

1. **config.js** (5 tests) - `11ca69e`
   - Pure ES6 exports
   - No dependencies

2. **debug.js** (7 tests) - `5ff92b5`
   - ES6 class with singleton
   - Imports CONFIG from config.js
   - Temporary app parameter for viewController access

3. **nfcHandler.js** (10 tests) - `dbc99ed`
   - ES6 class with singleton
   - Imports Debug
   - Web NFC API wrapper

4. **adminModule.js** (28 tests - 5 classes) - `e88900d`
   - SessionManager: WebSocket session commands
   - VideoController: Video playback control
   - SystemMonitor: Health checks (backend/VLC)
   - AdminOperations: System commands
   - MonitoringDisplay: DOM updates (event-driven)

**Testing Best Practices Applied:**
- ✅ Test REAL behavior (promise resolution, state updates, DOM changes)
- ✅ Only mock external dependencies (socket.io, fetch, Web APIs)
- ❌ NO testing anti-patterns (not testing mock interactions)

#### Phase 3: Core & UI Modules (8 commits, 204 tests) ✅ COMPLETE

##### 1. TokenManager (20 tests) - `a192d04`
**File:** `src/core/tokenManager.js`

- ES6 class with singleton
- Dependency injection for DataManager helpers
- Fuzzy token matching (case-insensitive, with/without colons)
- Group inventory building
- Demo data fallback

##### 2. DataManager (66 tests) - `ffb3c11`, `bf72586`, `2bf955c`
**File:** `src/core/dataManager.js` (827 lines)

**Batch 1 - Core Structure (33 tests):**
- Constructor with dependency injection (**CRITICAL:** future-proof pattern)
- Transaction storage (load/save/add with normalization)
- Scanned tokens tracking (mode-specific keys)
- Session management (reset/clear)
- Helper methods (parseGroupInfo, normalizeGroupName)
- Basic stats (getSessionStats, calculateTokenValue)

**Batch 2 - Scoring & Group Completion (14 tests):**
- calculateTeamScoreWithBonuses() - Black Market scoring with bonuses
- getTeamCompletedGroups() - Group completion detection
- getTeamTransactions() - Filtered and sorted queries
- getGlobalStats() - Aggregate statistics

**Business Logic Validated:**
- Base values: 1★=$100, 2★=$500, 3★=$1k, 4★=$5k, 5★=$10k
- Type multipliers: Personal=1x, Business=3x, Technical=5x
- Group bonuses: (multiplier - 1) × baseValue per token
- Only groups with 2+ tokens and multiplier > 1 eligible

**Batch 3 - Network & Mode-Specific (19 tests):**
- updateTeamScoreFromBackend() - Backend sync with UI triggers
- updateGameState() - Orchestrator state sync
- getTeamScores() - Backend (networked) or local (offline)
- calculateLocalTeamScores() - Offline fallback
- getEnhancedTeamTransactions() - Grouped data for UI
- exportData() - CSV/JSON export

##### 3. StandaloneDataManager (32 tests) - `f85ef0d`
**File:** `src/core/standaloneDataManager.js` (412 lines)

- **Event-driven**: Extends EventTarget (emits 5 events)
- Events: `transaction-added`, `scores-updated`, `group-completed`, `session-saved`, `session-loaded`
- Dependency injection: tokenManager (for group metadata), debug (optional)
- Zero coupling to UIManager (pure event emission)

**Business Logic:**
- Standalone-only session management
- Local team score calculations (blackmarket scoring)
- Group completion bonus logic
- localStorage persistence (today-only loading)
- Team score ranking
- Export/clear utilities

##### 4. Settings (30 tests) - `f124beb`
**File:** `src/ui/settings.js` (116 lines)

- **Event-driven**: Extends EventTarget (emits 3 events)
- Events: `settings:loaded`, `settings:saved`, `settings:changed`
- Zero coupling to UIManager (pure event emission)
- localStorage bidirectional sync with change detection
- Direct DOM manipulation for settings screen

##### 5. UIManager (56 tests) - `be924be`
**File:** `src/ui/uiManager.js` (791 lines)

- **Pure rendering layer**: Does NOT extend EventTarget (end of data flow)
- Dependency injection: settings, dataManager, sessionModeManager, app
- Zero business logic (only DOM manipulation)

**Comprehensive test coverage:**
- Constructor & initialization (6)
- Screen navigation (5)
- Mode display (5)
- Error/toast notifications (5)
- Stats rendering (6)
- Scoreboard rendering (5)
- Team details rendering (7)
- Transaction history (4)
- Token result display (5)
- Utility methods (3)
- Edge cases (5)

**Rendering Methods:**
- Screen navigation: `showScreen()`
- Mode display: `updateModeDisplay()`, `updateNavigationButtons()`
- Stats: `updateSessionStats()`, `updateHistoryBadge()`, `updateHistoryStats()`
- Scoreboard: `renderScoreboard()`
- Team details: `renderTeamDetails()`, `renderTokenCard()`
- History: `renderTransactions()`, `filterTransactions()`
- Notifications: `showError()`, `showToast()`, `showGroupCompletionNotification()`
- Token results: `showTokenResult()`

---

## 🔄 NEXT: Phase 4 - Network Layer

**Files to Convert (in order):**

### 4.1: OrchestratorClient
**File:** `js/network/OrchestratorClient.js` → `src/network/orchestratorClient.js` (~200 lines)

**Current State:** Already refactored (Phase 6), uses hybrid CommonJS/browser pattern
**Dependencies:** None (pure WebSocket wrapper)
**Pattern:**
- Remove `global` fallback (browser-only)
- Convert to ES6 class
- Export singleton
- **Does NOT extend EventTarget** (uses EventTarget internally for event forwarding)

**Key Responsibilities:**
- Socket.io connection management
- Message send/receive
- Event forwarding (wraps socket.io events)
- No business logic (dumb pipe)

**Testing Approach:**
- Mock socket.io connection
- Verify event forwarding
- Test connection lifecycle
- Error handling

### 4.2: ConnectionManager
**File:** `js/network/ConnectionManager.js` → `src/network/connectionManager.js` (~250 lines)

**Current State:** Already refactored (Phase 6)
**Dependencies:** OrchestratorClient (ES6 after 4.1)
**Pattern:**
- **Extends EventTarget** (emits connection lifecycle events)
- Dependency injection: orchestratorClient
- Export singleton

**Key Responsibilities:**
- Connection state machine (disconnected → connecting → connected)
- Authentication flow (JWT token management)
- Health checks (backend + VLC)
- Auto-reconnect logic
- Emits: `connected`, `disconnected`, `auth:required`, `error`

**Testing Approach:**
- Mock OrchestratorClient
- Test state transitions
- Verify event emissions
- Test reconnect logic

### 4.3: NetworkedSession
**File:** `js/network/NetworkedSession.js` → `src/network/networkedSession.js` (~300 lines)

**Current State:** Already refactored (Phase 6) - service factory pattern
**Dependencies:** ConnectionManager (ES6 after 4.2), AdminController, NetworkedQueueManager
**Pattern:**
- **Extends EventTarget** (emits session lifecycle events)
- Service factory (initializes and coordinates services)
- Dependency injection: connectionManager, adminController, queueManager
- Export singleton

**Key Responsibilities:**
- Service initialization (11-step init sequence)
- Event coordination between services
- Cleanup on disconnect
- Emits: `session:ready`, `session:error`

**Testing Approach:**
- Mock all services
- Test initialization sequence
- Verify event coordination
- Test cleanup

### 4.4: NetworkedQueueManager
**File:** `js/network/NetworkedQueueManager.js` → `src/network/networkedQueueManager.js` (~150 lines)

**Current State:** Already refactored (Phase 6)
**Dependencies:** OrchestratorClient (ES6 after 4.1)
**Pattern:**
- ES6 class (does NOT extend EventTarget - managed by NetworkedSession)
- Dependency injection: orchestratorClient
- Export singleton

**Key Responsibilities:**
- Offline transaction queue (localStorage)
- Auto-sync on reconnect
- Queue management (add, retry, clear)

**Testing Approach:**
- Mock OrchestratorClient
- Test queue persistence
- Verify auto-sync logic
- Test failure handling

---

## Critical Architecture Decisions 🏗️

### ⚠️ EVENT-DRIVEN ARCHITECTURE PATTERN

**Established in Phase 3 - Applied Throughout:**

```javascript
// Event-emitting modules (sources of data/state changes)
class ModuleName extends EventTarget {
  constructor({ dependency1, dependency2 } = {}) {
    super();
    this.dep1 = dependency1;
    this.dep2 = dependency2;
  }

  someAction() {
    // Update state
    this.state = newValue;

    // Emit event (NOT calling other modules directly)
    this.dispatchEvent(new CustomEvent('module:event-name', {
      detail: { state: this.state }
    }));
  }
}

// Pure rendering modules (END of data flow, NO events emitted)
class UIModule {
  constructor({ dataSource } = {}) {
    this.dataSource = dataSource;
  }

  render() {
    // Only DOM manipulation, no event emission
    const data = this.dataSource.getData();
    this.updateDOM(data);
  }
}

// Event listeners (wired in App.js or main.js)
dataModule.addEventListener('module:changed', (e) => {
  uiModule.render(e.detail.state);
});
```

**Modules That Emit Events:**
- ✅ Settings (extends EventTarget)
- ✅ StandaloneDataManager (extends EventTarget)
- ⏳ ConnectionManager (extends EventTarget) - Phase 4
- ⏳ NetworkedSession (extends EventTarget) - Phase 4

**Modules That DON'T Emit Events (pure rendering/logic):**
- ✅ UIManager (pure rendering layer)
- ✅ DataManager (data store, not event source)
- ✅ TokenManager (data lookup, not event source)

### ⚠️ FUTURE-PROOF DEPENDENCY INJECTION

**Pattern Established in DataManager - Applied to All Modules:**

```javascript
// GOOD (future-proof):
constructor({ tokenManager, settings, debug, uiManager, app, sessionModeManager, networkedSession } = {}) {
  this.sessionModeManager = sessionModeManager;  // Will convert in Phase 5
  this.networkedSession = networkedSession;      // Will convert in Phase 4
}

// Uses injected dependencies (not window.XXX)
getScannedTokensKey() {
  const mode = this.sessionModeManager?.mode || 'standalone';  // Uses injected!
}
```

**Why This Matters:**
- ✅ **Zero refactoring** needed when dependencies convert to ES6
- ✅ **Cleaner tests** - Dependencies mocked via constructor
- ✅ **Better architecture** - Dependency injection throughout

**Singleton Creation Pattern (browser context):**
```javascript
const instance = new YourModule({
  dependency1: typeof window !== 'undefined' ? window.Dependency1 : null,
  dependency2: typeof window !== 'undefined' ? window.Dependency2 : null,
  // ... etc
});

export default instance;
export { YourModule };
```

### Dual Mode Architecture ⚠️ MUST UNDERSTAND

**SessionModeManager** (in `js/app/sessionModeManager.js`):
- Locks mode on selection (cannot change until page reload)
- Storage key: `gameSessionMode` (values: 'networked' | 'standalone')

**Networked Mode:**
- WebSocket-driven via NetworkedSession
- Backend is authoritative for scoring
- Uses `networked_scannedTokens` storage key
- Clears standalone data on mode entry
- Admin panel available (Session/Video/System control)

**Standalone Mode:**
- Fully offline, no backend dependency
- StandaloneDataManager performs local scoring
- Uses `standalone_scannedTokens` storage key
- localStorage persistence for sessions
- GitHub Pages deployable

**Critical:** DataManager respects mode separation via `getScannedTokensKey()` method (using injected `sessionModeManager`).

### Backend Integration

**Ports:**
- Backend orchestrator: 3000 (HTTPS), 8000 (HTTP redirect)
- Scanner dev server: 8443 (HTTPS, Vite)
- VLC: 8080 (HTTP, internal only)
- Discovery: 8888 (UDP)

**Backend serves scanner via symlink:**
- `backend/public/gm-scanner` → `../../ALNScanner`
- Production URL: `https://[IP]:3000/gm-scanner/`

**Build scripts:**
- `npm run build` - Standalone deployment (base path: `/`)
- `npm run build:backend` - Backend deployment (base path: `/gm-scanner/`)

---

## Testing Strategy

### Anti-Patterns to AVOID ❌
1. Testing that mocks were called (test outcomes, not interactions)
2. Mocking internal modules we're testing
3. Skipping TDD red-green-refactor

### Best Practices ✅ (Applied Throughout Phase 3)
1. **RED Phase:** Write tests first, watch them fail
2. **GREEN Phase:** Implement to make tests pass
3. **REFACTOR Phase:** Clean up (if needed)
4. Test REAL behavior (promises resolve/reject, state updates, event emissions)
5. Only mock external dependencies (APIs, DOM, Web APIs, socket.io)
6. Comprehensive edge case coverage

### Validation Checkpoints
Run after each module conversion:
```bash
npm test -- <module>.test.js    # Individual module
npm test                         # Full suite (should maintain 374 passing)
```

---

## Git Commit Strategy

### Commit Message Format
```
<type>(<scope>): <subject>

- Bullet point details
- Test count and status
- Key changes
- Architecture notes (if applicable)
```

**Types:** `refactor`, `feat`, `build`, `docs`, `test`
**Scopes:** `utils`, `core`, `ui`, `network`, `app`

### Recent Commits (Phase 3)
```
be924be refactor(ui): convert UIManager to ES6 class with dependency injection
  - Pure rendering layer (does NOT extend EventTarget)
  - Dependency injection: settings, dataManager, sessionModeManager, app
  - 56 tests passing
  - Total: 374 tests

f85ef0d refactor(core): convert StandaloneDataManager to ES6 with event-driven architecture
  - Event-driven: Extends EventTarget (emits 5 events)
  - Dependency injection: tokenManager, debug
  - 32 tests passing
  - Total: 318 tests

f124beb refactor(ui): convert Settings to ES6 with event-driven architecture
  - Event-driven: Extends EventTarget (emits 3 events)
  - Zero coupling to UIManager
  - 30 tests passing
  - Total: 286 tests

2bf955c refactor(core): convert DataManager batch 3 - network & mode-specific
  - Backend score synchronization
  - Network/offline fallback
  - Enhanced transaction grouping
  - 66 tests total (33 + 14 + 19)
  - Total: 256 tests

bf72586 refactor(core): convert DataManager batch 2 - scoring & group completion
  - Black Market scoring with bonuses
  - Group completion logic
  - 47 tests total (33 + 14)

ffb3c11 refactor(core): convert DataManager batch 1 - core structure to ES6
  - Future-proof dependency injection
  - Mode-specific storage keys
  - 33 tests passing

a192d04 refactor(core): convert TokenManager to ES6 with comprehensive tests
  - ES6 class with singleton
  - Dependency injection for DataManager helpers
  - 20 tests passing
```

---

## File Structure

```
ALNScanner-es6-migration/
├── src/                          # ES6 modules
│   ├── main.js                   # Entry point (placeholder for Phase 6)
│   ├── utils/                    # ✅ COMPLETE (50 tests)
│   │   ├── config.js
│   │   ├── debug.js
│   │   ├── nfcHandler.js
│   │   └── adminModule.js
│   ├── core/                     # ✅ COMPLETE (118 tests)
│   │   ├── tokenManager.js       # ✅ DONE (20 tests)
│   │   ├── dataManager.js        # ✅ DONE (66 tests)
│   │   └── standaloneDataManager.js  # ✅ DONE (32 tests)
│   ├── ui/                       # ✅ COMPLETE (86 tests)
│   │   ├── uiManager.js          # ✅ DONE (56 tests)
│   │   └── settings.js           # ✅ DONE (30 tests)
│   ├── network/                  # ⏳ NEXT: Phase 4
│   │   ├── orchestratorClient.js      # ⏳ TODO
│   │   ├── connectionManager.js       # ⏳ TODO
│   │   ├── networkedSession.js        # ⏳ TODO
│   │   └── networkedQueueManager.js   # ⏳ TODO
│   └── app/                      # ⏳ TODO: Phase 5
│       ├── adminController.js
│       ├── sessionModeManager.js
│       ├── initializationSteps.js
│       └── app.js
├── js/                           # Old modules (KEEP for reference until Phase 9)
├── tests/
│   ├── unit/
│   │   ├── utils/                # ✅ COMPLETE (50 tests)
│   │   ├── core/                 # ✅ COMPLETE (118 tests)
│   │   ├── ui/                   # ✅ COMPLETE (86 tests)
│   │   └── network/              # ⏳ NEXT: Phase 4
│   ├── integration/              # Existing tests (passing)
│   └── e2e/                      # Playwright specs (existing)
├── vite.config.js
├── jest.config.js
├── playwright.config.js
├── package.json
└── DEPLOYMENT.md
```

---

## Remaining Work (Phases 4-9)

### Phase 4: Network Layer ⏳ NEXT
- [ ] OrchestratorClient (~200 lines, WebSocket wrapper)
- [ ] ConnectionManager (~250 lines, connection lifecycle)
- [ ] NetworkedSession (~300 lines, service factory)
- [ ] NetworkedQueueManager (~150 lines, offline queue)

**Estimated:** ~900 lines, ~40-50 tests

### Phase 5: App Layer
- [ ] AdminController (~150 lines, admin lifecycle)
- [ ] SessionModeManager (~100 lines, mode locking)
- [ ] InitializationSteps (~200 lines, 11-phase startup)
- [ ] App.js (~600 lines, main coordinator)

**Estimated:** ~1050 lines, ~50-60 tests

### Phase 6: Entry Point & Integration
- [ ] Create proper main.js (wire all imports)
- [ ] Update index.html (single script tag with type="module")
- [ ] Remove old `<script>` tags
- [ ] Wire event listeners (App.js)

### Phase 7: E2E Tests
- [ ] Add Playwright tests for ES6 build
- [ ] Test both networked and standalone modes
- [ ] Validate NFC simulation

### Phase 8: Production Build
- [ ] Build and validate dist/
- [ ] Test with backend orchestrator
- [ ] Verify symlink deployment

### Phase 9: Cleanup
- [ ] Remove deprecated js/ directory
- [ ] Update CLAUDE.md
- [ ] Update README.md
- [ ] Final validation

---

## Test Count Progress

| Phase | Module | Tests | Status |
|-------|--------|-------|--------|
| **Phase 2** | config.js | 5 | ✅ |
| | debug.js | 7 | ✅ |
| | nfcHandler.js | 10 | ✅ |
| | adminModule.js | 28 | ✅ |
| **Phase 2 Total** | | **50** | ✅ |
| **Phase 3** | tokenManager.js | 20 | ✅ |
| | dataManager.js | 66 | ✅ |
| | standaloneDataManager.js | 32 | ✅ |
| | settings.js | 30 | ✅ |
| | uiManager.js | 56 | ✅ |
| **Phase 3 Total** | | **204** | ✅ |
| **Integration** | service-wiring | 14 | ✅ |
| **Legacy Tests** | Existing | 106 | ✅ |
| **GRAND TOTAL** | | **374** | ✅ |

---

## Key Files to Reference

### Planning Documents
- `docs/plans/2025-11-11-es6-module-migration.md` - Migration plan (ORIGINAL)
- `docs/plans/SESSION_HANDOFF.md` - **THIS FILE** (current state)
- `docs/plans/ARCHITECTURE_REFACTORING_2025-11.md` - Original refactor plan
- `CLAUDE.md` - Project overview (worktree version)
- `../ALNScanner/CLAUDE.md` - Original scanner CLAUDE.md

### Backend Integration
- `../backend/contracts/openapi.yaml` - HTTP endpoints
- `../backend/contracts/asyncapi.yaml` - WebSocket events
- `../backend/.env` - Backend config (HTTPS, ports)

### Test Files (Reference for Patterns)
- `tests/unit/ui/uiManager.test.js` - Pure rendering layer example (56 tests)
- `tests/unit/core/standaloneDataManager.test.js` - Event-driven example (32 tests)
- `tests/unit/ui/settings.test.js` - Event-driven example (30 tests)
- `tests/unit/core/dataManager.test.js` - **BEST EXAMPLE** (66 tests, dependency injection)
- `tests/unit/utils/adminModule.test.js` - Multi-class example (28 tests, 5 classes)

### Code Files (Reference for Patterns)
- `src/ui/uiManager.js` - Pure rendering layer (does NOT extend EventTarget)
- `src/core/standaloneDataManager.js` - Event-driven (extends EventTarget, emits 5 events)
- `src/ui/settings.js` - Event-driven (extends EventTarget, emits 3 events)
- `src/core/dataManager.js` - **BEST EXAMPLE** for dependency injection
- `src/utils/adminModule.js` - Multi-class ES6 module

---

## Environment Setup (If Fresh Checkout)

```bash
# Navigate to worktree
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner-es6-migration

# Install dependencies
npm install

# Verify setup
npm test                 # Should show 374 passing
npm run dev             # Should start Vite on port 8443
git log --oneline -20   # Should see Phase 3 commits

# Check test breakdown
npm test -- --verbose   # See all test suites
```

---

## Session Handoff Checklist

When picking up this work:

1. **Verify Environment**
   ```bash
   cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner-es6-migration
   git status
   npm test  # Should show 374/374 passing
   ```

2. **Review Recent Commits**
   ```bash
   git log --oneline -20
   # Should see Phase 3 commits: be924be, f85ef0d, f124beb, 2bf955c, bf72586, ffb3c11, a192d04
   ```

3. **Understand Current State**
   - ✅ Phase 3 COMPLETE (all Core & UI modules converted)
   - ✅ Event-driven architecture established
   - ✅ Dependency injection pattern consistent
   - ⏳ Ready for Phase 4: Network Layer

4. **Review Architecture Patterns**
   - Read event-driven architecture section above
   - Review `src/core/standaloneDataManager.js` for EventTarget pattern
   - Review `src/ui/uiManager.js` for pure rendering layer pattern
   - Review `src/core/dataManager.js` for dependency injection pattern

5. **Resume Work - Phase 4: Network Layer**
   - **Start with:** OrchestratorClient (simplest, no dependencies)
   - Then: ConnectionManager (depends on OrchestratorClient)
   - Then: NetworkedQueueManager (depends on OrchestratorClient)
   - Finally: NetworkedSession (depends on all above)

6. **Maintain Architecture Standards**
   - ✅ Use event-driven pattern where appropriate (ConnectionManager, NetworkedSession extend EventTarget)
   - ✅ Inject ALL dependencies (even if not yet ES6)
   - ✅ Test real behavior, not mock interactions
   - ✅ TDD approach (write tests first)
   - ✅ Run full suite after each module (maintain 374+ passing)

---

## Next Steps (Recommended Approach for Phase 4)

### Step 1: OrchestratorClient
**File:** `js/network/OrchestratorClient.js` → `src/network/orchestratorClient.js`

**Why First:** No dependencies, simplest conversion

**Key Changes:**
- Remove `global` fallback (browser-only)
- Convert to ES6 class
- **Does NOT extend EventTarget** (uses internal EventTarget for socket.io event forwarding)
- Export singleton

**Testing Focus:**
- Mock socket.io
- Test event forwarding
- Connection lifecycle
- Error handling

### Step 2: ConnectionManager
**File:** `js/network/ConnectionManager.js` → `src/network/connectionManager.js`

**Dependencies:** OrchestratorClient (ES6 after Step 1 ✅)

**Key Changes:**
- **Extends EventTarget** (emits connection lifecycle events)
- Inject orchestratorClient dependency
- Export singleton

**Events to Emit:**
- `connected`
- `disconnected`
- `auth:required`
- `error`

**Testing Focus:**
- State machine transitions
- Event emissions
- Reconnect logic
- Auth flow

### Step 3: NetworkedQueueManager
**File:** `js/network/NetworkedQueueManager.js` → `src/network/networkedQueueManager.js`

**Dependencies:** OrchestratorClient (ES6 after Step 1 ✅)

**Key Changes:**
- ES6 class (does NOT extend EventTarget)
- Inject orchestratorClient dependency
- Export singleton

**Testing Focus:**
- Queue persistence
- Auto-sync on reconnect
- Failure handling

### Step 4: NetworkedSession
**File:** `js/network/NetworkedSession.js` → `src/network/networkedSession.js`

**Dependencies:** ConnectionManager ✅, AdminController ⚠️ (not yet ES6), NetworkedQueueManager ✅

**Key Changes:**
- **Extends EventTarget** (service factory pattern)
- Inject connectionManager, adminController, queueManager
- Export singleton

**Events to Emit:**
- `session:ready`
- `session:error`

**Testing Focus:**
- Initialization sequence (11 steps)
- Event coordination
- Cleanup on disconnect

---

## Lessons Learned (Phase 3)

1. **Event-Driven Architecture is Key**
   - Modules that change state → extend EventTarget, emit events
   - Modules that render → pure rendering, NO events emitted
   - Listeners wired in App.js/main.js (coming in Phase 6)

2. **Dependency Injection Pays Off**
   - Inject everything upfront (even if not yet ES6)
   - Zero refactoring when dependencies convert later
   - Cleaner tests (mock via constructor)

3. **TDD Works**
   - RED → GREEN → REFACTOR caught edge cases early
   - All 204 Phase 3 tests validate actual outcomes
   - No testing anti-patterns (not testing mock interactions)

4. **Batch Large Modules**
   - DataManager (827 lines) → 3 batches worked well
   - UIManager (791 lines) → single batch worked (cohesive rendering logic)
   - StandaloneDataManager (412 lines) → single batch worked

5. **Test Real Behavior**
   - Event emissions (not mock calls)
   - State updates (not spy verification)
   - DOM changes (not render tracking)
   - Promise resolution (not mock returns)

---

**End of Handoff Document**
**Current Status:** Phase 3 COMPLETE ✅
**Next Action:** Phase 4 - Start with OrchestratorClient conversion
**Current Test Count:** 374/374 passing ✅
**Total ES6 Modules:** 9/~25 (36% complete)
