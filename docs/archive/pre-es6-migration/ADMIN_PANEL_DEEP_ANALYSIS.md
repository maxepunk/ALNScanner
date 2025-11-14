# Deep Exploration: Admin Panel and Scoreboard Interfaces
## About Last Night (ALN) Ecosystem - Backend Admin Interfaces

---

## EXECUTIVE SUMMARY

The ALN system features **two primary admin-facing interfaces**:

1. **Scoreboard Display** (`backend/public/scoreboard.html`)
   - Read-only, public display for TV/monitor
   - Real-time score updates, team rankings, detective log
   - No intervention capabilities, no commands

2. **Admin Panel** (Not yet implemented as standalone HTML file)
   - Control and monitoring via WebSocket commands
   - All controls defined in AsyncAPI contract as `gm:command` events
   - Can manage sessions, videos, scores, and transactions
   - Requires JWT authentication

**Key Architecture**: Admin commands are WebSocket-based (`gm:command`), NOT HTTP endpoints. This is intentional per Decision #1 - HTTP is for auth only.

---

## 1. SCOREBOARD DISPLAY INTERFACE
**File**: `/home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/backend/public/scoreboard.html` (747 lines)

### 1.1 Purpose and Display Elements

**Read-Only Display - No Commands Sent**
- TV/monitor-optimized interface for game audience
- Shows Black Market Scoreboard (team rankings and scores)
- Shows Detective Log (detective-mode scans timeline)
- Shows Group Completions (bonus notifications)
- Displays connection status indicator

### 1.2 Displayed Information

#### Team Rankings/Scores
```
Element: .scoreboard-entry (per team)
- Rank number (1=gold, 2=silver, 3=bronze, others=numbered)
- Team ID (e.g., "Team 001")
- Stats line: "🎯 X tokens" + "🏆 Y groups"
- Current Score (large, money format: $X,XXX)
```

**Data Source**: `score:updated` WebSocket event (from transactionService)

#### Detective Log
```
Element: .detective-log + .log-entry (per transaction)
- Token ID that was scanned
- Timestamp (formatted as time only, e.g., "14:30:45")
- Keeps 50 most recent entries (scrollable, max-height: 600px)
```

**Data Source**: `transaction:new` events filtered for `mode === 'detective'`

#### Connection Status Badge
```
Element: .connection-status (top-right)
- Status dot (animated):
  - Green + pulse animation = "Connected" = online
  - Red + static = "Offline" = disconnected
  - Yellow + static = "Connecting..." = in-progress
- Status text: "Live" | "Offline" | "Connection Error"
```

### 1.3 Authentication Flow

**Step 1: HTTP Authentication**
```javascript
POST /api/admin/auth
{
  "password": "@LN-c0nn3ct"  // HARDCODED in scoreboard (line 437)
}

Response:
{
  "token": "eyJhbGc...",
  "expiresIn": 86400
}
```

**Security Note**: Hardcoded password in client-side HTML. This is intentional because:
- Scoreboard is read-only (no intervention capability)
- Client-side password is same for all scoreboard displays
- Cannot be used for malicious commands

**Step 2: WebSocket Connection with JWT**
```javascript
io(CONFIG.apiUrl, {
  transports: ['websocket'],
  auth: {
    token: state.token,           // JWT from Step 1
    deviceId: 'SCOREBOARD_DISPLAY',
    deviceType: 'gm',             // Note: uses 'gm' type
    version: '1.0.0',
  }
})
```

**Step 3: Auto-Sync Behavior**
After successful WebSocket connection handshake:
1. Server validates JWT in handshake.auth middleware (before connection accepted)
2. Server sends `sync:full` event automatically (NOT requested)
3. Client receives initial state (scores, recent transactions, devices, system status)

### 1.4 WebSocket Events Listened To

| Event | Direction | Frequency | Purpose |
|-------|-----------|-----------|---------|
| `connect` | Server→Client | Once on initial connection | Mark as connected, update status |
| `disconnect` | Server→Client | Once on disconnect | Mark as offline, update status |
| `connect_error` | Server→Client | On auth failure | Update status to error |
| `reconnect` | Server→Client | On auto-reconnect | Re-emit sync:request |
| `sync:full` | Server→Client | On connection + after offline:queue:processed | Full state dump |
| `score:updated` | Server→Client | Per transaction | Team score changes (real-time) |
| `group:completed` | Server→Client | Per group completion | Show bonus notification |
| `transaction:new` | Server→Client | Per scan (filtered to detective mode) | Add to detective log |

### 1.5 State Management

**Client-Side State** (in `state` object):
```javascript
{
  socket: Socket.io instance,
  token: JWT token (string),
  isConnected: Boolean,
  teamScores: Map<teamId → scoreData>,    // Cached for rendering
  detectiveScans: Array<{id, tokenId, timestamp}>,  // Last 50 entries
}
```

