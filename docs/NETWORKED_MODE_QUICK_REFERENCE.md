# ALNScanner Networked Mode: Quick Reference Guide

## Mode Selection (Step 1 - Automatic)
**Trigger:** Page load or app initialization
**Result:** Two options shown - "Networked Game" or "Standalone Game"

## Selecting Networked Mode (Step 2)
**Action:** Click "🌐 Networked Game" button
**What happens:**
- Mode locked (cannot change)
- Saved to localStorage
- Connection Wizard modal opens

## Connection Wizard Form (Step 3)
**Three required fields:**
1. **Server Address** - e.g., `http://192.168.1.100:3000`
   - Can auto-discover via button "🔍 Scan for Game Servers"
   - Auto-normalizes missing protocol
   - Required: YES

2. **Station Name** - e.g., `GM Station 1`
   - Auto-incremented for multiple stations
   - Used as device identifier in WebSocket
   - Required: YES

3. **GM Password** - e.g., `admin-secret`
   - Admin authentication (not visible while typing)
   - Required: YES

**Process Steps:**
```
1. User fills form
2. Click "Connect" button
3. Health check (GET /health) - 3s timeout
4. HTTP authentication (POST /api/admin/auth) - returns JWT token
5. Store credentials in ConnectionManager
6. WebSocket handshake with JWT token
7. Server sends sync:full event (auto-sync state)
8. Modal closes after 1s delay
9. Team Entry screen appears
10. Admin tabs become visible
```

**Errors & Recovery:**
- Missing fields → Yellow warning → Fill in and retry
- Server unreachable → Red error → Verify IP, try manual entry
- Invalid password → Red error → Re-enter correct password
- All auto-recovered with exponential backoff (max 5 retries)

## Team Entry Screen (Step 4)
**Action:** Enter numeric team ID via keypad
- Click 1, 2, 3... to enter digits (max 10 digits)
- Click CLEAR to reset
- Click ENTER to confirm

**Display:** Large number shows as entered: `_` → `1` → `12` → `123`

**On Enter:** Team Entry transitions to Scan Screen

## Scan Screen (Step 5)
**Status:** "Team XXX Ready" shows at top

**Three ways to submit token:**

### Method 1: NFC Tap (Recommended)
1. Click "Start Scanning" button
2. Tap physical NFC token to device
3. Token auto-reads via Web NFC API
4. Result screen shown

### Method 2: Manual Entry (Testing)
1. Click "Manual Entry (Debug)" button
2. Prompt appears: "Enter RFID manually"
3. Type RFID ID (e.g., "534e2b03")
4. Result screen shown

### Method 3: Back to Team
1. Click "Back to Team Entry"
2. Return to team selection screen
3. Can enter different team ID

## Result Screen (Step 6)
**Shows token details:**
- RFID / ID
- Memory Type (Personal, Business, Technical, or UNKNOWN)
- Group name
- Value rating

**Two options:**
1. "Scan Another Token" → Return to Scan Screen (same team)
2. "Finish Team" → Return to Team Entry (new team or exit)

## Admin Panel (Optional - Step 7)

### Accessing Admin Panel
- Visible only in networked mode (3 tabs: Scanner, Admin, Debug)
- Click **⚙️ Admin** tab (appears in header, not on scanner view)

### Session Management
**Create Session:**
- Click button → Prompt for name → Sends WebSocket command → Backend creates session

**Session Controls:**
- Pause: Temporarily stops scoring
- Resume: Continues session
- End: Closes session (confirmation required)

### Video Controls
**Manage playback:**
- Play / Pause / Stop / Skip buttons
- Manual queue: Add video files to queue
- Clear queue: Empty all queued videos

### System Status
**Monitor system:**
- Orchestrator status (connected/disconnected)
- VLC status (ready/error)
- Connected devices list

### Admin Operations
**Dangerous operations:**
- Reset All Scores: Clears all team scores
- Clear Transactions: Removes transaction history
(Both require confirmation)

