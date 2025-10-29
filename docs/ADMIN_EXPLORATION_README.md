# Admin Panel and Scoreboard Exploration - Complete Report

## Overview

This directory contains a comprehensive deep-dive analysis of the ALN Ecosystem's admin-facing interfaces. The exploration was conducted with **VERY THOROUGH** coverage to support E2E testing and deployment.

## Generated Documents

### 1. ADMIN_PANEL_DEEP_ANALYSIS.md (1,302 lines, 37KB)
**Comprehensive Technical Reference**

The primary deep-dive document covering:

- **Scoreboard Interface** (Sections 1-6)
  - Display elements and real-time update mechanisms
  - Authentication flow (hardcoded password + JWT)
  - WebSocket event listeners
  - Client-side state management
  - CSS styling and responsive design
  - Token refresh logic

- **Admin Panel** (Sections 2-6)
  - Available commands (15 total actions)
  - Response flow and acknowledgments
  - Side-effect broadcasting patterns
  - Event flow examples with complete payloads

- **Authentication Architecture** (Section 3)
  - HTTP endpoint: POST /api/admin/auth
  - JWT token generation and verification
  - WebSocket handshake validation
  - Role-based access control
  - Token expiry and revocation

- **WebSocket Integration** (Section 4)
  - Event namespace and Socket.io rooms
  - Wrapped event envelope pattern
  - Complete event flow diagrams

- **Real-Time Updates** (Section 5)
  - Score update flow
  - Transaction log updates
  - Connection status monitoring
  - Video queue updates
  - Scoreboard listener patterns

- **State Synchronization** (Section 6)
  - Initial connection sync (sync:full event)
  - Reconnection behavior
  - Session state reset on new session

- **UI Elements** (Section 7)
  - Proposed admin panel layout
  - CSS selectors for E2E automation

- **E2E Test Scenarios** (Section 8)
  - 5 complete test scenarios with code
  - Error handling tests
  - Authentication flow tests
  - Session lifecycle tests
  - Video queue management tests
  - Scoreboard real-time update tests

- **Critical Admin Flows** (Section 9)
  - Complete game session flow
  - Video playback control flow
  - Score intervention workflow
  - Offline to online transition

- **Security Notes** (Section 10)
  - Hardcoded password analysis
  - Token security details
  - CORS configuration
  - Local network restrictions

- **Deployment Checklist** (Section 11)

- **File Locations** (Appendix A)

**Use this for**: Complete understanding of admin interfaces, detailed test design, architecture review

### 2. ADMIN_INTERFACE_QUICK_REFERENCE.md (176 lines, 5.1KB)
**One-Page Quick Lookup Guide**

Essential reference for developers:

- Two interfaces summary (Scoreboard vs. Admin Panel)
- 15 admin commands in quick table
- WebSocket event flow diagram
- Socket.io rooms overview
- Authentication flow (4-step diagram)
- Real-time update events for Scoreboard
- Audit trail structure
- Error response format
- E2E test entry points
- Critical files list
- Testing checklist

**Use this for**: Quick reference during development, sharing with team, deployment prep

### 3. E2E_TEST_HELPERS.md (502 lines, 12KB)
**Practical Testing Code Library**

Copy-paste ready code snippets:

- **Command Examples** (7 categories)
  - Authentication
  - WebSocket connection
  - Session commands (create/pause/resume/end)
  - Video commands (play/pause/skip/queue operations)
  - Score adjustment
  - Transaction management
  - System reset

- **Event Listeners**
  - Command acknowledgment
  - Broadcast listeners (score, session, transaction, video, group completion, errors)

- **Helper Functions**
  - captureEvent() - Promise-based event capture
  - sendCommand() - Send command and wait for ack
  - createSession() - Create session with auto-wait
  - adjustScore() - Score adjustment with audit trail

- **Scoreboard Testing**
  - Connection setup
  - Event capture examples

- **Complete Jest Test Flow**
  - Full test suite example
  - Setup/teardown
  - Session management test
  - Score adjustment with audit trail test

- **Error Cases**
  - Missing required payload
  - Invalid action
  - Session paused transaction

**Use this for**: Writing E2E tests, debugging WebSocket interactions, testing locally

---

## Key Findings Summary

### Architecture
- **Two Distinct Interfaces**:
  1. Scoreboard (`backend/public/scoreboard.html`) - Read-only public display
  2. Admin Panel - Controlled via WebSocket commands (not HTTP)

- **Authentication**: JWT tokens issued via HTTP POST, used in WebSocket handshake
- **Commands**: All admin controls are WebSocket `gm:command` events (not HTTP)
- **Broadcasting**: State changes broadcast to all clients in rooms
- **Audit Trail**: Score adjustments tracked with gmStation, delta, reason, timestamp

### Control Capabilities
**15 Admin Commands**:
- Session: create, pause, resume, end
- Video: play, pause, stop, skip, queue:add, queue:reorder, queue:clear
- Score: adjust (with audit trail)
- Transaction: delete, create
- System: reset

### Real-Time Updates
- Scoreboard receives: sync:full, score:updated, transaction:new (detective mode), group:completed
- All updates via WebSocket (no polling)
- Initial sync on connection, then incremental updates

### Security
- Scoreboard password hardcoded (safe - read-only)
- Admin password via environment variable
- JWT tokens 24-hour expiry
- In-memory token storage (works for single-instance)
- CORS restricted to local network

---

## Critical Files

