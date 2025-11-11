# ES6 Migration - Session Handoff Document

**Branch:** `feature/es6-module-migration`
**Worktree:** `/home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner-es6-migration`
**Last Updated:** 2025-11-11
**Session Status:** Phase 3 - DataManager COMPLETE ✅
**Test Status:** 256/256 passing ✅

---

## Quick Resume Commands

```bash
# Navigate to worktree
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner-es6-migration

# Verify branch and status
git branch --show-current  # Should be: feature/es6-module-migration
git status
git log --oneline -15

# Run tests
npm test                    # All tests (256 passing)
npm run dev                 # Vite dev server (port 8443)

# Check what's committed
git log --oneline --graph -20
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

#### Phase 2: Utility Modules (4 commits, 50 tests)
All modules in `src/utils/` converted to ES6:

1. **config.js** (5 tests)
   - Pure ES6 exports
   - No dependencies

2. **debug.js** (7 tests)
   - ES6 class with singleton
   - Imports CONFIG from config.js
   - Temporary app parameter for viewController access

3. **nfcHandler.js** (10 tests)
   - ES6 class with singleton
   - Imports Debug
   - Web NFC API wrapper

4. **adminModule.js** (28 tests - 5 classes)
   - SessionManager: WebSocket session commands
   - VideoController: Video playback control
   - SystemMonitor: Health checks (backend/VLC)
   - AdminOperations: System commands
   - MonitoringDisplay: DOM updates (event-driven)

**Testing Best Practices Applied:**
- ✅ Test REAL behavior (promise resolution, state updates, DOM changes)
- ✅ Only mock external dependencies (socket.io, fetch, Web APIs)
- ❌ NO testing anti-patterns (not testing mock interactions)

#### Phase 3: Core Modules (3 commits, 86 tests total)

##### 1. TokenManager (20 tests)
**Commit:** `refactor(core): convert TokenManager to ES6 with comprehensive tests`
**File:** `src/core/tokenManager.js`

- ES6 class with singleton
- Dependency injection for DataManager helpers (resolved when DataManager converted)
- Fuzzy token matching (case-insensitive, with/without colons)
- Group inventory building
- Demo data fallback
- All tests passing ✅

##### 2. DataManager (66 tests) ✅ **COMPLETE**
**Commits:**
- `ffb3c11` - Batch 1: Core structure
- `bf72586` - Batch 2: Scoring & group completion
- `2bf955c` - Batch 3: Network & mode-specific behavior

**File:** `src/core/dataManager.js` (827 lines)

**Batch 1 - Core Structure (33 tests):**
- Constructor with dependency injection (**CRITICAL:** see architecture notes below)
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

**Network Behavior:**
- Backend scores authoritative when connected
- Local calculation fallback when offline
- Proper DOM triggers (scoreboard, team details refresh)

---

## 🔄 IN PROGRESS

### Phase 3: Core Modules (Remaining)

**Next Files to Convert:**

1. **StandaloneDataManager** (`js/core/standaloneDataManager.js` - 286 lines) ⏳ NEXT
   - Standalone mode ONLY
   - Local session management
   - Team score calculations
   - Group completion bonus logic
   - localStorage persistence
   - **Dependencies:** DataManager (now available ✅), Settings, Debug

2. **UIManager** (`js/ui/uiManager.js`) - Screen navigation, stats rendering
   - Dependencies: DataManager ✅, TokenManager ✅, Settings

3. **Settings** (`js/ui/settings.js`) - localStorage config persistence
   - Minimal dependencies (Debug)

---

## Critical Architecture Decisions 🏗️

### ⚠️ FUTURE-PROOF DEPENDENCY INJECTION

**Problem Identified During DataManager Conversion:**
Original code had direct `window` access that would require refactoring in future phases:
```javascript
// BAD (original): Would need refactoring in Phase 5
const mode = window.sessionModeManager?.mode || 'standalone';
if (window.networkedSession?.state === 'connected') { ... }
```

**Solution Implemented:**
Inject ALL dependencies as constructor parameters, even those not yet converted to ES6:
```javascript
// GOOD (future-proof):
constructor({ tokenManager, settings, debug, uiManager, app, sessionModeManager, networkedSession } = {}) {
  this.sessionModeManager = sessionModeManager;  // Will convert in Phase 5
  this.networkedSession = networkedSession;      // Will convert in Phase 4
}

