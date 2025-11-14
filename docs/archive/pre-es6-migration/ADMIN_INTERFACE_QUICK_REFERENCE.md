# Admin Interface Quick Reference

## Two Admin-Facing Interfaces

### 1. SCOREBOARD (Read-Only Public Display)
**File**: `backend/public/scoreboard.html`
- TV/monitor display showing: Team rankings, scores, detective log, connection status
- **NOT a control panel** - receives updates only
- Authenticates with hardcoded password `@LN-c0nn3ct`
- Auto-refreshes JWT token every 23 hours
- Responsive CSS (2-column > 1200px, 1-column < 1200px)

### 2. ADMIN PANEL (Not yet implemented HTML, but full API exists)
**Controls**: All available via WebSocket `gm:command` events
- Requires HTTP auth first: `POST /api/admin/auth` → JWT token
- Then WebSocket connection with JWT in `handshake.auth`
- Sends commands as: `gm:command` events with action + payload

---

## Admin Commands Available

| Command | Payload | Purpose |
|---------|---------|---------|
| `session:create` | `{name, teams[]}` | Start new game session |
| `session:pause` | `{}` | Pause gameplay (rejects transactions) |
| `session:resume` | `{}` | Resume gameplay |
| `session:end` | `{}` | End session, archive if complete |
| `video:play` | `{}` | Resume video playback |
| `video:pause` | `{}` | Pause video playback |
| `video:stop` | `{}` | Stop playback |
| `video:skip` | `{}` | Skip to next queued video |
| `video:queue:add` | `{videoFile}` | Add video to queue |
| `video:queue:reorder` | `{fromIndex, toIndex}` | Reorder queue |
| `video:queue:clear` | `{}` | Clear entire queue |
| `score:adjust` | `{teamId, delta, reason}` | Manual score adjustment (with audit trail) |
| `transaction:delete` | `{transactionId}` | Delete transaction, recalculate scores |
| `transaction:create` | `{tokenId, teamId, mode}` | Manually create transaction |
| `system:reset` | `{}` | Full system reset (end session, clear queues) |

---

## WebSocket Event Flow

```
Admin sends gm:command
    ↓
Server handler processes (adminEvents.js)
    ↓
Service updates state & emits domain event
    ↓
Admin receives gm:command:ack (immediate)
    ↓
All clients receive broadcast (score:updated, session:update, video:status, etc.)
```

## Key Rooms

- **gm-stations**: All GM Scanners + Admin Panels (for game logic broadcasts)
- **session:{id}**: Devices in current session (for session-specific broadcasts)

---

## Authentication Flow

```
1. POST /api/admin/auth
   Password: @LN-c0nn3ct (scoreboard) or env var (admin)
   Response: {token, expiresIn: 86400}

2. WebSocket connection with JWT
   io(url, {
     auth: {
       token: JWT_TOKEN,
       deviceId: "UNIQUE_ID",
       deviceType: "gm",
       version: "1.0.0"
     }
   })

3. Server validates JWT in handshake
   - Invalid → connect_error → connection rejected
   - Valid → socket pre-authenticated → sync:full sent

4. Client can now send gm:command events
```

---

## Real-Time Updates on Scoreboard

**Events Received**:
- `sync:full` - Initial state dump on connection
- `score:updated` - Team scores change (per transaction or admin adjustment)
- `transaction:new` - New scan (filtered to detective mode only)
- `group:completed` - Bonus milestone reached (shows notification)

**No Commands Sent** - Scoreboard is receive-only (display device)

---

## Audit Trail (adminAdjustments)

Score adjustments are tracked in `score:updated` event:

```javascript
adminAdjustments: [
  {
    delta: -500,              // Points added/removed
    gmStation: "ADMIN_1",     // Who made adjustment
    reason: "Rule violation", // Why
    timestamp: "2025-10-15T20:25:00.000Z"  // When
  }
]
```

Broadcasted to all GMs when adjustment made.

---

## Error Response Format

If command fails:

```javascript
{
  event: "error",
  data: {
    code: "ERROR_CODE",  // e.g., "SESSION_PAUSED", "VALIDATION_ERROR"
    message: "User-friendly message",
    details: { /* optional additional info */ }
  },
  timestamp: "..."
}
```

## E2E Test Entry Points

1. **Auth**: `POST /api/admin/auth` with password
2. **WebSocket**: `io()` with JWT in `handshake.auth`
3. **Commands**: `socket.emit('gm:command', {...})`
4. **Responses**: Listen for `gm:command:ack` or broadcast events

---

## Critical Files

| Purpose | File |
|---------|------|
| Scoreboard UI | `backend/public/scoreboard.html` |
| Admin Commands | `backend/src/websocket/adminEvents.js` |
| Auth Middleware | `backend/src/middleware/auth.js` |
| Admin Routes | `backend/src/routes/adminRoutes.js` |
| WebSocket Setup | `backend/src/server.js` |
| Broadcast Handler | `backend/src/websocket/broadcasts.js` |
| API Contract | `backend/contracts/asyncapi.yaml` |
| Auth Contract | `backend/contracts/openapi.yaml` |

---

## Testing Checklist

- [ ] POST /api/admin/auth with correct password
- [ ] WebSocket connection with valid JWT
- [ ] Send gm:command with each action type
- [ ] Verify gm:command:ack response
- [ ] Verify broadcast to other clients
- [ ] Scoreboard receives and displays updates
- [ ] Admin adjustments show in adminAdjustments array
- [ ] Session pause blocks new transactions
- [ ] Video queue operations work (add, reorder, clear, skip)
- [ ] System reset clears state properly
- [ ] Token refresh at 23-hour mark
- [ ] Connection error handling
- [ ] Audit trail captures all adjustments