| Purpose | File | Key Classes/Functions |
|---------|------|----------------------|
| Scoreboard UI | `backend/public/scoreboard.html` | authenticate(), connectWebSocket(), updateTeamScore() |
| Admin Commands | `backend/src/websocket/adminEvents.js` | handleGmCommand(), handleTransactionSubmit() |
| JWT Auth | `backend/src/middleware/auth.js` | generateAdminToken(), verifyToken(), requireAdmin() |
| Admin Routes | `backend/src/routes/adminRoutes.js` | POST /api/admin/auth, GET /api/admin/logs |
| WebSocket Server | `backend/src/server.js` | setupWebSocketHandlers(), createServer() |
| Broadcast System | `backend/src/websocket/broadcasts.js` | setupBroadcastListeners(), emitWrapped() |
| WebSocket Config | `backend/src/websocket/socketServer.js` | createSocketServer() |
| API Contract | `backend/contracts/asyncapi.yaml` | gm:command, gm:command:ack, all event schemas |
| HTTP Contract | `backend/contracts/openapi.yaml` | POST /api/admin/auth endpoint |

---

## Testing Strategy

### Unit Tests
- Admin command handlers (each action)
- JWT token generation/validation
- Audit trail creation
- Score calculation after adjustment

### Integration Tests
- HTTP auth → WebSocket connection flow
- Command → Ack → Broadcast flow
- State consistency across clients
- Token refresh on reconnection

### E2E Tests
- Complete session lifecycle
- Video playback controls
- Score adjustments with audit trail
- Scoreboard real-time updates
- Error handling
- Authentication failures
- Offline transitions

### Test Scenarios Included
See Section 8 of ADMIN_PANEL_DEEP_ANALYSIS.md:
1. Basic score adjustment with audit trail
2. Video queue management
3. Scoreboard real-time updates
4. Session lifecycle
5. Error handling

---

## WebSocket Event Summary

### Client Sends
| Event | Action |
|-------|--------|
| `gm:command` | Admin control command |
| `transaction:submit` | GM Scanner transaction |
| `heartbeat` | Keep-alive signal |
| `sync:request` | Request state resync |

### Server Sends to Clients
| Event | Purpose |
|-------|---------|
| `sync:full` | Complete state dump (on connection + offline recovery) |
| `gm:command:ack` | Command execution result |
| `score:updated` | Team score changed |
| `session:update` | Session state changed |
| `transaction:new` | New scan recorded |
| `video:status` | Video playback state |
| `video:queue:update` | Queue items changed |
| `group:completed` | Group bonus earned |
| `device:connected` | New device connected |
| `device:disconnected` | Device lost connection |
| `error` | Error notification |

---

## Getting Started

### For Development
1. Read: ADMIN_INTERFACE_QUICK_REFERENCE.md (5 min overview)
2. Reference: E2E_TEST_HELPERS.md (for test code)
3. Deep-dive: ADMIN_PANEL_DEEP_ANALYSIS.md (for details)

### For E2E Testing
1. Start: E2E_TEST_HELPERS.md (copy-paste code)
2. Understand: Sections 8-9 of ADMIN_PANEL_DEEP_ANALYSIS.md
3. Check: Testing Checklist in ADMIN_INTERFACE_QUICK_REFERENCE.md

### For Deployment
1. Review: Section 10 (Security) in ADMIN_PANEL_DEEP_ANALYSIS.md
2. Follow: Section 11 (Deployment Checklist)
3. Verify: Hardcoded passwords and JWT configuration

### For Implementing Admin Panel HTML
1. Check: Section 7 of ADMIN_PANEL_DEEP_ANALYSIS.md (proposed layout)
2. Use: CSS selectors provided for E2E automation
3. Reference: E2E_TEST_HELPERS.md (code to integrate)

---

## Important Notes

### Scoreboard vs. Admin Panel
- **Scoreboard** (`scoreboard.html`): Fully implemented, read-only display
- **Admin Panel**: API completely implemented, but no HTML UI yet
  - All controls exist via WebSocket commands
  - Can be built as web UI, native app, or CLI tool
  - Use E2E_TEST_HELPERS.md to understand API

### Hardcoded Passwords
- Scoreboard: `@LN-c0nn3ct` (hardcoded in HTML, safe for display device)
- Admin: Via `ADMIN_PASSWORD` environment variable
- Both use JWT tokens for WebSocket auth (24-hour expiry)

### Broadcasting Behavior
- Commands trigger immediate ack to sender
- Side effects broadcast to all clients in rooms
- Scoring updates broadcast to gm-stations room
- Session updates broadcast to all clients
- Enables real-time sync across multiple admin devices

### Audit Trail
- Every score adjustment tracked in `adminAdjustments` array
- Includes: delta, gmStation, reason, timestamp
- Visible in every `score:updated` broadcast
- Enables accountability and debugging

---

## Files in This Analysis

```
├── ADMIN_EXPLORATION_README.md          (this file)
├── ADMIN_PANEL_DEEP_ANALYSIS.md         (1,302 lines - main report)
├── ADMIN_INTERFACE_QUICK_REFERENCE.md   (176 lines - quick lookup)
└── E2E_TEST_HELPERS.md                  (502 lines - test code library)
```

**Total**: 1,980 lines of comprehensive documentation and code examples

---

## Questions or Issues?

Refer to the appropriate document:
- **"How do I...?"** → ADMIN_INTERFACE_QUICK_REFERENCE.md
- **"Show me the code..."** → E2E_TEST_HELPERS.md
- **"Explain the architecture..."** → ADMIN_PANEL_DEEP_ANALYSIS.md

---

**Generated**: October 27, 2025
**Thoroughness Level**: VERY THOROUGH
**Audience**: Developers, QA Engineers, Deployment Teams
**Scope**: All admin-facing interfaces in ALN Ecosystem backend
