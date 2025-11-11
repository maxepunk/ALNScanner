# ALNScanner Architecture Refactoring Plan (November 2025)

**Status**: In Progress
**Author**: Claude Code
**Date**: 2025-11-10
**Branch**: `claude/refactor-alnscan-architecture-011CUzzu4PQCK9kLKicH4kfT`
**Approach**: Test-Driven Development (TDD) + Clean Break Refactor

---

## Executive Summary

This document outlines a comprehensive architectural refactoring of the ALNScanner networked mode to eliminate tight coupling, duplicate service creation, and listener leaks. The refactor applies **Single Responsibility Principle** throughout, introduces **event-driven coordination**, and implements **Test-Driven Development** methodology.

### Key Objectives

1. **Eliminate Tight Coupling**: Services communicate via events, not direct method calls
2. **Single Responsibility**: Each component has ONE clear job
3. **Dependency Injection**: No `window.XXX` global reaching
4. **Centralized Service Creation**: NetworkedSession orchestrates all service lifecycle
5. **Clean Lifecycle Management**: Proper initialization and destruction order
6. **Contract Compliance**: Maintain full AsyncAPI contract compatibility
7. **Test Coverage**: >70% branches, >80% functions/lines

### Scope

- **In Scope**: Complete rewrite of networked mode architecture
- **Out of Scope**: Standalone mode, NFC scanning logic, UI components
- **Breaking Changes**: None (AsyncAPI contract maintained)
- **Deprecated Code**: Removed as we work (clean break refactor)

---

## Current Architecture Problems

### Problem 1: Tight Coupling & Global State

```javascript
// BEFORE: orchestratorClient.js reaches into global window
if (window.connectionManager) {
  window.connectionManager.connectionLost();
}

// App.js reaches into orchestratorClient internals
OrchestratorClient.validateToken();
OrchestratorClient.scheduleRetry();
```

**Issues**:
- Circular dependencies
- Hard to test (must mock entire global state)
- Initialization order fragile
- No clear service lifecycle

### Problem 2: Mixed Responsibilities

```javascript
// BEFORE: OrchestratorClient does EVERYTHING
class OrchestratorClient {
  validateToken() { /* Token validation */ }
  scheduleRetry() { /* Retry logic */ }
  connect() { /* WebSocket connection */ }
  handleMessage() { /* Message routing */ }
  updateConnectionState() { /* UI updates */ }
}
```

**Issues**:
- Single class has 5+ responsibilities
- Can't test WebSocket separately from token validation
- Can't reuse WebSocket logic without retry logic

### Problem 3: Duplicate Service Creation

```javascript
// BEFORE: Services created in multiple places
// In orchestratorClient.js:
window.queueManager = new NetworkedQueueManager();

// In app.js:
window.queueManager = new NetworkedQueueManager(); // Duplicate!

// In admin modules:
const queueManager = new NetworkedQueueManager(); // Triplicate!
```

**Issues**:
- Memory leaks (multiple instances)
- State synchronization bugs
- Event listener accumulation

### Problem 4: Listener Leaks

```javascript
// BEFORE: Listeners added on every reconnection
socket.on('sync:full', handleSync); // Never removed
socket.on('transaction:result', handleResult); // Accumulates!
```

**Issues**:
- Memory usage grows with each reconnection
- Multiple handlers fire for same event
- Browser eventually slows down

---

## New Architecture Design

### Component Hierarchy

```
App (UI Layer)
 │
 └─> NetworkedSession (Service Orchestrator)
      │
      ├─> ConnectionManager (Connection Lifecycle)
      │    └─> OrchestratorClient (WebSocket Pipe)
      │
      ├─> NetworkedQueueManager (Offline Queue)
      │
      └─> AdminController (Admin Module Lifecycle)
           ├─> SessionManager
           ├─> VideoController
           ├─> SystemMonitor
           ├─> AdminOperations
           └─> MonitoringDisplay
```

### Responsibility Matrix