getScannedTokensKey() {
  const mode = this.sessionModeManager?.mode || 'standalone';  // Uses injected!
}
```

**Why This Matters:**
- ✅ **Zero refactoring** needed when `sessionModeManager` converts to ES6 (Phase 5.2)
- ✅ **Zero refactoring** needed when `networkedSession` converts to ES6 (Phase 4.3)
- ✅ **Cleaner tests** - Dependencies mocked via constructor, not global mutations
- ✅ **Better architecture** - Dependency injection throughout

**Pattern for Remaining Modules:**
When converting any module, inject ALL dependencies even if they're still script-tag modules:
```javascript
// Singleton creation (in browser)
const instance = new YourModule({
  dependency1: typeof window !== 'undefined' ? window.Dependency1 : null,
  dependency2: typeof window !== 'undefined' ? window.Dependency2 : null,
  // ... etc
});
```

### Dual Mode Architecture ⚠️ MUST UNDERSTAND

**SessionModeManager** (in `js/app/sessionModeManager.js`):
- Locks mode on selection (cannot change until page reload)
- Storage key: `gameSessionMode` (values: 'networked' | 'standalone')

**Networked Mode:**
- WebSocket-driven via NetworkedSession
- Backend is authoritative for scoring
- Uses `networked_scannedTokens` storage key
- Clears standalone data on mode entry (line 60-72 of sessionModeManager.js)
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

### Best Practices ✅ (Applied to DataManager)
1. **RED Phase:** Write tests first, watch them fail
2. **GREEN Phase:** Implement to make tests pass
3. **REFACTOR Phase:** Clean up (if needed)
4. Test REAL behavior (promises resolve/reject, state updates)
5. Only mock external dependencies (APIs, DOM, Web APIs)
6. Comprehensive edge case coverage

### Validation Checkpoints
Run after each module conversion:
```bash
npm test -- <module>.test.js    # Individual module
npm test                         # Full suite (should stay at 256 passing)
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

### Recent Commits (DataManager)
```
ffb3c11 refactor(core): convert DataManager batch 1 - core structure to ES6
  - Future-proof dependency injection (sessionModeManager, networkedSession)
  - Mode-specific storage keys
  - 33 tests passing

bf72586 refactor(core): convert DataManager batch 2 - scoring & group completion
  - Black Market scoring with bonuses
  - Group completion logic
  - 47 tests total (33 + 14)

2bf955c refactor(core): convert DataManager batch 3 - network & mode-specific
  - Backend score synchronization
  - Network/offline fallback
  - Enhanced transaction grouping
  - Export functionality
  - 66 tests total (33 + 14 + 19)
```

---

## File Structure

```
ALNScanner-es6-migration/
├── src/                          # ES6 modules
│   ├── main.js                   # Entry point (placeholder)
│   ├── utils/                    # ✅ COMPLETE (50 tests)
│   │   ├── config.js
│   │   ├── debug.js
│   │   ├── nfcHandler.js
│   │   └── adminModule.js
│   ├── core/                     # 🔄 IN PROGRESS (86 tests)
│   │   ├── tokenManager.js       # ✅ DONE (20 tests)
│   │   ├── dataManager.js        # ✅ DONE (66 tests)
│   │   └── standaloneDataManager.js  # ⏳ NEXT
│   ├── ui/                       # ⏳ TODO
│   │   ├── uiManager.js
│   │   └── settings.js
│   ├── network/                  # ⏳ TODO
│   └── app/                      # ⏳ TODO
├── js/                           # Old modules (KEEP for reference)
├── tests/
│   ├── unit/
│   │   ├── utils/                # ✅ COMPLETE (50 tests)
│   │   └── core/                 # 🔄 IN PROGRESS (86 tests)
│   │       ├── tokenManager.test.js    (20 tests)
│   │       └── dataManager.test.js     (66 tests)
│   ├── integration/              # Existing tests (passing)
│   └── e2e/                      # Playwright specs (existing)
├── vite.config.js
├── jest.config.js
├── playwright.config.js
├── package.json
└── DEPLOYMENT.md
```

---

## Remaining Work (Phases 3-9)

### Phase 3: Core & UI Modules (40% remaining)
- [x] TokenManager (20 tests) ✅
- [x] DataManager (66 tests) ✅
- [ ] StandaloneDataManager (286 lines, standalone only) ⏳ **NEXT**
- [ ] UIManager (screen navigation)
- [ ] Settings (localStorage config)

### Phase 4: Network Layer
- [ ] OrchestratorClient (already refactored, just ES6 conversion)
- [ ] ConnectionManager (already refactored, just ES6 conversion)
- [ ] NetworkedSession (service factory)
- [ ] NetworkedQueueManager (offline queue)

### Phase 5: App Layer
- [ ] AdminController (admin lifecycle)
- [ ] SessionModeManager (mode locking)
- [ ] InitializationSteps (11-phase startup)
- [ ] App.js (main coordinator)

### Phase 6: Entry Point
- [ ] Create proper main.js (wire all imports)
- [ ] Update index.html (single script tag with type="module")
- [ ] Remove old `<script>` tags

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

## Potential Issues & Solutions

### Issue 1: DataManager Circular Dependencies ✅ SOLVED
**Problem:** DataManager needs TokenManager, TokenManager needs DataManager helpers
**Solution:** Dependency injection via `setDataManagerHelpers()` (implemented in TokenManager)
**Status:** ✅ Resolved - TokenManager now receives helpers from DataManager

### Issue 2: Mode-Specific Storage Keys ✅ SOLVED
**Problem:** Must not leak data between networked/standalone modes
**Solution:** DataManager has `getScannedTokensKey()` method using injected `sessionModeManager`
**Status:** ✅ Implemented with proper dependency injection

