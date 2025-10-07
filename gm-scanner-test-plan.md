ALNScanner Test Suite Design - Comprehensive Gap Analysis & Implementation Plan

    Executive Summary

    Current backend test suite (94 tests, 14 suites) tests backend services but has critical gaps in scanner implementation 
    testing. Only 3/14 scanner modules are tested, leaving 11 modules untested including critical network, admin, and app 
    modules.

    Current Test Coverage Analysis

    ✅ What's Tested (3 modules):

    - core/dataManager.js - Unit tests (scoring, groups, transactions)
    - core/standaloneDataManager.js - Unit tests (offline data management)  
    - core/tokenManager.js - Unit tests (token lookup, matching)
    - Integration: Scanner helpers verification (basic connectivity)

    ❌ Critical Gaps (11 modules):

    1. app/app.js - Main application orchestration
    2. app/sessionModeManager.js - Networked vs Standalone mode switching
    3. network/orchestratorClient.js - WebSocket client (AsyncAPI compliance)
    4. network/networkedQueueManager.js - Offline queue management
    5. network/connectionManager.js - Connection state management
    6. utils/adminModule.js - Admin panel commands (FR 4.2)
    7. ui/settings.js - Settings persistence
    8. ui/uiManager.js - UI state management
    9. utils/config.js - Configuration management
    10. utils/debug.js - Debug utilities
    11. utils/nfcHandler.js - NFC scanning simulation

    Test Infrastructure Available (Reuse)

    From backend/tests/:
    - ✅ helpers/browser-mocks.js - Browser API mocking for Node.js
    - ✅ helpers/integration-test-server.js - Full server with WebSocket
    - ✅ helpers/websocket-helpers.js - Real scanner creation helpers
    - ✅ helpers/contract-validator.js - AsyncAPI/OpenAPI validation
    - ✅ helpers/mock-vlc-server.js - VLC server mocking

    Proposed Test Organization

    1. Scanner Unit Tests (backend/tests/unit/scanner/)

    New Files to Create:

    A. sessionModeManager.test.js (Critical - Mode Logic)

    Purpose: Test networked vs standalone mode logic
    Coverage:
    - Mode selection (networked, standalone)
    - Mode persistence (localStorage)
    - Mode restoration on init
    - Mode locking (prevent switching mid-session)
    - Connection validation for networked mode

    Functional Requirements: FR Section 0 (Deployment Modes)

    B. networkedQueueManager.test.js (Critical - Offline Queue)

    Purpose: Test offline transaction queueing
    Coverage:
    - Queue transactions when offline
    - Persist queue to localStorage
    - Sync queue when connection restored
    - Handle queue storage errors (QuotaExceededError)
    - Orphaned transaction merging

    Functional Requirements: FR 2.4, 3.5 (Offline Queue)
    AsyncAPI Contract: transaction:submit event structure

    C. orchestratorClient.test.js (Critical - WebSocket)

    Purpose: Test WebSocket client event handling
    Coverage:
    - Connection establishment with JWT auth
    - Event listener registration (AsyncAPI events)
    - Event emitter functionality
    - Reconnection logic
    - Rate limiting
    - Cleanup on disconnect

    AsyncAPI Contract: All server→client events

    D. settings.test.js

    Purpose: Test settings persistence
    Coverage:
    - Save/load from localStorage
    - deviceId generation
    - stationMode persistence
    - Default values

    E. config.test.js

    Purpose: Test configuration constants
    Coverage:
    - Config object structure
    - Required constants present
    - Valid value ranges

    2. Scanner Integration Tests (backend/tests/integration/scanner/)

    New Directory: backend/tests/integration/scanner/

    A. app-initialization.test.js

    Purpose: Test App module initialization sequence
    Uses: browser-mocks.js, real scanner modules
    Coverage:
    - Full App.init() sequence
    - NFC support detection
    - Token database loading
    - SessionModeManager creation
    - Service worker registration (mocked)
    - URL parameter parsing (mode selection)
    - Admin module initialization (networked mode)

    Functional Requirements: FR 3.1 (GM Scanner Init)

    B. transaction-workflow.test.js

    Purpose: Test complete transaction flow from scan to backend
    Uses: createAuthenticatedScanner(), integration-test-server
    Coverage:
    - NFC scan simulation → App.processNFCRead()
    - Token lookup via TokenManager
    - Duplicate detection (DataManager)
    - Transaction submission via NetworkedQueueManager
    - Server processing (backend)
    - Result broadcast reception (orchestratorClient)
    - Score update display (DataManager)

    AsyncAPI Contract: transaction:submit, transaction:result, score:updated
    Functional Requirements: FR 3.2 (Transaction Processing)

    C. offline-queue-workflow.test.js

    Purpose: Test offline→online transition with queue sync
    Uses: Real scanner, mock connection states
    Coverage:
    - Scan while offline → queue to localStorage
    - Connection restored → auto-sync via NetworkedQueueManager
    - Server processes queued transactions
    - Receive offline:queue:processed event
    - Display sync results to user

    AsyncAPI Contract: offline:queue:processed
    Functional Requirements: FR 3.5 (Offline Queue)

    D. admin-panel-integration.test.js

    Purpose: Test admin panel WebSocket commands
    Uses: createAuthenticatedScanner(), AdminModule
    Coverage:
    - Session control (create, pause, resume, end)
    - Video control (play, pause, stop, skip)
    - Score adjustment
    - System reset
    - Command acknowledgment (gm:command:ack)
    - Broadcast observation (other GMs see changes)

    AsyncAPI Contract: gm:command, gm:command:ack, session:update
    Functional Requirements: FR 4.2 (Admin Panel)

    E. mode-switching.test.js

    Purpose: Test NetworkedMode ↔ StandaloneMode transitions
    Uses: SessionModeManager, real scanner
    Coverage:
    - Start in networked mode → authenticate → connect
    - Lose connection → fallback to provisional local scoring
    - Restore connection → sync queued transactions
    - Explicitly switch to standalone mode → disconnect, clear queue
    - Explicitly switch to networked mode → connect, sync

    Functional Requirements: FR Section 0 (Deployment Modes)

    3. Scanner Contract Tests (backend/tests/contract/scanner/)

    New Directory: backend/tests/contract/scanner/

    A. event-structure.test.js

    Purpose: Validate ALL scanner events match AsyncAPI schema
    Uses: contract-validator.js, real scanner
    Coverage:
    - Scanner emits events with wrapped envelope {event, data, timestamp}
    - transaction:submit schema validation
    - gm:command schema validation
    - Event field requirements (tokenId, teamId, deviceId, mode)

    AsyncAPI Contract: Lines 90-101 (client→server events)

    B. event-handling.test.js

    Purpose: Validate scanner handles ALL server events correctly
    Uses: Mock server events, real scanner
    Coverage:
    - sync:full → update session, scores, devices
    - transaction:result → display to user (check status)
    - score:updated → update local score cache
    - video:status → update admin panel
    - session:update → update UI, admin panel
    - group:completed → show notification
    - device:connected/disconnected → update device list
    - gm:command:ack → show admin feedback
    - offline:queue:processed → show sync results

    AsyncAPI Contract: Lines 70-89 (server→client events)

    4. Functional Requirements Validation Tests

    Purpose: Ensure scanner behavior matches FR document

    A. fr-deployment-modes.test.js

    Test Cases:
    - FR 0: Networked mode requires orchestrator connection
    - FR 0: Standalone mode works without orchestrator
    - FR 0: Mode selection persists across page reloads
    - FR 0: Switching modes clears/syncs queues appropriately

    B. fr-transaction-processing.test.js

    Test Cases:
    - FR 3.2: Blackmarket mode calculates scores
    - FR 3.2: Detective mode assigns star ratings (no score)
    - FR 3.3: Duplicate detection works (same team)
    - FR 3.4: Group completion bonuses calculated
    - FR 1.2: Paused session blocks new transactions

    C. fr-admin-panel.test.js

    Test Cases:
    - FR 4.1: Admin panel only available in networked mode
    - FR 4.2: All admin commands work (session, video, score, system)
    - FR 4.2: Admin commands use WebSocket (not HTTP)
    - FR 4.2: Command acknowledgments received

    Implementation Strategy

    Phase 1: Critical Unit Tests (Unblock Integration)

    1. Create sessionModeManager.test.js
    2. Create networkedQueueManager.test.js  
    3. Create orchestratorClient.test.js
    4. Create settings.test.js, config.test.js

    Why First: These modules are dependencies for integration tests

    Phase 2: Integration Tests (End-to-End)

    1. Create scanner/ directory
    2. Create app-initialization.test.js
    3. Create transaction-workflow.test.js
    4. Create offline-queue-workflow.test.js
    5. Create admin-panel-integration.test.js
    6. Create mode-switching.test.js

    Why Second: Validates real workflows using tested units

    Phase 3: Contract Compliance (Validation)

    1. Create contract/scanner/ directory
    2. Create event-structure.test.js
    3. Create event-handling.test.js

    Why Third: Ensures scanner matches AsyncAPI/OpenAPI specs

    Phase 4: Functional Requirements (Verification)

    1. Create fr-deployment-modes.test.js
    2. Create fr-transaction-processing.test.js
    3. Create fr-admin-panel.test.js

    Why Last: High-level verification against requirements document

    Expected Outcomes

    Test Count Projection:

    - Unit Tests: ~45 new tests (5 files × 9 tests avg)
    - Integration Tests: ~35 new tests (5 files × 7 tests avg)
    - Contract Tests: ~20 new tests (2 files × 10 tests avg)
    - FR Validation: ~15 new tests (3 files × 5 tests avg)

    Total New Tests: ~115 tests
    New Total: 94 (current) + 115 = 209 tests

    Coverage Improvement:

    - Before: 3/14 scanner modules tested (21%)
    - After: 14/14 scanner modules tested (100%)

    Risk Mitigation:

    - ✅ Catch scanner bugs before deployment
    - ✅ Validate AsyncAPI contract compliance
    - ✅ Ensure networked↔standalone mode works
    - ✅ Verify admin panel functionality
    - ✅ Test offline queue resilience

    Implementation Notes

    Reuse Existing Infrastructure:

    - Use browser-mocks.js for all scanner tests (already working)
    - Use createAuthenticatedScanner() for integration tests
    - Use integration-test-server.js for backend
    - Use contract-validator.js for schema validation

    Test Isolation:

    - Each test file uses beforeEach to reset scanner state
    - Use localStorage.clear() to reset settings/queue
    - Disconnect scanners in afterEach to prevent leaks

    Contract Validation Pattern:

    const validator = require('../helpers/contract-validator');

    it('should send transaction:submit per AsyncAPI', () => {
      const event = {
        event: 'transaction:submit',
        data: { tokenId, teamId, deviceId, mode },
        timestamp: '2025-10-06T...'
      };
      
      const result = validator.validateEvent('transaction:submit', event);
      expect(result.valid).toBe(true);
    });

    Priority Order:

    1. Critical Path: networkedQueueManager, orchestratorClient, sessionModeManager
    2. Integration: app-initialization, transaction-workflow, admin-panel
    3. Validation: event-structure, event-handling
    4. FR Verification: deployment-modes, transaction-processing

    Success Metrics

    - All 14 scanner modules have test coverage
    - All AsyncAPI events validated (structure + handling)
    - All Functional Requirements have test verification
    - Integration tests use real scanner code (not mocks)
    - Tests catch real implementation bugs (not just pass)
    - Test suite runs in CI (<30 seconds for scanner tests)