| Component | Responsibilities | Does NOT Handle |
|-----------|------------------|-----------------|
| **NetworkedSession** | - Service factory<br>- Lifecycle orchestration<br>- Event wiring<br>- Session state | - WebSocket details<br>- Token validation<br>- Retry logic<br>- Admin UI |
| **ConnectionManager** | - Token validation<br>- Health checks<br>- Retry logic w/ exponential backoff<br>- Reconnection handling | - WebSocket connection<br>- Message sending<br>- Admin operations |
| **OrchestratorClient** | - Socket.io connect/disconnect<br>- Message send/receive<br>- Event forwarding<br>- Connection state | - Token validation<br>- Retry logic<br>- Business logic<br>- UI updates |
| **AdminController** | - Admin module creation<br>- Initialization guard<br>- Pause/resume coordination<br>- Module cleanup | - Connection handling<br>- WebSocket messages<br>- Token management |
| **NetworkedQueueManager** | - Offline transaction queue<br>- Queue persistence<br>- Sync on reconnect<br>- Duplicate prevention | - Connection state<br>- Token validation<br>- WebSocket sending |

### Event-Driven Coordination

All inter-service communication via **CustomEvent** (no direct method calls):

#### OrchestratorClient Events
- `socket:connected` - Socket established
- `socket:disconnected` - Socket closed
- `socket:error` - Connection error
- `message:received` - Orchestrator message (all types forwarded)

#### ConnectionManager Events
- `connecting` - Connection attempt started
- `connected` - Connection established successfully
- `disconnected` - Connection lost
- `auth:required` - Token expired or max retries reached

#### NetworkedSession Events
- `session:ready` - All services initialized and connected
- `session:error` - Initialization or critical error
- `auth:required` - User needs to re-authenticate

#### AdminController Events
- `initialized` - Admin modules ready

### Dependency Flow

```
1. App creates NetworkedSession with config
   ↓
2. NetworkedSession.initialize() creates services:
   - ConnectionManager (with token validation)
   - OrchestratorClient (dumb WebSocket pipe)
   - NetworkedQueueManager (offline queue)
   - AdminController (admin module factory)
   ↓
3. NetworkedSession wires events:
   - ConnectionManager.on('connected') → AdminController.initialize()
   - ConnectionManager.on('connected') → QueueManager.syncQueue()
   - ConnectionManager.on('disconnected') → AdminController.pause()
   - ConnectionManager.on('auth:required') → Session.emit('auth:required')
   ↓
4. NetworkedSession calls ConnectionManager.connect()
   ↓
5. ConnectionManager validates token, checks health
   ↓
6. ConnectionManager calls OrchestratorClient.connect(token, auth)
   ↓
7. OrchestratorClient creates socket, emits socket:connected
   ↓
8. ConnectionManager receives socket:connected, emits connected
   ↓
9. NetworkedSession handlers trigger:
   - AdminController.initialize()
   - QueueManager.syncQueue()
   ↓
10. NetworkedSession emits session:ready
    ↓
11. App receives session:ready, updates UI
```

### Clean Lifecycle Management

#### Initialization Order
1. ConnectionManager (token validation, health checks)
2. OrchestratorClient (WebSocket wrapper)
3. NetworkedQueueManager (offline queue)
4. AdminController (admin modules)
5. Wire all event handlers
6. Initiate connection

#### Destruction Order (Reverse)
1. AdminController.destroy() (stop admin operations)
2. NetworkedQueueManager.destroy() (stop queue processing)
3. ConnectionManager.disconnect() (close connection gracefully)
4. OrchestratorClient.destroy() (cleanup socket)
5. Remove all event listeners
6. Null all service references

---

## Testing Strategy

### 4-Layer Testing Pyramid

```
┌─────────────────────────────────────────────────────────┐
│ Layer 4: Manual E2E (Android Device)                   │
│ - Real NFC scanning workflow                            │
│ - Network failure scenarios                             │
│ - Human validation                                       │
│ Time: ~2 hours                                           │
└─────────────────────────────────────────────────────────┘
                          ↑
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Backend Contract Tests (Parent Repo)          │
│ - Validate AsyncAPI WebSocket message contracts         │
│ - Real backend + mock scanner client                    │
│ Time: ~30 seconds                                        │
└─────────────────────────────────────────────────────────┘
                          ↑
┌─────────────────────────────────────────────────────────┐
│ Layer 2: Frontend Integration Tests (ALNScanner)       │
│ - Test service wiring and lifecycle                     │
│ - Mock WebSocket, validate coordination                 │
│ Time: ~5 seconds per suite                              │
└─────────────────────────────────────────────────────────┘
                          ↑
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Frontend Unit Tests (ALNScanner)              │
│ - Test each component in isolation                      │
│ - Mock dependencies, validate events                    │
│ Time: <1 second per test                                │
└─────────────────────────────────────────────────────────┘
```

