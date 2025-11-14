# Comprehensive Merge Preparation Plan - ES6 Migration (3-PR Stack)

**Created**: 2025-11-12
**Scope**: ALNScanner PR #4, PR #5 + ALN-Ecosystem PR #5
**Estimated Time**: 11-14 hours over 2-3 days
**Approach**: Conservative - Full testing, CI/CD, comprehensive documentation

---

## Executive Summary

This plan addresses ALL issues identified in the code review before executing the coordinated 3-PR merge:
- **Scanner PR #5**: ES6 migration plan documentation (merge first)
- **Scanner PR #4**: Implementation + 5 critical bug fixes (merge second)
- **Parent PR #5**: E2E test alignment (merge last)

### Critical Blockers Being Fixed

1. ❌ Missing Babel configuration (unit tests fail)
2. ❌ Missing `@vitejs/plugin-basic-ssl` in package.json
3. ❌ NetworkedSession.test.js wrong constructor expectation
4. ❌ 12 hardcoded passwords in E2E tests (need env var)
5. ❌ No CI/CD automation

### Enhancements Being Added

- ✅ Regression tests (L2 + L3) to prevent constructor bug recurrence
- ✅ GitHub Actions workflows for both repos
- ✅ Local verification scripts
- ✅ Comprehensive documentation updates
- ✅ Deprecated docs archived

---

## Phase 1: Pre-Flight Checks & Setup (30 min)

### Task 1.1: Create Safety Checkpoints

**Purpose**: Enable easy rollback if issues arise

```bash
# Scanner repo
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner
git checkout pr-4-review
git tag pre-merge-prep-$(date +%Y%m%d-%H%M)
git push origin --tags

# Parent repo
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem
git checkout feature/e2e-es6-scanner-alignment
git tag pre-merge-prep-$(date +%Y%m%d-%H%M)
git push origin --tags
```

### Task 1.2: Document Current State Baseline

```bash
# Scanner repo - run tests (expect failure)
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/ALNScanner
npm test 2>&1 | tee /tmp/scanner-baseline-tests.log
# Expected: 19 failed test suites (Babel config missing)

# Parent repo - run E2E (should pass)
cd /home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/backend
npm run test:e2e -- tests/e2e/flows/07b-gm-scanner-networked-blackmarket.test.js 2>&1 | tee /tmp/e2e-baseline-tests.log
# Expected: 12/12 passing
```

### Task 1.3: Create Rollback Documentation

**File**: `docs/plans/MERGE_ROLLBACK.md`

```markdown
# Emergency Rollback Procedure

## If merge fails:

1. Reset scanner repo: `git reset --hard pre-merge-prep-YYYYMMDD-HHMM`
2. Reset parent repo: `git reset --hard pre-merge-prep-YYYYMMDD-HHMM`
3. Force push if needed: `git push origin BRANCH --force-with-lease`

## Rollback tags:
- Scanner: `pre-merge-prep-YYYYMMDD-HHMM`
- Parent: `pre-merge-prep-YYYYMMDD-HHMM`

## Nuclear option (after merge):
```bash
# Revert merge commits on main
git revert --mainline 1 <merge-commit-sha>
git push origin main
```
```

---

## Phase 2: Fix Critical Blockers (3-4 hours)

### Task 2.1: Fix Babel Configuration (Scanner) - 30 min

**File**: `.babelrc` (CREATE NEW)

```json
{
  "presets": [
    ["@babel/preset-env", {
      "targets": {
        "node": "current"
      }
    }]
  ],
  "env": {
    "test": {
      "plugins": []
    }
  }
}
```

**Verification**:
```bash
npm test -- tests/unit/network/networkedQueueManager.test.js
# Should pass instead of Babel error
```

### Task 2.2: Add Missing Vite Plugin (Scanner) - 10 min

```bash
npm install --save-dev @vitejs/plugin-basic-ssl
```

**Verification**:
```bash
npm run build
ls -la dist/
# Should create dist/ successfully
```

### Task 2.3: Fix NetworkedSession Unit Test (Scanner) - 20 min

**File**: `tests/unit/network/networkedSession.test.js:103`

