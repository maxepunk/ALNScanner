# ES6 Migration - Session Handoff Document

**Branch:** `feature/es6-module-migration`
**Worktree:** `/home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner-es6-migration`
**Last Updated:** 2025-11-11
**Session Status:** Phase 3 in progress (Core modules)
**Test Status:** 190/190 passing ✅

---

## Quick Resume Commands

```bash
# Navigate to worktree
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner-es6-migration

# Verify branch and status
git branch --show-current  # Should be: feature/es6-module-migration
git status
git log --oneline -10

# Run tests
npm test                    # All tests (190 passing)
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

#### Phase 2: Utility Modules (4 commits)
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

#### Phase 3: TokenManager (1 commit, 20 tests)
**File:** `src/core/tokenManager.js`

- ES6 class with singleton
- Dependency injection for DataManager helpers (until DataManager converted)
- Fuzzy token matching (case-insensitive, with/without colons)
- Group inventory building
- Demo data fallback
- All tests passing ✅

**Important:** TokenManager has fallback group parsing until DataManager is converted, then will use injected helpers via `setDataManagerHelpers()`.

---

## 🔄 IN PROGRESS

### Phase 3: Core Modules (Remaining)

**Next Files to Convert:**

1. **DataManager** (`js/core/dataManager.js` - 833 lines) ⚠️ COMPLEX
   - Used in BOTH networked and standalone modes
   - Dual storage keys: `networked_scannedTokens` vs `standalone_scannedTokens`
   - Networked mode: Caches backend scores, backend authoritative
   - Standalone mode: Local scoring calculations
   - Dependencies: TokenManager, Settings, Debug, UIManager, App
   - Has `parseGroupInfo()` and `normalizeGroupName()` that TokenManager needs

2. **StandaloneDataManager** (`js/core/standaloneDataManager.js` - 286 lines)
   - Standalone mode ONLY
   - Local session management
   - Team score calculations
   - Group completion bonus logic
   - localStorage persistence

3. **UIManager** (`js/ui/uiManager.js`) - Screen navigation, stats rendering

4. **Settings** (`js/ui/settings.js`) - localStorage config persistence

---

## Critical Architecture Notes

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

**Critical:** DataManager must respect mode separation via `getScannedTokensKey()` method.

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

### Best Practices ✅
1. Test REAL behavior (promises resolve/reject, state updates)
2. Only mock external dependencies (APIs, DOM, Web APIs)
3. Watch tests fail first when adding new features
4. Validate at checkpoints (run full suite frequently)

### Validation Checkpoints
Run after each module conversion:
```bash
npm test -- <module>.test.js    # Individual module
npm test                         # Full suite (should stay at 190+ passing)
```

---

## Git Commit Strategy

### Commit Message Format
```
<type>(<scope>): <subject>

- Bullet point details
- Test count and status
- Key changes
```

**Types:** `refactor`, `feat`, `build`, `docs`, `test`
**Scopes:** `utils`, `core`, `ui`, `network`, `app`

### Example Commits from This Session
```
build: add Vite build infrastructure
build: configure Vite for backend orchestrator compatibility
refactor(utils): convert config.js to ES6 module with tests
refactor(utils): convert debug.js to ES6 module with tests
refactor(utils): convert nfcHandler.js to ES6 module with tests
refactor(utils): convert adminModule.js to ES6 with comprehensive tests
refactor(core): convert TokenManager to ES6 with comprehensive tests
```

---

## File Structure

```
ALNScanner-es6-migration/
├── src/                          # ES6 modules (NEW)
│   ├── main.js                   # Entry point (placeholder)
│   ├── utils/                    # ✅ COMPLETE
│   │   ├── config.js
│   │   ├── debug.js
│   │   ├── nfcHandler.js
│   │   └── adminModule.js
│   ├── core/                     # 🔄 IN PROGRESS
│   │   ├── tokenManager.js       # ✅ DONE
│   │   ├── dataManager.js        # ⏳ NEXT
│   │   └── standaloneDataManager.js
│   ├── ui/                       # ⏳ TODO
│   ├── network/                  # ⏳ TODO
│   └── app/                      # ⏳ TODO
├── js/                           # Old modules (KEEP for reference)
├── tests/
│   ├── unit/
│   │   ├── utils/                # ✅ COMPLETE (50 tests)
│   │   └── core/                 # 🔄 IN PROGRESS (20 tests)
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

### Phase 3: Core & UI Modules (70% remaining)
- [ ] DataManager (833 lines, dual mode aware)
- [ ] StandaloneDataManager (286 lines, standalone only)
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

### Issue 1: DataManager Circular Dependencies
**Problem:** DataManager needs TokenManager, TokenManager needs DataManager helpers
**Solution:** Dependency injection via `setDataManagerHelpers()` (already implemented in TokenManager)

### Issue 2: Mode-Specific Storage Keys
**Problem:** Must not leak data between networked/standalone modes
**Solution:** DataManager has `getScannedTokensKey()` method - use it consistently

### Issue 3: Global Window Dependencies
**Problem:** Old code uses `window.App`, `window.UIManager`, etc.
**Solution:** Pass as constructor parameters (dependency injection)

### Issue 4: Test Environment
**Problem:** jsdom doesn't have TextEncoder, NDEFReader, etc.
**Solution:** Already added polyfills in `tests/helpers/test-setup.js`

---

## Key Files to Reference

### Planning Documents
- `docs/plans/2025-11-11-es6-module-migration.md` - Migration plan
- `docs/plans/ARCHITECTURE_REFACTORING_2025-11.md` - Original refactor plan
- `CLAUDE.md` - Project overview (worktree version)
- `../ALNScanner/CLAUDE.md` - Original scanner CLAUDE.md

### Backend Integration
- `../backend/contracts/openapi.yaml` - HTTP endpoints
- `../backend/contracts/asyncapi.yaml` - WebSocket events
- `../backend/.env` - Backend config (HTTPS, ports)

### Test Files (Reference for Patterns)
- `tests/unit/utils/adminModule.test.js` - Best example (28 tests, 5 classes)
- `tests/unit/core/tokenManager.test.js` - Dependency injection example

---

## Environment Setup (If Fresh Checkout)

```bash
# Navigate to worktree
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner-es6-migration

# Install dependencies
npm install

# Verify setup
npm test                 # Should show 190 passing
npm run dev             # Should start Vite on port 8443
git log --oneline -10   # Should show recent commits
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
   npm test  # Should show 190 passing
   ```

2. **Review Recent Commits**
   ```bash
   git log --oneline -10
   ```

3. **Understand Current State**
   - Read this document (SESSION_HANDOFF.md)
   - Review latest test output
   - Check todo list state

4. **Resume Work**
   - Next file: `js/core/dataManager.js` → `src/core/dataManager.js`
   - Convert to ES6 class
   - Add comprehensive tests
   - Validate dual mode behavior

5. **Maintain Testing Standards**
   - Test real behavior, not mock interactions
   - Only mock external dependencies
   - Run full suite after each module

---

## Questions for Next Session

1. Should we batch remaining Phase 3 modules for review?
2. Any concerns about DataManager complexity (833 lines)?
3. Want to validate approach before converting more core modules?

---

**End of Handoff Document**
**Next Action:** Convert DataManager with dual mode awareness