## Real-Time Synchronization

**Automatic broadcasts from backend:**
- `sync:full` - Initial state on connect
- `session:update` - Session state changes
- `transaction:new` - New scan submitted
- `video:status` - Video playback changes
- `device:connected/disconnected` - Device tracking

**Updates happen automatically - no user action required**

## Connection Lost / Offline

**Automatic behavior:**
1. Transaction queued in localStorage
2. Status indicator turns orange "Connecting..."
3. ConnectionManager retries automatically (exponential backoff)
4. On reconnect: Queue auto-flushes, status turns green
5. User can keep scanning - everything works offline

## Alternative Actions

### Reconnect / Change Server
- Click green "Connected" status dot in header
- Connection Wizard re-opens with pre-filled details
- Can update server URL, station name, or password

### View Transaction History
- Click 📋 button in header
- Shows all scans, filters, statistics
- Can export to JSON or CSV

### View Scoreboard (Black Market Mode Only)
- Click 🏆 button in header
- Shows team rankings with scores
- Click team to see detailed breakdown

### Change Game Mode
- Click mode indicator (detective/blackmarket pill)
- Toggles between modes
- Applies to all scans from that point forward

### Access Settings
- Click ⚙️ button in header
- Configure device ID
- Toggle mode
- Export/clear data

## Key Differences: Networked vs Standalone

| Feature | Networked | Standalone |
|---------|-----------|-----------|
| Admin Panel | YES (Session/Video/System) | NO |
| Real-time Sync | YES (WebSocket) | NO |
| Video Control | YES (VLC via backend) | NO |
| View Tabs | 3 tabs (Scanner/Admin/Debug) | Single view |
| Multi-Device | YES (synced) | Each independent |
| Offline Support | YES (queue + retry) | YES (always offline) |
| Transaction Queue | YES (WebSocket) | Local storage only |
| Scoreboard | YES (from backend) | Local calculation |

## Error Messages & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Please fill in all fields" | Empty form field | Complete all 3 fields |
| "Server not responding" | Server unreachable | Check IP, verify server running |
| "Invalid password" | Wrong password | Re-enter correct admin password |
| "Connection failed" | Network issue | Retry, move closer to WiFi |
| "Token Already Scanned" | Duplicate token | Scan different token |
| "Please select a team" | No team entered | Go back and enter team ID |
| "Unknown Token" | Not in database | Token ID not found - still recorded |

## File Locations (For Developers)

**User Flow Logic:**
- `/js/app/app.js` - Main coordinator
- `/js/app/sessionModeManager.js` - Mode selection
- `/js/app/initializationSteps.js` - Startup sequence

**Connection & Auth:**
- `/js/network/connectionManager.js` - JWT auth, health checks
- `/js/network/orchestratorClient.js` - WebSocket client
- `/index.html` lines 1934-2051 - Connection form

**Scanning:**
- `/js/utils/nfcHandler.js` - NFC API wrapper
- `/js/core/tokenManager.js` - Token lookup & matching
- `/js/network/networkedQueueManager.js` - Transaction queue

**Admin Panel:**
- `/js/utils/adminModule.js` - Session, Video, System management
- `/index.html` lines 1725-1817 - Admin view HTML

## Troubleshooting Checklist

- [ ] Page fully loaded (no console errors)
- [ ] Token database loaded successfully
- [ ] Mode selection shows (Game Mode Screen)
- [ ] Connection Wizard appears after selecting Networked
- [ ] Server URL discovered or manually entered
- [ ] Health check passes (3s timeout)
- [ ] Password correct (HTTP auth succeeds)
- [ ] WebSocket handshake succeeds
- [ ] Team Entry screen shows with numeric keypad
- [ ] Team ID entered and confirmed
- [ ] Scan Screen shows "Team XXX Ready"
- [ ] NFC tap or manual entry works
- [ ] Result screen shows token details
- [ ] Continue Scan or Finish Team buttons work
- [ ] Admin tab accessible (if needed)