**Current (WRONG)**:
```javascript
expect(NetworkedQueueManager).toHaveBeenCalledWith(mockClient);
```

**Fixed**:
```javascript
expect(NetworkedQueueManager).toHaveBeenCalledWith({
  client: mockClient,
  deviceId: 'GM_TEST',
  debug: console
});
```

**Verification**:
```bash
npm test -- tests/unit/network/networkedSession.test.js
# Should pass
```

### Task 2.4: Run Full Scanner Test Suite - 30 min

```bash
npm test
# Expected: 598 tests passing
```

### Task 2.5: Externalize Admin Password (Parent) - 45 min

**File**: `backend/tests/e2e/helpers/test-config.js` (CREATE NEW)

```javascript
/**
 * E2E Test Configuration
 * Centralizes test constants and environment-specific values
 */

module.exports = {
  // Admin authentication
  ADMIN_PASSWORD: process.env.TEST_ADMIN_PASSWORD || '@LN-c0nn3ct',

  // Orchestrator connection
  ORCHESTRATOR_URL: process.env.ORCHESTRATOR_URL || 'https://localhost:3000',

  // Test timeouts
  DEFAULT_TIMEOUT: 10000,
  EXTENDED_TIMEOUT: 30000,
};
```

**Files to Update**:
1. `backend/tests/e2e/helpers/scanner-init.js` - Add import, use `ADMIN_PASSWORD`
2. `backend/tests/e2e/flows/07b-gm-scanner-networked-blackmarket.test.js` - Replace 12 hardcoded passwords
3. `backend/.env.example` - Update line 93 comment

**Verification**:
```bash
cd backend
npm run test:e2e -- tests/e2e/flows/07b-gm-scanner-networked-blackmarket.test.js
# Should pass 12/12 tests
```

### Task 2.6: Commit Blocker Fixes

**Scanner**:
```bash
git add .babelrc package.json package-lock.json tests/unit/network/networkedSession.test.js
git commit -m "fix: add Babel config, Vite plugin, and correct NetworkedSession test

- Add .babelrc for Jest ES6 module support
- Add @vitejs/plugin-basic-ssl to package.json
- Fix NetworkedSession.test.js constructor expectation (config object vs single arg)
- All 598 unit tests now passing

Resolves critical blockers for PR #4 merge"
```

**Parent**:
```bash
git add backend/.env.example backend/tests/e2e/helpers/test-config.js backend/tests/e2e/helpers/scanner-init.js backend/tests/e2e/flows/
git commit -m "fix: externalize admin password in E2E tests

- Create test-config.js helper with centralized constants
- Replace 12 hardcoded '@LN-c0nn3ct' instances with ADMIN_PASSWORD env var
- Update .env.example with admin password documentation
- All 12/12 E2E tests still passing

Enables environment-specific test configuration"
```

---

## Phase 3: Add Regression Tests (2-3 hours)

### Task 3.1: L2 Regression Test - NetworkedSession Constructor (Scanner) - 45 min

**File**: `tests/unit/network/networkedSession.test.js`

**Add after line 150**:

```javascript
describe('NetworkedQueueManager constructor regression', () => {
  it('should pass config object (not bare client) to NetworkedQueueManager', async () => {
    await session.initialize();

    // CRITICAL: This is the bug from PR #4
    expect(NetworkedQueueManager).toHaveBeenCalledWith({
      client: mockClient,
      deviceId: 'GM_TEST',
      debug: console
    });

    expect(NetworkedQueueManager).not.toHaveBeenCalledWith(mockClient);
  });

  it('should result in queueManager with valid client reference', async () => {
    await session.initialize();

    expect(session.services.queueManager).toBeDefined();
    const hasClient = mockQueueManager.client !== undefined;
    expect(hasClient).toBe(true);
  });
});
```

**Validation**: Temporarily break code, verify test catches it, restore.

### Task 3.2: L2 Regression Test - NetworkedQueueManager Client Usage (Scanner) - 45 min

**File**: `tests/unit/network/networkedQueueManager.test.js`

**Add after line 110**:

```javascript
describe('Constructor - Client Dependency Injection (Regression)', () => {
  it('should have valid client reference from config object', () => {
    expect(queueManager.client).toBe(mockClient);
    expect(queueManager.client).toBeDefined();
  });

  it('should be able to check client.isConnected', () => {
    mockClient.isConnected = true;
    const canCheckConnection = queueManager.client && typeof queueManager.client.isConnected !== 'undefined';
    expect(canCheckConnection).toBe(true);
  });

  it('should route to temp queue when client.isConnected is false', () => {
    mockClient.isConnected = false;
    const transaction = { tokenId: 'test', teamId: '001' };
    queueManager.queueTransaction(transaction);

    expect(queueManager.tempQueue).toContainEqual(transaction);
    expect(mockClient.send).not.toHaveBeenCalled();
  });

  it('should send immediately when client.isConnected is true', () => {
    mockClient.isConnected = true;
    const transaction = { tokenId: 'test', teamId: '001' };
    queueManager.queueTransaction(transaction);

    expect(mockClient.send).toHaveBeenCalled();
    expect(queueManager.tempQueue).not.toContainEqual(transaction);
  });
});
```

### Task 3.3: L3 Regression Test - End-to-End Transaction Flow (Parent) - 1.5 hours

**File**: `backend/tests/e2e/flows/08-queue-manager-integration.test.js` (CREATE NEW)

See full test code in Phase 3, Task 3.3 of the brainstorming session.

### Task 3.4: Commit Regression Tests

**Scanner**:
```bash
git add tests/unit/network/networkedSession.test.js tests/unit/network/networkedQueueManager.test.js
git commit -m "test: add regression tests for NetworkedQueueManager constructor bug

- Add explicit constructor signature validation
- Add client dependency injection tests
- Prevents recurrence of PR #4 bug

Part of comprehensive merge preparation"
```

**Parent**:
```bash
git add backend/tests/e2e/flows/08-queue-manager-integration.test.js
git commit -m "test: add E2E regression test for NetworkedQueueManager integration

- Validates transactions reach backend via WebSocket
- Tests NetworkedQueueManager.client wiring end-to-end

Part of comprehensive merge preparation"
```

---

## Phase 4: CI/CD & Automation (3-4 hours)

### Task 4.1: GitHub Actions - Scanner Unit Tests (Scanner) - 1 hour

**File**: `.github/workflows/test.yml` (CREATE NEW)

See full workflow YAML in Phase 4, Task 4.1 of the brainstorming session.

**Jobs**:
- `unit-tests`: Run Jest with coverage
- `build-verification`: Build with Vite
- `integration-check`: Verify build artifacts

### Task 4.2: GitHub Actions - E2E Tests (Parent) - 1.5 hours

**File**: `.github/workflows/e2e-tests.yml` (CREATE NEW)

**Jobs**:
- `build-scanner`: Build GM Scanner from submodule
- `e2e-gm-scanner`: Run E2E tests with built scanner
- `e2e-summary`: Aggregate results

### Task 4.3: Local Verification Scripts - 30 min

**File**: `verify-merge-ready.sh` (CREATE in both repos)

Scanner script checks:
- Dependencies installed
- Critical files present
- Vite plugin installed
- Unit tests passing
- Build succeeds
- Bundle size reasonable

Parent script checks:
- Scanner dist exists
- Symlink configured
- Backend dependencies installed
- Test config exists
- E2E tests passing
- Regression test passing

### Task 4.4: Commit CI/CD Infrastructure

```bash
# Scanner
git add .github/workflows/test.yml verify-merge-ready.sh
git commit -m "ci: add GitHub Actions workflow and local verification script"

# Parent
git add .github/workflows/e2e-tests.yml verify-merge-ready.sh
git commit -m "ci: add E2E test workflow with scanner build and verification script"
```

---

## Phase 5: Documentation & Final Verification (2-3 hours)

### Task 5.1: Update CLAUDE.md (Scanner) - 45 min

**Sections to Add/Update**:
1. Testing Architecture (L2 vs L3 split)
2. Development Commands (updated scripts)
3. Troubleshooting (build issues, test issues, runtime issues)

### Task 5.2: Update README.md (Scanner) - 30 min

**Sections to Update**:
- Quick Start (npm scripts)
- Testing (L2 test commands)
- Production Build (Vite process)
- Backend Connection (integration steps)