### Issue 3: Global Window Dependencies ✅ SOLVED
**Problem:** Old code uses `window.App`, `window.UIManager`, `window.networkedSession`, etc.
**Solution:** Pass ALL as constructor parameters (dependency injection), even if not yet ES6
**Status:** ✅ Pattern established in DataManager - apply to remaining modules

### Issue 4: Test Environment ✅ SOLVED
**Problem:** jsdom doesn't have TextEncoder, NDEFReader, etc.
**Solution:** Already added polyfills in `tests/helpers/test-setup.js`
**Status:** ✅ Working for all current tests

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
- `tests/unit/core/dataManager.test.js` - **BEST EXAMPLE** (66 tests, 3 batches, TDD)
- `tests/unit/utils/adminModule.test.js` - Multi-class example (28 tests, 5 classes)
- `tests/unit/core/tokenManager.test.js` - Dependency injection example

### Code Files (Reference for Patterns)
- `src/core/dataManager.js` - **BEST EXAMPLE** for dependency injection pattern
- `src/core/tokenManager.js` - Example of helper injection
- `src/utils/adminModule.js` - Multi-class ES6 module

---

## Environment Setup (If Fresh Checkout)

```bash
# Navigate to worktree
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner-es6-migration

# Install dependencies
npm install

# Verify setup
npm test                 # Should show 256 passing
npm run dev             # Should start Vite on port 8443
git log --oneline -15   # Should show DataManager commits
```

---

## Contact Points with Other Systems

### Backend Orchestrator
- **Location:** `../backend/`
- **Start:** `cd ../backend && npm run dev:full`
- **URL:** `https://localhost:3000`
- **Contract Tests:** `npm run test:contract` (in backend repo)

### Player Scanner (Separate PWA)
- **Location:** `../aln-memory-scanner/`
- **Not part of this migration**
- **Shares token data via ALN-TokenData submodule**

### ESP32 Scanner (Hardware)
- **Location:** `../arduino-cyd-player-scanner/`
- **Not part of this migration**
- **Downloads tokens from orchestrator `/api/tokens`**

---

## Session Handoff Checklist

When picking up this work:

1. **Verify Environment**
   ```bash
   cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner-es6-migration
   git status
   npm test  # Should show 256 passing
   ```

2. **Review Recent Commits**
   ```bash
   git log --oneline -15
   # Should see DataManager commits: ffb3c11, bf72586, 2bf955c
   ```

3. **Understand Current State**
   - Read this document (SESSION_HANDOFF.md)
   - Review `tests/unit/core/dataManager.test.js` for testing patterns
   - Review `src/core/dataManager.js` for dependency injection pattern
   - Understand future-proof architecture decisions

4. **Resume Work**
   - **Next file:** `js/core/standaloneDataManager.js` → `src/core/standaloneDataManager.js`
   - Convert to ES6 class
   - Apply dependency injection pattern (inject DataManager, Settings, Debug)
   - Add comprehensive tests (TDD: RED → GREEN → REFACTOR)
   - Validate standalone mode behavior

5. **Maintain Architecture Standards**
   - ✅ Inject ALL dependencies (even if not yet ES6)
   - ✅ Test real behavior, not mock interactions
   - ✅ TDD approach (write tests first)
   - ✅ Run full suite after completion

---

## Next Steps (Recommended Approach)

### StandaloneDataManager Conversion

**File:** `js/core/standaloneDataManager.js` → `src/core/standaloneDataManager.js`

**Dependencies to Inject:**
- `dataManager` (now ES6 ✅)
- `settings` (not yet ES6, inject from window)
- `debug` (ES6 ✅)

**Key Methods:**
- Local session management
- Team score calculations (uses DataManager.calculateTeamScoreWithBonuses)
- Group completion logic
- localStorage persistence

**Testing Approach:**
1. Write tests first (RED)
2. Implement (GREEN)
3. Validate with DataManager integration
4. Ensure mode isolation (standalone only)

**Estimated Size:** ~286 lines, ~15-20 tests

---

## Questions for Continuation

1. **StandaloneDataManager Batching:** Convert in one batch or split into smaller pieces?
2. **UIManager Complexity:** Assess complexity before conversion (may be large)
3. **Settings Timing:** Convert before or after UIManager?

---

## Lessons Learned This Session

1. **Dependency Injection is Key** - Inject everything, even window globals not yet converted
2. **TDD Works** - RED → GREEN → REFACTOR caught edge cases early
3. **Batch Large Modules** - DataManager at 827 lines benefited from 3-batch approach
4. **Test Real Behavior** - Avoided anti-patterns, all 66 tests validate actual outcomes
5. **Future-Proof Now** - Small upfront cost (DI) saves major refactoring later

---

**End of Handoff Document**
**Next Action:** Convert StandaloneDataManager to ES6 with dependency injection pattern
**Current Test Count:** 256/256 passing ✅
**Phase 3 Progress:** TokenManager ✅, DataManager ✅, 3 modules remaining