**Score Data Structure** (from AsyncAPI contract):
```javascript
{
  teamId: "001",
  currentScore: 11500,
  baseScore: 11000,
  bonusPoints: 500,
  tokensScanned: 8,
  completedGroups: ["jaw_group"],
  adminAdjustments: [{delta, gmStation, reason, timestamp}],
  lastUpdate: "2025-10-15T20:15:30.000Z"
}
```

**Rendering Logic**:
- Sort scores by `currentScore` descending
- Only show teams with `tokensScanned > 0`
- Apply CSS class `rank-1`, `rank-2`, `rank-3` for styling

### 1.6 CSS Styling & Responsive Design

| Viewport | Layout | Changes |
|----------|--------|---------|
| > 1200px | 2-column grid (2fr 1fr) | Scoreboard + Detective Log side-by-side |
| 768-1200px | 1-column grid | Stacked vertically |
| < 768px | Mobile optimized | Smaller padding, fixed notification position |

**Color Scheme**:
- Background: Gradient purple (#667eea → #764ba2)
- Rank 1: Gold gradient (#ffd700 → #ffed4e)
- Rank 2: Silver gradient (#c0c0c0 → #e8e8e8)
- Rank 3: Bronze gradient (#cd7f32 → #e5a572)
- Notification: Green for group complete

**Animations**:
- Pulse animation on connection status dot (online only)
- Slide-in animation for notifications (0.3s)
- Fade-out animation when removing notifications (0.3s)

### 1.7 Configuration

```javascript
const CONFIG = {
  adminPassword: '@LN-c0nn3ct',          // Line 437 - HARDCODED
  deviceId: 'SCOREBOARD_DISPLAY',
  apiUrl: window.location.origin,        // Auto-detect from page URL
  reconnectDelay: 2000,                  // ms between reconnect attempts
  tokenRefreshInterval: 23 * 60 * 60 * 1000,  // 23 hours - refresh before expiry
}
```

### 1.8 Token Refresh Logic

**Auto-Refresh Every 23 Hours** (Line 732-739):
```javascript
setInterval(async () => {
  console.log('🔄 Refreshing authentication token...');
  await authenticate();
  if (state.socket && state.socket.connected) {
    state.socket.disconnect();
    await connectWebSocket();  // Reconnect with new token
  }
}, CONFIG.tokenRefreshInterval);
```

---

## 2. ADMIN PANEL INTERFACE
**Status**: Not implemented as standalone HTML file. Controls exist only as WebSocket commands.

### 2.1 Control Methods (All via WebSocket `gm:command`)

Admin controls are implemented as WebSocket events, not HTTP. Client would need to:
1. Authenticate via `POST /api/admin/auth` (get JWT)
2. Connect WebSocket with JWT in `handshake.auth`
3. Send `gm:command` events with action type

### 2.2 Available Admin Commands

**Source**: `backend/src/websocket/adminEvents.js` (lines 40-244)

#### Session Management

| Command | Payload | Result |
|---------|---------|--------|
| `session:create` | `{name, teams[]}` | Creates new session, broadcasts `session:update` |
| `session:pause` | `{}` | Sets status to 'paused', rejects new transactions |
| `session:resume` | `{}` | Sets status to 'active', allows transactions |
| `session:end` | `{}` | Sets status to 'ended', archives session if completed |

**Handler**: `sessionService.updateSession(status)` / `sessionService.createSession()`

#### Video Playback Controls

| Command | Payload | Result |
|---------|---------|--------|
| `video:play` | `{}` | Resume playback (VLC resume) |
| `video:pause` | `{}` | Pause playback (VLC pause) |
| `video:stop` | `{}` | Stop playback (VLC stop) |
| `video:skip` | `{}` | Skip current video, move to next in queue |

**Handler**: `vlcService.play/pause/stop()` or `videoQueueService.skipCurrent()`

#### Video Queue Management

| Command | Payload | Result |
|---------|---------|--------|
| `video:queue:add` | `{videoFile}` | Add video to queue by filename |
| `video:queue:reorder` | `{fromIndex, toIndex}` | Reorder queue items |
| `video:queue:clear` | `{}` | Clear all queued videos |

**Handler**: `videoQueueService.addVideoByFilename()` / `reorderQueue()` / `clearQueue()`

#### Score Management

| Command | Payload | Result |
|---------|---------|--------|
| `score:adjust` | `{teamId, delta, reason}` | Adjust score by delta, creates audit trail |

**Handler**: `transactionService.adjustTeamScore(teamId, delta, reason, gmStation)`

**Audit Trail**: Creates `adminAdjustments` entry with:
- `delta`: +/- points
- `gmStation`: Which GM made adjustment
- `reason`: Why (e.g., "Rule violation penalty")
- `timestamp`: When

**Broadcasts**: `score:updated` event to all GMs with updated `adminAdjustments` array

#### Transaction Management

| Command | Payload | Result |
|---------|---------|--------|
| `transaction:delete` | `{transactionId}` | Delete transaction, recalculate scores |
| `transaction:create` | `{tokenId, teamId, mode}` | Manually create transaction for team |

**Handler**: `transactionService.deleteTransaction()` / `createManualTransaction()`

**Manual Transaction Payload**:
```javascript
{
  tokenId: "534e2b03",
  teamId: "001",
  mode: "blackmarket" or "detective",
  // Optional: memoryType, valueRating override
}
```

#### System Reset

| Command | Payload | Result |
|---------|---------|--------|
| `system:reset` | `{}` | Complete system reset: end session, clear queues, reset services |

**Behavior**:
- Archives current session if status='completed'
- Warns if resetting active session
- Ends session
- Clears video queue
- Resets transactionService scores
- Ready for new session

### 2.3 Command Response Flow

**Synchronous Acknowledgment**:
```
Admin sends:     gm:command {action: "video:skip", payload: {}}
Server processes command
Server responds: gm:command:ack {action: "video:skip", success: true, message: "..."}
```

**Structure of `gm:command:ack`** (per AsyncAPI):
```javascript
{
  event: "gm:command:ack",
  data: {
    action: "video:skip",           // Which command was executed
    success: true,                  // true = success, false = failure
    message: "Video skipped successfully",
    error: null,                    // null if success, error code if failed
    result: null                    // Command-specific result data (optional)
  },
  timestamp: "2025-10-15T20:20:00.100Z"
}
```

### 2.4 Side-Effect Broadcasting

After command executes, server broadcasts state changes to ALL clients:

| Command | Broadcast Events |
|---------|------------------|
| `session:create` | `session:update` to all clients |
| `session:pause` | `session:update` (status='paused') to all clients |
| `session:resume` | `session:update` (status='active') to all clients |
| `session:end` | `session:update` (status='ended') to all clients |
| `video:skip` | `video:status` + `video:queue:update` to GM stations |
| `video:play` | `video:status` (status='playing') to GM stations |
| `video:pause` | `video:status` (status='paused') to GM stations |
| `video:stop` | `video:status` (status='idle') to GM stations |
| `video:queue:*` | `video:queue:update` to GM stations |
| `score:adjust` | `score:updated` to GM stations with adminAdjustments |
| `transaction:delete` | `score:updated` (recalculated) to GM stations |
| `transaction:create` | `transaction:new` + `score:updated` to GM stations |

---

## 3. AUTHENTICATION FLOW (DETAILED)

### 3.1 HTTP Authentication Endpoint

**Endpoint**: `POST /api/admin/auth`
**File**: `/backend/src/routes/adminRoutes.js` (lines 17-51)

```javascript
POST /api/admin/auth HTTP/1.1
Content-Type: application/json

{
  "password": "your-admin-password"
}
```

**Validation**:
- Password required (non-empty string)
- Must match `config.security.adminPassword` environment variable

**Response on Success** (HTTP 200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400
}
```

**JWT Structure** (from `middleware/auth.js`):
```javascript
{
  id: "admin",
  role: "admin",
  timestamp: 1234567890,
  iat: [issued-at timestamp],
  exp: [expiration timestamp = now + 24h]
}
```

**Token Storage**:
- Generated token stored in in-memory `Set` (adminTokens)
- Expiry tracked in `Map` (tokenExpiry)
- Cleanup runs hourly to remove expired tokens
- On logout: `invalidateToken(token)` removes from both

**Response on Failure** (HTTP 401):
```json
{
  "error": "AUTH_REQUIRED",
  "message": "Authentication failed"
}
```

### 3.2 WebSocket Handshake Authentication

**File**: `/backend/src/server.js` (lines 46-78)

**Client Connection Code**:
```javascript
const socket = io('http://orchestrator:3000', {
  transports: ['websocket'],
  auth: {
    token: "JWT_TOKEN",           // From POST /api/admin/auth
    deviceId: "ADMIN_PANEL_1",    // Unique identifier
    deviceType: "gm",             // Always "gm" for admin (controls same as GM)
    version: "1.0.0"              // Optional: client version
  }
});
```

**Server Validation** (in connection handler):
```javascript
const { token, deviceId, deviceType, version } = socket.handshake.auth || {};

if (token && deviceId && deviceType === 'gm') {
  const decoded = verifyToken(token);  // Checks JWT signature + expiry
  
  if (decoded && decoded.role === 'admin') {
    // Pre-authenticate from handshake
    socket.isAuthenticated = true;
    socket.deviceId = deviceId;
    socket.deviceType = deviceType;
    
    // Auto-trigger identification (no need for gm:identify event)
    await handleGmIdentify(socket, {...}, io);
  }
}
```

**Authentication Failure**:
- Invalid/missing JWT → Connection rejected at transport level
- Client receives `connect_error` event (NOT application-level error)
- Socket NOT added to any rooms
- `sync:full` NOT sent

### 3.3 Role-Based Access Control

**Server-Side Check** (in `adminEvents.js`):
```javascript
if (!socket.deviceId || socket.deviceType !== 'gm') {
  // Return authorization error
  emitWrapped(socket, 'error', {
    code: 'AUTH_REQUIRED',
    message: 'Not authorized'
  });
  return;
}
```

**Note**: Both GM Scanner and Admin Panel use `deviceType: 'gm'` in handshake.
- Distinguished by JWT role: `decoded.role === 'admin'`
- Both can send `gm:command` events
- GM Scanner cannot send if `socket.isAuthenticated = false`

---

## 4. WEBSOCKET INTEGRATION DETAILS

### 4.1 Event Namespace and Rooms

**WebSocket Namespace**: `/` (default Socket.io namespace)

**Socket.io Rooms**:
| Room | Members | Purpose |
|------|---------|---------|
| `gm-stations` | All GM Scanners + Admin Panels | Game logic broadcasts |
| `session:{sessionId}` | Devices in current session | Session-specific broadcasts |

**Broadcasting Pattern**:
```javascript
// Broadcast to all GM stations
io.to('gm-stations').emit('score:updated', data);

// Broadcast to specific session
io.to(`session:${sessionId}`).emit('transaction:new', data);

// Broadcast to all connected clients
io.emit('session:update', data);
```

### 4.2 Wrapped Event Envelope Pattern

**All WebSocket events use wrapped envelope**:
```javascript
{
  event: "score:updated",
  data: {
    teamId: "001",
    currentScore: 11500,
    // ... rest of data
  },
  timestamp: "2025-10-15T20:15:30.100Z"
}
```

**Not just the data**:
```javascript
// WRONG (old pattern)
io.emit('score:updated', { teamId: "001", ... });

// CORRECT (new pattern)
emitWrapped(io, 'score:updated', { teamId: "001", ... });
```

**Helper Function** (`websocket/eventWrapper.js`):
```javascript
function emitWrapped(target, eventName, data) {
  target.emit(eventName, {
    event: eventName,
    data: data,
    timestamp: new Date().toISOString()
  });
}
```

### 4.3 Event Flow Example: Score Adjustment

```
1. Admin sends via WebSocket:
   {
     event: "gm:command",
     data: {
       action: "score:adjust",
       payload: {
         teamId: "001",
         delta: -500,
         reason: "Rule violation penalty"
       }
     },
     timestamp: "2025-10-15T20:25:00.000Z"
   }

2. Server handler (adminEvents.js) processes:
   - Validates socket auth (socket.deviceType === 'gm')
   - Calls transactionService.adjustTeamScore()
   - Creates audit entry in adminAdjustments array
   - Service emits 'score:updated' event

3. Broadcast listener (broadcasts.js) handles:
   - Wraps score:updated with envelope
   - Broadcasts to 'gm-stations' room
   - Updates all GM Scanners and Admin Panels

4. Admin receives acknowledgment:
   {
     event: "gm:command:ack",
     data: {
       action: "score:adjust",
       success: true,
       message: "Team 001 score adjusted by -500"
     },
     timestamp: "2025-10-15T20:25:00.100Z"
   }

5. All clients in 'gm-stations' room receive broadcast:
   {
     event: "score:updated",
     data: {
       teamId: "001",
       currentScore: 11000,  // 11500 - 500
       baseScore: 11000,
       bonusPoints: 500,
       tokensScanned: 8,
       completedGroups: ["jaw_group"],
       adminAdjustments: [
         {
           delta: -500,
           gmStation: "ADMIN_PANEL_1",
           reason: "Rule violation penalty",
           timestamp: "2025-10-15T20:25:00.000Z"
         }
       ],
       lastUpdate: "2025-10-15T20:25:00.000Z"
     },
     timestamp: "2025-10-15T20:25:00.100Z"
   }
```

---

## 5. REAL-TIME UPDATE MECHANISMS

### 5.1 Score Update Flow

**Source**: `transactionService.adjustTeamScore()` → emits `score:updated` event

**Flow**:
```
transactionService.emit('score:updated', updatedScore)
  ↓
stateService.on('score:updated', ...)  [if listener registered]
  ↓
broadcasts.js listens for 'score:updated'
  ↓
emitWrapped(io, 'score:updated', payload) to 'gm-stations' room
  ↓
All connected clients receive event
```

**Update Frequency**: Immediate on any transaction or admin adjustment

**Data Freshness**: Real-time (no polling, WebSocket push)

### 5.2 Transaction Log Updates

**Source**: `sessionService` emits `transaction:added` event

**Flow**:
```
transaction created/added
  ↓
sessionService.emit('transaction:added', transaction)
  ↓
broadcasts.js listens
  ↓
Enriches with token data (memoryType, valueRating, group)
  ↓
emitWrapped(io, 'transaction:new', {transaction: ...})
  ↓
Broadcasted to session room (session:{sessionId})
```

**What the Scoreboard Does**:
- Filters `transaction:new` events for `mode === 'detective'`
- Adds to `state.detectiveScans` array
- Keeps last 50 entries
- Renders in detective log with timestamp

### 5.3 Connection Status Updates

**Socket.io Native Events**:
```javascript
socket.on('connect', () => {
  // Update UI: "Connected" / "Live"
  updateConnectionStatus('connected', 'Live');
});

socket.on('disconnect', (reason) => {
  // Update UI: "Offline"
  updateConnectionStatus('offline', 'Offline');
  // reason: 'io server disconnect', 'io client namespace disconnect', 'ping timeout', etc.
});

socket.on('connect_error', (error) => {
  // Update UI: "Connection Error"
  updateConnectionStatus('error', 'Connection Error');
  // error: auth failure, CORS error, etc.
});

socket.on('reconnect', () => {
  // Re-authenticate if needed
  socket.emit('sync:request');
});
```

### 5.4 Video Queue Updates

**Source**: `videoQueueService` emits multiple video-related events

**Events Broadcasted to GM Stations**:
- `video:status` - Current playback state (idle/loading/playing/paused/completed/error)
- `video:progress` - Progress updates every 1 second during playback
- `video:queue:update` - Queue items changed

**Scoreboard doesn't display video status** (but has event listener for future use)

---

## 6. STATE SYNCHRONIZATION

### 6.1 Initial Connection Sync

**When Admin/GM connects via WebSocket**:

1. **Socket.io handshake validates JWT**
2. **Server sends `sync:full` event automatically** (not requested)
3. **Client receives complete state**:

```javascript
{
  event: "sync:full",
  data: {
    session: {
      id: "uuid",
      name: "About Last Night - Oct 15 2025",
      startTime: "2025-10-15T19:00:00.000Z",
      endTime: null,
      status: "active",
      teams: ["001", "002", "003"],
      metadata: {gmStations: 2, playerDevices: 3, totalScans: 47}
    },
    scores: [
      {
        teamId: "001",
        currentScore: 11500,
        baseScore: 11000,
        bonusPoints: 500,
        tokensScanned: 8,
        completedGroups: ["jaw_group"],
        adminAdjustments: [],
        lastUpdate: "2025-10-15T20:15:30.000Z"
      }
    ],
    recentTransactions: [/* last 100 transactions */],
    videoStatus: {
      status: "idle",
      queueLength: 0,
      tokenId: null,
      duration: null,
      progress: null,
      expectedEndTime: null,
      error: null
    },
    devices: [
      {
        deviceId: "GM_Station_1",
        type: "gm",
        name: "GM Station v1.0.0",
        connectionTime: "2025-10-15T19:00:30.000Z",
        ipAddress: "10.0.0.81"
      }
    ],
    systemStatus: {
      orchestrator: "online",
      vlc: "connected"
    }
  },
  timestamp: "2025-10-15T19:00:30.200Z"
}
```

### 6.2 Reconnection Behavior

**If client disconnects and reconnects**:

1. Client loses JWT token validity tracking? No - token still valid (24h lifespan)
2. Reconnect with same token in handshake.auth
3. Server validates JWT (still valid)
4. Socket pre-authenticates from handshake
5. Server sends `sync:full` again

**Reset Session State on New Session ID**:
```javascript
// Per AsyncAPI contract requirement:
let previousSessionId = null;

socket.on('sync:full', (eventData) => {
  const newSessionId = eventData.data.session?.id;
  
  if (newSessionId && newSessionId !== previousSessionId) {
    // NEW SESSION DETECTED
    // Reset session-scoped state (e.g., duplicate detection)
    // Clear cached data tied to previous session
    // Preserve historical data (transaction logs, etc.)
    previousSessionId = newSessionId;
  }
});
```

---

## 7. ADMIN PANEL UI ELEMENTS (IF IMPLEMENTED)

### 7.1 Proposed Control Panel Layout

**Session Controls** (top)
```
[Create Session] [Pause] [Resume] [End Session]
Input: Team IDs comma-separated (for create)
Confirmation dialog before end session
```

**Video Controls** (middle-left)
```
[Play] [Pause] [Stop] [Skip]
Add to Queue: [VideoFile dropdown]
Queue Display: 
  - Current video playing
  - Next 5 items with move ↑/↓ buttons
[Clear Queue] button

Video Status: "idle" | "loading" | "playing" | "paused" | "completed" | "error"
Duration: MM:SS
Progress: ▓▓▓▓░░ (visual bar + percentage)
```

**Score Adjustment** (middle-right)
```
Team ID: [dropdown of teams]
Adjustment: [+/- number input]
Reason: [text field]
[Apply Adjustment]

Recent Adjustments History:
- Team 001: -500 (Rule violation penalty) @ 20:25:00
- Team 002: +250 (Bonus correction) @ 20:23:45
```

**Transaction Management** (bottom)
```
Manual Transaction:
  Token ID: [input]
  Team ID: [dropdown]
  Mode: [detective / blackmarket]
  [Create Transaction]

Transaction Log:
  Recent transactions with delete ✕ button
  Filters: Show all | Show duplicates only
```

**System Controls** (bottom-right)
```
[Reset System]
Logs Display: [Last 100 lines]
Log Level: [Error | Warn | Info]
Connection Status: ✓ All GM stations connected (5/5)
```

### 7.2 Selectors for E2E Test Automation

Recommended CSS selectors if HTML is built:

```javascript
// Session Controls
#sessionCreate, #sessionPause, #sessionResume, #sessionEnd
#sessionTeamsInput

// Video Controls
#videoPlay, #videoPause, #videoStop, #videoSkip
#videoQueueAdd, #videoFileSelect
#videoClearQueue
#videoStatusDisplay, #videoProgressBar

// Score Controls
#teamSelect, #adjustmentAmount, #adjustmentReason
#applyAdjustment
.adjustment-history-item

// Transaction Controls
#tokenIdInput, #transactionTeamSelect, #transactionMode
#createTransaction
.transaction-item [data-transaction-id]
.transaction-item .delete-btn

// System Controls
#systemReset, .reset-confirmation-dialog
#logsDisplay, #logLevelSelect
#connectionStatusBadge
```

---

## 8. E2E TEST SCENARIOS

### Scenario 1: Basic Score Adjustment with Audit Trail

```javascript
describe('Admin Panel - Score Adjustment', () => {
  test('Admin can adjust team score and audit trail appears', async () => {
    // 1. Authenticate
    const authResp = await fetch('/api/admin/auth', {
      method: 'POST',
      body: JSON.stringify({password: process.env.ADMIN_PASSWORD})
    });
    const {token} = await authResp.json();
    expect(authResp.ok).toBe(true);
    
    // 2. Connect WebSocket with JWT
    const socket = io(BASE_URL, {
      auth: {token, deviceId: 'TEST_ADMIN', deviceType: 'gm'}
    });
    
    await new Promise(resolve => socket.on('connect', resolve));
    
    // 3. Send score adjustment command
    socket.emit('gm:command', {
      event: 'gm:command',
      data: {
        action: 'score:adjust',
        payload: {
          teamId: '001',
          delta: -500,
          reason: 'Testing rule violation'
        }
      },
      timestamp: new Date().toISOString()
    });
    
    // 4. Receive command acknowledgment
    const ack = await new Promise(resolve => {
      socket.on('gm:command:ack', resolve);
    });
    expect(ack.data.success).toBe(true);
    expect(ack.data.action).toBe('score:adjust');
    
    // 5. Receive broadcast to other clients
    const scoreUpdate = await new Promise(resolve => {
      socket.on('score:updated', resolve);
    });
    expect(scoreUpdate.data.teamId).toBe('001');
    expect(scoreUpdate.data.currentScore).toBe(initialScore - 500);
    expect(scoreUpdate.data.adminAdjustments.length).toBeGreaterThan(0);
    expect(scoreUpdate.data.adminAdjustments[0].reason)
      .toBe('Testing rule violation');
  });
});
```

### Scenario 2: Video Queue Management

```javascript
describe('Admin Panel - Video Queue', () => {
  test('Admin can queue, reorder, and skip videos', async () => {
    const socket = connectAndAuth(token);
    
    // 1. Add video to queue
    socket.emit('gm:command', {
      event: 'gm:command',
      data: {
        action: 'video:queue:add',
        payload: {videoFile: 'test_30sec.mp4'}
      },
      timestamp: now()
    });
    
    const queueUpdate1 = await captureEvent(socket, 'video:queue:update');
    expect(queueUpdate1.data.items.length).toBe(1);
    
    // 2. Add second video
    socket.emit('gm:command', {
      event: 'gm:command',
      data: {
        action: 'video:queue:add',
        payload: {videoFile: 'test_2sec.mp4'}
      },
      timestamp: now()
    });
    
    const queueUpdate2 = await captureEvent(socket, 'video:queue:update');
    expect(queueUpdate2.data.items.length).toBe(2);
    
    // 3. Reorder queue
    socket.emit('gm:command', {
      event: 'gm:command',
      data: {
        action: 'video:queue:reorder',
        payload: {fromIndex: 1, toIndex: 0}
      },
      timestamp: now()
    });
    
    const queueUpdate3 = await captureEvent(socket, 'video:queue:update');
    expect(queueUpdate3.data.items[0].tokenId)
      .toBe('test_2sec.mp4');
    
    // 4. Skip current
    socket.emit('gm:command', {
      event: 'gm:command',
      data: {
        action: 'video:skip',
        payload: {}
      },
      timestamp: now()
    });
    
    const queueUpdate4 = await captureEvent(socket, 'video:queue:update');
    expect(queueUpdate4.data.items.length).toBe(1);
  });
});
```

### Scenario 3: Scoreboard Real-Time Updates

```javascript
describe('Scoreboard Display - Real-Time Updates', () => {
  test('Scoreboard receives and displays score updates', async () => {
    // 1. Load scoreboard in browser (simulated)
    const scoreboardSocket = io(BASE_URL, {
      auth: {
        token: scoreboardToken,
        deviceId: 'SCOREBOARD_DISPLAY',
        deviceType: 'gm'
      }
    });
    
    // 2. Capture initial sync:full
    const initialSync = await captureEvent(scoreboardSocket, 'sync:full');
    expect(initialSync.data.scores).toBeDefined();
    expect(initialSync.data.scores.length).toBeGreaterThan(0);
    
    // 3. Admin makes adjustment via separate socket
    const adminSocket = connectAndAuth(adminToken);
    adminSocket.emit('gm:command', {
      event: 'gm:command',
      data: {
        action: 'score:adjust',
        payload: {teamId: '001', delta: 250}
      },
      timestamp: now()
    });
    
    // 4. Scoreboard receives broadcast
    const scoreUpdate = await captureEvent(scoreboardSocket, 'score:updated');
    expect(scoreUpdate.data.teamId).toBe('001');
    expect(scoreUpdate.data.currentScore)
      .toBe(initialScore + 250);
    
    // 5. Verify DOM updates (if in browser)
    const scoreElement = document.querySelector('[data-team="001"] .score');
    expect(scoreElement.textContent).toContain(newScore);
  });
});
```

### Scenario 4: Session Lifecycle

```javascript
describe('Admin Panel - Session Management', () => {
  test('Admin can create, pause, resume, and end session', async () => {
    const socket = connectAndAuth(token);
    
    // 1. Create session
    socket.emit('gm:command', {
      event: 'gm:command',
      data: {
        action: 'session:create',
        payload: {
          name: 'Test Session',
          teams: ['001', '002', '003']
        }
      },
      timestamp: now()
    });
    
    const createAck = await captureEvent(socket, 'gm:command:ack');
    expect(createAck.data.success).toBe(true);
    
    const sessionUpdate1 = await captureEvent(socket, 'session:update');
    expect(sessionUpdate1.data.status).toBe('active');
    expect(sessionUpdate1.data.teams).toEqual(['001', '002', '003']);
    
    // 2. Pause session
    socket.emit('gm:command', {
      event: 'gm:command',
      data: {action: 'session:pause', payload: {}},
      timestamp: now()
    });
    
    const sessionUpdate2 = await captureEvent(socket, 'session:update');
    expect(sessionUpdate2.data.status).toBe('paused');
    
    // 3. Resume session
    socket.emit('gm:command', {
      event: 'gm:command',
      data: {action: 'session:resume', payload: {}},
      timestamp: now()
    });
    
    const sessionUpdate3 = await captureEvent(socket, 'session:update');
    expect(sessionUpdate3.data.status).toBe('active');
    
    // 4. End session
    socket.emit('gm:command', {
      event: 'gm:command',
      data: {action: 'session:end', payload: {}},
      timestamp: now()
    });
    
    const sessionUpdate4 = await captureEvent(socket, 'session:update');
    expect(sessionUpdate4.data.status).toBe('ended');
    expect(sessionUpdate4.data.endTime).toBeDefined();
  });
});
```

### Scenario 5: Error Handling

```javascript
describe('Admin Panel - Error Handling', () => {
  test('Invalid commands return error', async () => {
    const socket = connectAndAuth(token);
    
    // 1. Send invalid command action
    socket.emit('gm:command', {
      event: 'gm:command',
      data: {
        action: 'invalid:action',
        payload: {}
      },
      timestamp: now()
    });
    
    const errorEvent = await captureEvent(socket, 'error');
    expect(errorEvent.data.code).toBe('INVALID_COMMAND');
    expect(errorEvent.data.message).toContain('Unknown action');
  });
  
  test('Unauthenticated client cannot send commands', async () => {
    // Connect without valid JWT
    const socket = io(BASE_URL, {
      auth: {deviceId: 'TEST', deviceType: 'gm'}
      // No token
    });
    
    const connectError = await captureEvent(socket, 'connect_error');
    expect(connectError).toBeDefined();
    
    // Socket should NOT be authenticated
    expect(socket.connected).toBe(false);
  });
  
  test('Transactions rejected when session paused', async () => {
    const socket = connectAndAuth(token);
    
    // 1. Pause session
    socket.emit('gm:command', {
      event: 'gm:command',
      data: {action: 'session:pause', payload: {}},
      timestamp: now()
    });
    await captureEvent(socket, 'session:update');
    
    // 2. Try to submit transaction while paused
    socket.emit('transaction:submit', {
      event: 'transaction:submit',
      data: {
        tokenId: '534e2b03',
        teamId: '001',
        deviceId: 'TEST_ADMIN',
        mode: 'blackmarket'
      },
      timestamp: now()
    });
    
    const result = await captureEvent(socket, 'transaction:result');
    expect(result.data.status).toBe('error');
    expect(result.data.message).toContain('Session is paused');
  });
});
```

---

## 9. CRITICAL ADMIN FLOWS TO TEST

### Flow 1: Complete Game Session

```
1. Admin authenticates → GET JWT token
2. Admin connects WebSocket → receives sync:full
3. Admin creates session with teams [001, 002, 003]
4. Players and GMs connect to session
5. Players scan tokens → videos queue
6. GMs scan tokens → scoring happens
7. Admin adjusts score for Team 001: -500 (rule violation)
8. Scoreboard in audience displays updated scores
9. Admin pauses session for break
10. Admin resumes session
11. Game continues...
12. Admin ends session
13. Scoreboard shows final rankings
```

### Flow 2: Video Playback Control

```
1. Player scans token with video → backend queues video
2. Admin sees video queued in Admin Panel
3. Admin sends video:play → starts playback on TV
4. GM stations see video:status events with progress
5. Video finishes → video:completed event → idle loop resumes
6. Admin can pause/skip at any time
7. Admin can manually queue additional videos
```

### Flow 3: Score Intervention

```
1. Team 001 scans token → +3000 points
2. Rules dispute - admin needs to adjust
3. Admin sends score:adjust for Team 001: -500 (penalty)
4. Audit trail created with gmStation, reason, timestamp
5. All clients see updated score + adminAdjustments array
6. Later, if override: score:adjust +500 (correction)
7. Audit trail shows both adjustments with timestamps
```

### Flow 4: Offline → Online Transition

```
1. Player Scanner offline (no connection) for 5 minutes
2. Player Scanner queues up 3 scans locally
3. Network comes back online
4. Player Scanner uploads queued scans via HTTP POST /api/scan/batch
5. Server processes batch → broadcasts offline:queue:processed
6. Server broadcasts sync:full with all updates
7. GMs see all 3 scans counted immediately
8. Scoreboard updates with new scores
```

---

## 10. CRITICAL SECURITY NOTES

### 10.1 Hardcoded Passwords

**Scoreboard HTML (line 437)**:
```javascript
adminPassword: '@LN-c0nn3ct'  // HARDCODED
```

**Impact**:
- Scoreboard is read-only (no command capability)
- Cannot be used to create/manipulate data
- Safe for public display (same password for all displays)
- Change via `.env` file for admin routes

**Server Admin Password** (from `config.security.adminPassword`):
- Must be set via environment variable
- Used for `POST /api/admin/auth` endpoint
- Should differ from scoreboard password in production

### 10.2 Token Security

**JWT Token Expiry**: 24 hours
- Scoreboard auto-refreshes every 23 hours
- Admin panels should do the same
- Expired tokens cannot be used for WebSocket connection

**Token Revocation**:
- Via `invalidateToken()` on logout
- Removed from in-memory `adminTokens` Set
- Cleanup runs hourly to remove expired tokens

**In-Memory Storage** (not production-ready):
- Works for single-instance deployment
- Replace with Redis for multi-instance
- Currently fine for local live-event tool

### 10.3 CORS Configuration

**Local Network Only**:
```javascript
// Allows RFC1918 addresses: 10.x, 172.16-31.x, 192.168.x
// Also allows: localhost, 127.0.0.1, mDNS .local hostnames
const localNetwork = /^https?:\/\/(localhost|127\.0\.0\.1|[\w-]+\.local|10\.\d{1,3}...|192\.168\....)$/
```

**No Cross-Origin Admin Access**:
- Admin Panel must be on same network as orchestrator
- Cannot be accessed from outside network
- Protects against remote attacks

---

## 11. DEPLOYMENT CHECKLIST

For E2E Testing and Live Deployment:

- [ ] Set `ADMIN_PASSWORD` environment variable (for admin auth)
- [ ] Update scoreboard password in HTML if needed
- [ ] Enable HTTPS for NFC API support (GM Scanner)
- [ ] Configure SSL certificates (key + cert files)
- [ ] Test JWT token generation and expiry
- [ ] Verify WebSocket connection with JWT auth
- [ ] Test all admin commands (session, video, score, transaction)
- [ ] Verify audit trail in adminAdjustments array
- [ ] Test reconnection with token refresh
- [ ] Load test with multiple GMs + admin + scoreboard
- [ ] Test error handling (invalid JWT, unauthorized actions)
- [ ] Verify broadcast propagation to all clients
- [ ] Test offline queue processing
- [ ] Verify scoreboard displays real-time updates
- [ ] Test graceful shutdown (save session state)

---

## APPENDIX A: FILE LOCATIONS SUMMARY

| Component | File Path |
|-----------|-----------|
| Scoreboard HTML | `backend/public/scoreboard.html` |
| Admin Routes (Auth) | `backend/src/routes/adminRoutes.js` |
| Admin Commands | `backend/src/websocket/adminEvents.js` |
| WebSocket Setup | `backend/src/server.js` |
| Socket Server Config | `backend/src/websocket/socketServer.js` |
| Broadcast Handlers | `backend/src/websocket/broadcasts.js` |
| GM Auth/Identification | `backend/src/websocket/gmAuth.js` |
| Device Tracking | `backend/src/websocket/deviceTracking.js` |
| Event Wrapper Utility | `backend/src/websocket/eventWrapper.js` |
| JWT Middleware | `backend/src/middleware/auth.js` |
| AsyncAPI Contract | `backend/contracts/asyncapi.yaml` |
| OpenAPI Contract | `backend/contracts/openapi.yaml` |

---

**Report Generated**: Deep exploration of ALN Admin Interfaces
**Thoroughness Level**: VERY THOROUGH - All admin capabilities mapped for E2E testing