### Task 5.3: Archive Deprecated Documentation (Scanner) - 20 min

**Archive to** `docs/archive/pre-es6-migration/`:
- UI_*.md (single-file HTML docs)
- ADMIN_*.md (window global docs)

**Create** `docs/archive/pre-es6-migration/README.md` explaining archive.

### Task 5.4: Update Parent Repo Documentation (Parent) - 30 min

**Files**:
- `backend/README.md` - Add E2E testing section
- `backend/tests/e2e/README.md` (NEW) - Comprehensive E2E guide

### Task 5.5: Final Manual Verification (Both) - 45 min

**Scanner**:
- Clean install
- Run verification script
- Manual smoke test
- Verify documentation accuracy

**Parent**:
- Build scanner
- Run verification script
- Manual E2E check

**Create** `docs/plans/FINAL_VERIFICATION_CHECKLIST.md` in both repos.

---

## Merge Execution Plan

### Day 1: Execute Phases 1-3 (Scanner Fixes)

**Morning** (4 hours):
- Phase 1: Safety checkpoints
- Phase 2: Fix all blockers
- Verify: All tests passing

**Afternoon** (3 hours):
- Phase 3: Add regression tests
- Verify: New tests pass and detect regressions

### Day 2: Execute Phases 4-5 (CI/CD & Docs)

**Morning** (4 hours):
- Phase 4: Create CI/CD workflows
- Verify: GitHub Actions passing

**Afternoon** (3 hours):
- Phase 5: Update documentation
- Final verification: Run all checks

### Day 3: Merge Execution

**Steps**:
1. ✅ Merge Scanner PR #5 (docs)
2. ✅ Merge Scanner PR #4 (implementation)
3. ✅ Update parent submodule reference
4. ✅ Merge Parent PR #5 (E2E alignment)
5. ✅ Post-merge verification

---

## Success Criteria

**Scanner Repo**:
- ✅ PR #5 merged to main
- ✅ PR #4 merged to main
- ✅ `npm test` passes (598 tests)
- ✅ `npm run build` succeeds
- ✅ GitHub Actions passing

**Parent Repo**:
- ✅ PR #5 merged to main
- ✅ Submodule updated
- ✅ `npm run test:e2e` passes (13 tests)
- ✅ GitHub Actions passing

**Integration**:
- ✅ Backend serves ES6 scanner
- ✅ Networked mode works end-to-end
- ✅ No console errors
- ✅ All docs accurate

---

## Rollback Procedures

**Before Merge**:
```bash
git reset --hard pre-merge-prep-YYYYMMDD-HHMM
git push origin BRANCH --force-with-lease
```

**After Merge**:
```bash
git revert --mainline 1 <merge-commit-sha>
git push origin main
```

---

## Appendix: File Locations

### Scanner Repo (PR #4)
- `.babelrc` - NEW
- `package.json` - UPDATE
- `tests/unit/network/networkedSession.test.js` - UPDATE
- `tests/unit/network/networkedQueueManager.test.js` - UPDATE
- `.github/workflows/test.yml` - NEW
- `verify-merge-ready.sh` - NEW
- `CLAUDE.md` - UPDATE
- `README.md` - UPDATE
- `docs/archive/pre-es6-migration/` - NEW
- `docs/plans/FINAL_VERIFICATION_CHECKLIST.md` - NEW

### Parent Repo (PR #5)
- `backend/tests/e2e/helpers/test-config.js` - NEW
- `backend/tests/e2e/helpers/scanner-init.js` - UPDATE
- `backend/tests/e2e/flows/07b-*.test.js` - UPDATE
- `backend/tests/e2e/flows/08-queue-manager-integration.test.js` - NEW
- `backend/.env.example` - UPDATE
- `.github/workflows/e2e-tests.yml` - NEW
- `verify-merge-ready.sh` - NEW
- `backend/README.md` - UPDATE
- `backend/tests/e2e/README.md` - NEW
- `docs/plans/FINAL_VERIFICATION_CHECKLIST.md` - NEW

---

**Plan Version**: 1.0
**Last Updated**: 2025-11-12
**Status**: Ready for execution