### Test Infrastructure (Jest)

**Location**: `ALNScanner/tests/`

```
tests/
├── unit/
│   ├── NetworkedSession.test.js
│   ├── ConnectionManager.test.js
│   ├── OrchestratorClient.test.js
│   └── AdminController.test.js
├── integration/
│   ├── service-wiring.test.js
│   └── lifecycle.test.js
└── helpers/
    ├── test-setup.js
    ├── mock-socket.js
    └── test-utils.js
```

**Jest Config** (`ALNScanner/jest.config.js`):
```javascript
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['./tests/helpers/test-setup.js'],
  collectCoverageFrom: ['js/**/*.js'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80
    }
  }
};
```

### Unit Test Philosophy

**TDD Approach**: Write tests FIRST, then implement

1. Write failing test for expected behavior
2. Implement minimal code to pass test
3. Refactor implementation (tests still pass)
4. Repeat for next behavior

**Example Test Structure**:
```javascript
describe('OrchestratorClient - Dumb Pipe', () => {
  let client;
  let mockSocket;

  beforeEach(() => {
    mockSocket = createMockSocket();
    global.io = jest.fn(() => mockSocket);
    client = new OrchestratorClient({ url, deviceId });
  });

  describe('connect', () => {
    it('should create socket with provided token and auth', async () => {
      await client.connect(token, auth);

      expect(global.io).toHaveBeenCalledWith(url, {
        auth: { token, deviceId, deviceType, version }
      });
    });

    it('should emit socket:connected on success', async () => {
      const handler = jest.fn();
      client.addEventListener('socket:connected', handler);

      await client.connect(token, auth);

      expect(handler).toHaveBeenCalled();
    });
  });
});
```

### Integration Test Philosophy

**Service Wiring**: Use real implementations, mock only external dependencies

```javascript
describe('Service Wiring Integration', () => {
  let session;

  beforeEach(() => {
    // Mock only external APIs
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    global.io = jest.fn(() => createMockSocket());

    // Use REAL implementations
    session = new NetworkedSession(config);
  });

  it('should wire connected event to admin initialization', async () => {
    await session.initialize();

    const adminController = session.getService('adminController');
    expect(adminController.initialized).toBe(true);
  });
});
```

### Contract Test Philosophy

**AsyncAPI Validation**: Backend tests ensure message format compliance

- Tests located in `backend/tests/contract/asyncapi.test.js`
- Validates all WebSocket events match `backend/contracts/asyncapi.yaml`
- Scanner changes must NOT break these tests

### Manual E2E Test Scenarios

1. **Normal Connection Flow**
   - Open scanner on Android
   - Connect to orchestrator
   - Verify team entry shown
   - Verify admin accessible

2. **Token Expiry Handling**
   - Connect successfully
   - Wait for token expiry
   - Verify auth wizard shown
   - Verify clear error message

3. **Network Failure Recovery**
   - Connect successfully
   - Scan tokens
   - Disconnect network
   - Scan offline
   - Reconnect network
   - Verify queue syncs

4. **Admin Module Access**
   - Connect successfully
   - Switch to admin view
   - Create session
   - Control video playback
   - Verify all operations work

5. **Multiple Reconnections**
   - Connect/disconnect 5 times
   - Verify no listener leaks
   - Verify no duplicate services
   - Check browser console

6. **Offline Queue Sync**
   - Start offline
   - Scan multiple tokens
   - Connect to orchestrator
   - Verify all queued transactions sent
   - Verify no duplicates

7. **Error Handling**
   - Invalid token
   - Unreachable orchestrator
   - Network timeout
   - Verify graceful degradation

8. **Performance**
   - Connect under load
   - Rapid token scanning
   - Verify responsiveness
   - No memory leaks

---

## Implementation Phases

### Timeline: 2-3 Days (~17 hours)

| Phase | Duration | Tasks |
|-------|----------|-------|
| 1. Foundation & Test Infrastructure | 2 hours | Setup Jest, create skeletons, write failing tests |
| 2. OrchestratorClient Implementation | 2 hours | Implement dumb WebSocket pipe (TDD) |
| 3. ConnectionManager Implementation | 2 hours | Implement connection lifecycle (TDD) |
| 4. AdminController & NetworkedSession | 3 hours | Implement orchestration layer (TDD) |
| 5. Integration Testing | 1 hour | Write and run integration tests |
| 6. App Integration & Cutover | 2 hours | Update App.js, remove deprecated code |
| 7. Backend Contract Validation | 1 hour | Run contract tests, fix violations |
| 8. Manual E2E Testing | 2 hours | Execute all 8 test scenarios |
| 9. Documentation & Cleanup | 1 hour | Update CLAUDE.md, README, final cleanup |
| 10. Commit & Push | 1 hour | Squash commits, create PR |

---

## Phase Details

### Phase 1: Foundation & Test Infrastructure

**Goal**: Setup Jest testing and create component skeletons with failing tests

**Actions**:
1. Install Jest and dependencies:
   ```bash
   cd ALNScanner
   npm init -y
   npm install --save-dev jest @types/jest jsdom socket.io-client@4
   ```

2. Create test directory structure
3. Configure Jest (`jest.config.js`)
4. Create test helpers (`test-setup.js`)
5. Create component skeletons:
   - `js/network/NetworkedSession.js` (throws "Not implemented")
   - `js/network/ConnectionManager.js` (refactored)
   - `js/network/OrchestratorClient.js` (refactored)
   - `js/app/AdminController.js` (new)

6. Write comprehensive failing tests for each component

**Success Criteria**:
- ✅ `npm test` runs successfully (tests FAIL as expected)
- ✅ Test structure validates API design
- ✅ All component skeletons created
- ✅ Commit: `test: add failing tests for refactored architecture`

**Deprecated Code Removed**:
- None yet (skeletons don't replace anything)

---

### Phase 2: OrchestratorClient Implementation

**Goal**: Implement OrchestratorClient as a dumb WebSocket pipe (TDD)

**Test-First Steps**:
1. Define minimal interface in tests:
   - `connect(token, auth)` - Create socket, return promise
   - `send(eventType, data)` - Wrap in envelope, emit
   - `disconnect()` - Cleanup socket
   - Event forwarding: `message:received` for all orchestrator events

2. Verify tests FAIL (not implemented)

3. Implement to make tests PASS:
   ```javascript
   class OrchestratorClient extends EventTarget {
     async connect(token, auth) { /* Create socket */ }
     send(eventType, data) { /* Wrap and emit */ }
     async disconnect() { /* Cleanup */ }
     _setupMessageHandlers() { /* Forward all events */ }
   }
   ```

4. Refactor implementation (tests still pass)

**Success Criteria**:
- ✅ `npm test -- OrchestratorClient.test.js` passes
- ✅ No token validation code
- ✅ No reconnection logic
- ✅ All message types forwarded
- ✅ Commit: `refactor: implement OrchestratorClient as dumb WebSocket pipe`

**Deprecated Code Removed**:
- Token validation methods from old OrchestratorClient
- Retry logic from old OrchestratorClient
- Direct admin module creation from socket handlers
- (Keep old file temporarily for reference, mark deprecated)

---

### Phase 3: ConnectionManager Implementation

**Goal**: Implement ConnectionManager for connection lifecycle only (TDD)

**Test-First Steps**:
1. Define responsibility boundary in tests:
   - Token validation with 1-minute buffer
   - Health check before connection
   - Exponential backoff retry
   - Reconnection handling
   - `auth:required` emission on expiry/max-retries

2. Verify tests FAIL

3. Implement to make tests PASS:
   ```javascript
   class ConnectionManager extends EventTarget {
     isTokenValid() { /* JWT expiry check */ }
     async checkHealth() { /* Fetch /health */ }
     async connect() { /* Validate, health check, delegate */ }
     _scheduleRetry() { /* Exponential backoff */ }
     _handleDisconnect() { /* Reconnect or emit auth:required */ }
   }
   ```

**Success Criteria**:
- ✅ `npm test -- ConnectionManager.test.js` passes
- ✅ Token validation with buffer implemented
- ✅ Retry with exponential backoff works
- ✅ Reconnection handler cleanup on disconnect
- ✅ Commit: `refactor: implement ConnectionManager for connection lifecycle only`

**Deprecated Code Removed**:
- Old connection retry logic from orchestratorClient.js
- Direct window.connectionManager assignments
- Inline health checks scattered across code

---

### Phase 4: AdminController & NetworkedSession Implementation

**Goal**: Implement service orchestration layer (TDD)

**4.1 AdminController**

Test-First Steps:
1. Define admin module lifecycle in tests:
   - Single initialization guard
   - Module factory pattern
   - Pause/resume coordination
   - Clean destruction

2. Implement to pass tests:
   ```javascript
   class AdminController extends EventTarget {
     initialize() { /* Create all admin modules once */ }
     getModule(name) { /* Return specific module */ }
     pause() { /* Pause operations on disconnect */ }
     destroy() { /* Cleanup all modules */ }
   }
   ```

**4.2 NetworkedSession**

Test-First Steps:
1. Define service orchestration in tests:
   - Service creation order
   - Event wiring between services
   - Lifecycle coordination
   - Error propagation

2. Implement to pass tests:
   ```javascript
   class NetworkedSession extends EventTarget {
     async initialize() {
       this._createServices();
       this._wireEventHandlers();
       await this._initiateConnection();
     }

     _wireEventHandlers() {
       this.connectionManager.on('connected', () => {
         this.adminController.initialize();
         this.queueManager.syncQueue();
       });
     }
   }
   ```

**Success Criteria**:
- ✅ `npm test -- AdminController.test.js` passes
- ✅ `npm test -- NetworkedSession.test.js` passes
- ✅ Service creation order validated
- ✅ Event wiring tested
- ✅ Commit: `feat: implement AdminController and NetworkedSession orchestrator`

**Deprecated Code Removed**:
- Scattered admin module creation from multiple files
- Direct service instantiation in app.js
- `window.XXX` service assignments

---

### Phase 5: Integration Testing

**Goal**: Validate service wiring with real implementations

**Actions**:
1. Write integration tests using real components (mock only external APIs)
2. Test full initialization flow
3. Test error propagation
4. Test cleanup on destroy

**Success Criteria**:
- ✅ `npm test` passes (all unit + integration tests)
- ✅ Coverage > 70% branches, > 80% functions/lines
- ✅ Test execution time < 30 seconds
- ✅ Commit: `test: add integration tests for service wiring`

**Deprecated Code Removed**:
- None (test-only phase)

---

### Phase 6: App Integration & Cutover

**Goal**: Update App.js to use NetworkedSession, remove ALL deprecated code

**Actions**:
1. Refactor `App._initNetworkedMode()`:
   ```javascript
   async _initNetworkedMode() {
     this.networkedSession = new NetworkedSession(config);

     this.networkedSession.on('session:ready', ({ detail }) => {
       this.viewController.initializeNetworkedView(detail.services.adminController);
       UIManager.showScreen('teamEntry');
     });

     this.networkedSession.on('auth:required', () => {
       showConnectionWizard();
     });

     await this.networkedSession.initialize();
   }
   ```

2. Update `viewController` to use AdminController

3. **CRITICAL: Remove ALL deprecated code**:
   - Old OrchestratorClient initialization paths
   - Direct service creation in multiple files
   - All `window.XXX` service assignments (NO backward compat cruft)
   - Old connection retry logic
   - Duplicate admin module creation

**Success Criteria**:
- ✅ App uses NetworkedSession for all initialization
- ✅ Event-driven coordination throughout
- ✅ NO `window.XXX` reaching (except during transition cleanup)
- ✅ Clean git diff showing deletions
- ✅ Commit: `refactor: update App to use NetworkedSession and remove deprecated code`

**Deprecated Code Removed** (FULL CLEANUP):
- OLD: `js/network/orchestratorClient.js` (old version)
- OLD: Direct service instantiation in `js/app/app.js`
- OLD: `window.connectionManager`, `window.queueManager`, `window.orchestratorClient` assignments
- OLD: Inline admin module creation in socket handlers
- OLD: Connection retry logic scattered across files
- OLD: Duplicate health check implementations

---

### Phase 7: Backend Contract Validation

**Goal**: Ensure AsyncAPI contract compliance

**Actions**:
1. Run backend contract tests:
   ```bash
   cd ../backend
   npm run test:contract
   ```

2. If tests fail:
   - Identify violated contract
   - Fix in scanner code
   - Re-run scanner unit tests
   - Re-run backend contract tests
   - Repeat until all pass

3. Run backend integration tests:
   ```bash
   npm run test:integration
   ```

**Success Criteria**:
- ✅ All backend contract tests pass
- ✅ All backend integration tests pass
- ✅ Message formats unchanged
- ✅ Envelope structure preserved
- ✅ Commit: `fix: ensure AsyncAPI contract compliance` (if fixes needed)

**Deprecated Code Removed**:
- None (validation phase)

---

### Phase 8: Manual E2E Testing

**Goal**: Validate real-world functionality on Android device

**Setup**:
```bash
# Backend
cd backend
npm run dev:full

# Scanner (HTTPS for NFC)
cd ALNScanner
python3 -m http.server 8000 --bind 0.0.0.0
# Or: npx http-server -S -C cert.pem -K key.pem
```

**Test Scenarios** (see "Manual E2E Test Scenarios" section above):
1. ✅ Normal Connection Flow
2. ✅ Token Expiry Handling
3. ✅ Network Failure Recovery
4. ✅ Admin Module Access
5. ✅ Multiple Reconnections
6. ✅ Offline Queue Sync
7. ✅ Error Handling
8. ✅ Performance

**Success Criteria**:
- ✅ All 8 scenarios pass
- ✅ No console errors
- ✅ No memory leaks
- ✅ Performance acceptable
- ✅ Document results in commit message

**Deprecated Code Removed**:
- None (testing phase)

---

### Phase 9: Documentation & Cleanup

**Goal**: Update all documentation to reflect new architecture

**Actions**:

1. Update `ALNScanner/CLAUDE.md`:
   - Add "Refactored Architecture (November 2025)" section
   - Document service lifecycle management
   - Document dependency flow
   - Document event-driven coordination
   - Add testing instructions

2. Update `ALNScanner/README.md`:
   - Add testing section
   - Update development instructions
   - Document new architecture

3. Final code review checklist:
   - [ ] No `window.XXX` reaching (all removed)
   - [ ] All services created via NetworkedSession
   - [ ] Event-driven coordination throughout
   - [ ] No duplicate service instances
   - [ ] No listener leaks
   - [ ] Test coverage > 70%
   - [ ] All contract tests pass
   - [ ] Manual E2E tests pass

**Success Criteria**:
- ✅ CLAUDE.md updated with architecture diagrams
- ✅ README.md updated with testing instructions
- ✅ All checklist items pass
- ✅ Commit: `docs: update documentation with refactored architecture`

**Deprecated Code Removed**:
- Old architecture descriptions from docs
- Outdated initialization instructions

---

### Phase 10: Commit & Push

**Goal**: Clean git history and create pull request

**Actions**:

1. Squash commits into clean history:
   ```bash
   git rebase -i HEAD~20
   ```

   Final commit structure:
   1. `test: add test infrastructure and failing tests for refactored architecture`
   2. `refactor: implement OrchestratorClient as dumb WebSocket pipe`
   3. `refactor: implement ConnectionManager for connection lifecycle only`
   4. `feat: implement AdminController for admin module lifecycle`
   5. `feat: implement NetworkedSession service orchestrator`
   6. `test: add integration tests for service wiring`
   7. `refactor: update App to use NetworkedSession and remove deprecated code`
   8. `fix: ensure AsyncAPI contract compliance` (if needed)
   9. `docs: update documentation with refactored architecture`

2. Push to branch:
   ```bash
   git push -u origin claude/refactor-alnscan-architecture-011CUzzu4PQCK9kLKicH4kfT
   ```

3. Create pull request with comprehensive description (see template below)

**Success Criteria**:
- ✅ Clean commit history
- ✅ Branch pushed
- ✅ PR created with full description

---

## Pull Request Template

```markdown
# [ALNScanner] Refactor architecture for single responsibility and event-driven coordination

## Overview
Comprehensive architectural refactoring to eliminate tight coupling, duplicate service creation, and listener leaks.

## Changes

### New Components
- **NetworkedSession**: Service factory and lifecycle orchestrator
- **AdminController**: Admin module lifecycle management

### Refactored Components
- **OrchestratorClient**: Now a dumb WebSocket pipe (no business logic)
- **ConnectionManager**: Connection lifecycle only (no WebSocket code)

### Key Improvements
1. ✅ Single Responsibility Principle throughout
2. ✅ Event-driven coordination (no direct method calls)
3. ✅ Dependency injection (no window.XXX reaching)
4. ✅ Centralized service creation (no duplicates)
5. ✅ Clean lifecycle management (no listener leaks)
6. ✅ Comprehensive test suite (>80% coverage)

## Testing

### Unit Tests
- All components tested in isolation
- Mock dependencies, validate events
- Coverage: XX%

### Integration Tests
- Service wiring validated
- Lifecycle flows tested
- Real components, mocked externals

### Backend Contract Tests
- All AsyncAPI contract tests pass ✅
- Message formats unchanged ✅
- Envelope structure preserved ✅

### Manual E2E Tests
- Normal connection flow ✅
- Token expiry handling ✅
- Network failure recovery ✅
- Offline queue sync ✅
- Admin module access ✅
- Multiple reconnections ✅

## Breaking Changes
None - maintains AsyncAPI contract compliance

## Migration Notes
None - clean break refactor, no backward compatibility needed
```

---

## Success Metrics

### Code Quality
- ✅ Test coverage > 70% branches, > 80% functions/lines
- ✅ No ESLint warnings
- ✅ All contract tests pass
- ✅ All integration tests pass

### Architecture Quality
- ✅ Single Responsibility Principle enforced
- ✅ Dependency Inversion (event-driven)
- ✅ Event-Driven Coordination
- ✅ No global state reaching
- ✅ No duplicate service creation
- ✅ No listener leaks

### Functional Quality
- ✅ All 8 manual E2E scenarios pass
- ✅ No regressions from current behavior
- ✅ Performance maintained or improved
- ✅ Error handling improved

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Backend contract tests fail | Medium | High | Phase 7 explicitly validates contracts; fix before proceeding |
| Event wiring bugs | Low | Medium | Comprehensive integration tests in Phase 5 |
| Memory leaks in new code | Low | Medium | Manual reconnection testing in Phase 8 |
| Performance regression | Low | Low | Monitor during E2E testing, profile if needed |
| Incomplete deprecated code removal | Medium | Low | Explicit checklist in Phase 6, code review in Phase 9 |

---

## Rollback Plan

If critical issues discovered after merge:

1. **Before deployment to production**: Revert PR immediately
2. **After deployment**:
   - Create hotfix branch from last stable commit
   - Cherry-pick critical fixes only
   - Comprehensive testing before re-deploy

**Point of No Return**: Phase 6 (App Integration & Cutover)
- Before Phase 6: Can abandon refactor, minimal work lost
- After Phase 6: Must complete or revert entire branch

---

## Appendix: Token Validation Algorithm

ConnectionManager validates JWT tokens with 1-minute safety buffer:

```javascript
isTokenValid() {
  if (!this.token) return false;

  try {
    // Parse JWT (format: header.payload.signature)
    const parts = this.token.split('.');
    if (parts.length !== 3) return false;

    const payload = JSON.parse(atob(parts[1]));
    const expiry = payload.exp; // Unix timestamp (seconds)

    if (!expiry) return false;

    // Check with 1-minute buffer
    const now = Math.floor(Date.now() / 1000);
    const buffer = 60; // 1 minute

    return (expiry - buffer) > now;
  } catch (error) {
    return false;
  }
}
```

---

## Appendix: Exponential Backoff Algorithm

ConnectionManager implements exponential backoff for retries:

```javascript
_scheduleRetry() {
  if (this.retryCount >= this.maxRetries) {
    this.dispatchEvent(new CustomEvent('auth:required', {
      detail: { reason: 'max_retries' }
    }));
    return;
  }

  const baseDelay = 1000; // 1 second
  const maxDelay = 30000; // 30 seconds
  const delay = Math.min(
    baseDelay * Math.pow(2, this.retryCount),
    maxDelay
  );

  this.retryTimer = setTimeout(() => {
    this.retryCount++;
    this.connect().catch(() => {
      // Retry will be scheduled again
    });
  }, delay);
}
```

Retry delays: 1s, 2s, 4s, 8s, 16s, 30s (capped)

---

## Appendix: Service Destruction Order

NetworkedSession destroys services in **reverse initialization order**:

```javascript
async destroy() {
  if (!this.services) return;

  // Reverse order (LIFO)
  if (this.services.adminController) {
    this.services.adminController.destroy();
  }

  if (this.services.queueManager) {
    this.services.queueManager.destroy();
  }

  if (this.services.connectionManager) {
    await this.services.connectionManager.disconnect();
  }

  if (this.services.client) {
    this.services.client.destroy();
  }

  // Remove all event listeners
  // ...

  this.services = null;
  this.state = 'disconnected';
}
```

---

## Document Maintenance

**Last Updated**: 2025-11-10
**Status**: In Progress
**Next Review**: After Phase 10 completion

**Change Log**:
- 2025-11-10: Initial document creation (Phase 0)
