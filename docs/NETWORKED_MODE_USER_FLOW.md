# ALNScanner Networked Mode: Complete User Flow Documentation

## Overview
This document traces the complete user experience from app launch to first token scan in ALNScanner's networked mode, including all UI screens, modal interactions, automatic transitions, and user-triggered button clicks.

**Key Characteristics:**
- Mode selection is **locked** once chosen - cannot switch during gameplay
- WebSocket connection to orchestrator backend handles real-time sync
- Admin panel (3 tabs) only visible in networked mode
- Automatic reconnection with exponential backoff (max 5 retries)
- Transaction queue with offline fallback for scan failures

---

## PHASE 1: APP INITIALIZATION (Automatic)

### Step 1.1: Page Load - DOMContentLoaded Event
**File:** `index.html` lines 1854-1882
**Trigger:** Browser loads page and fires DOMContentLoaded

```javascript
// Initialization sequence:
1. App.init() called
2. SessionModeManager created
3. UIManager initialized
4. Token database loaded
5. DataManager initialized
6. NFC support detected
7. Service worker registered
```

**Current Screen:** Loading (displayed by default in HTML)
**Visual:** "⏳ Loading token database..." message

### Step 1.2: Initial Screen Decision Logic
**File:** `src/app/initializationSteps.js` lines 152-194
**Decision Tree:**
```
Does user have saved mode from previous session?
├─ NO (first-time user)
│  └─> Show Game Mode Selection Screen
├─ YES (returning user)
│  └─> Is networked connection still valid?
│     ├─ NO (lost connection)
│     │  └─> Clear mode, show Game Mode Selection, show wizard
│     └─ YES (connection active)
│        └─> Proceed directly to Team Entry Screen
```

**For New Users:** Game Mode Screen appears
**For Returning Users:** 
- If connection valid: Team Entry appears
- If connection lost: Game Mode Screen + Connection Wizard appears

---

## PHASE 2: GAME MODE SELECTION

### Step 2.1: Game Mode Selection Screen Appears
**File:** `index.html` lines 1507-1551
**Trigger:** App initialization detects no saved mode OR user returns after connection loss

**Screen Details:**
- Header: "How are you playing today?" (white text)
- Two large buttons side-by-side:
  1. **🌐 Networked Game** - "With orchestrator server for multi-device coordination"
  2. **📱 Standalone Game** - "Scanner only, no server required"
- Buttons have hover effect (background changes to `rgba(255, 255, 255, 0.2)`)

**User Action:** Click **"Networked Game"** button
**Handler:** `App.selectGameMode('networked')` (line 115 in app.js)

### Step 2.2: SessionModeManager.setMode('networked') Called
**File:** `src/app/sessionModeManager.js` lines 7-26
**What Happens:**
1. Mode set to 'networked'
2. Mode **LOCKED** (cannot change during session)
3. Saved to localStorage: `gameSessionMode = 'networked'`
4. `initNetworkedMode()` called (line 28)

**Inside initNetworkedMode():**
```javascript
// Lines 28-42
1. Show view selector tabs (admin panel tabs become visible)
2. Create ConnectionManager instance
3. Call migrateLocalStorage() (upgrade old key formats)
4. Show Connection Wizard modal
```

**Screen Transition:** Game Mode Screen → Loading/Preparation
**Modal Appears:** Connection Wizard modal overlay

---

## PHASE 3: CONNECTION WIZARD MODAL

### Step 3.1: Connection Wizard Modal Displays
**File:** `index.html` lines 1377-1417
**Trigger:** Called by SessionModeManager.initNetworkedMode()

**Modal Structure:**
```
┌─────────────────────────────────────┐
│  🎮 Connect to Game Server          │
├─────────────────────────────────────┤
│  🔍 Scan for Game Servers [Button]  │ ← Highlighted
│  ✅ Found X game server(s)          │ ← Auto-populates
│  [Discovered server items]          │
│                                     │
│  ─── OR Enter Manually ───          │
│                                     │
│  Server Address:                    │
│  [Textbox] http://10.0.0.135:3000  │
│                                     │
│  Station Name:                      │
│  [Textbox] GM Station 1             │ ← Auto-incremented
│                                     │
│  GM Password:                       │
│  [Password box] ••••••••            │
│                                     │
│  [Connect Button] [Cancel Button]   │
└─────────────────────────────────────┘
```

### Step 3.2: Server Discovery (Automatic)
**File:** `index.html` lines 2068-2074
**Handler:** `scanForServers()` function

**What Happens:**
1. ConnectionManager initiates UDP broadcast discovery (port 8888)
2. Backend orchestrator responds with its IP/URL
3. Discovered servers displayed in modal
4. User can click "Select" on any discovered server

**Result:** Form auto-fills with selected server URL

### Step 3.3: Manual Configuration Fields

**Field 1: Server Address**
- Placeholder: `http://10.0.0.135:3000`
- Required: YES
- Auto-fills from discovery OR user enters manually
- Supports both URLs with protocol (`http://...`) and just IP:port
- Auto-normalization adds `http://` if missing

**Field 2: Station Name**
- Placeholder: `GM Station 1`
- Required: YES
- Auto-generated by incrementing saved `lastStationNum`
- User can override with custom name
- Used as device ID in WebSocket connection
- Stored for next station's auto-numbering

**Field 3: GM Password**
- Type: PASSWORD (hidden input)
- Placeholder: `Enter password`
- Required: YES
- Admin-configured password (hardcoded in backend or environment)
- Used for HTTP authentication (not WebSocket)

### Step 3.4: Connection Submission
**File:** `index.html` lines 1934-2051
**Handler:** `handleConnectionSubmit(event)` (form submit)

**Process:**

**Step 3.4a: Input Validation**
```javascript
// Lines 1943-1948
if (!serverUrl || !stationName || !password) {
    statusDiv.textContent = '⚠️ Please fill in all fields';
    return;
}
```
**Status Display:** Yellow warning text in modal

**Step 3.4b: URL Normalization**
```javascript
// Lines 1954-1959
if (!normalizedUrl.match(/^https?:\/\//i)) {
    normalizedUrl = `http://${normalizedUrl}`;
}
```
**Status Display:** `🔧 Using http://...`

**Step 3.4c: Health Check (3s timeout)**
```javascript
// Lines 1961-1970
GET /health endpoint test
```
**Status Display:** `⏳ Connecting...` (blue text)
**On Failure:** `❌ Server not responding` (red text) → Return to modal

**Step 3.4d: HTTP Authentication**
```javascript
// Lines 1972-1983
POST /api/admin/auth
Request: { password: "admin-secret" }
Response: { token: "eyJhbGc...", expiresIn: 86400 }
```
**On Success:** Receive JWT token
**On Failure:** `❌ Invalid password` (red text) → Return to modal

**Step 3.4e: Store Credentials (ConnectionManager)**
```javascript
// Lines 1987-2014
window.connectionManager.url = normalizedUrl;
window.connectionManager.token = token;
window.connectionManager.deviceId = stationName.replace(/\s+/g, '_');
window.connectionManager.stationName = stationName;

// Increment station number for next time
const match = stationName.match(/\d+$/);
if (match) {
    localStorage.setItem('lastStationNum', (parseInt(match[0]) + 1).toString());
}
```

**Step 3.4f: WebSocket Connection**
```javascript
// Lines 2006-2016
const connected = await window.connectionManager.connect();
```

**Inside ConnectionManager.connect()** (lines 132-209):
1. Check if URL configured
2. Health check (GET /health)
3. Validate JWT token
4. Create OrchestratorClient instance
5. Create NetworkedQueueManager (for transaction queueing)
6. Set up event handlers
7. Call `client.connect()` - Initiates WebSocket handshake

**WebSocket Handshake Details:**
```javascript
io.connect(url, {
  auth: {
    token: "JWT token from HTTP auth",
    deviceId: "GM_Station_1",
    deviceType: "gm",
    version: "1.0.0"
  }
})
```

**Server Response (Automatic):**
- Server validates JWT in handshake.auth (middleware)
- If valid: Connection accepted
- If invalid: Connection rejected, `connect_error` event
- If valid: Server immediately sends `sync:full` event with:
  ```javascript
  {
    session: {...},
    scores: {...},
    recentTransactions: [...],
    videoStatus: {...},
    devices: [...],
    systemStatus: {...}
  }
  ```

### Step 3.5: Connection Success
**File:** `index.html` lines 2018-2042

**If Connected Successfully:**
```javascript
// Status message in modal
statusDiv.textContent = '✅ Connected! Syncing data...';
statusDiv.style.color = '#4CAF50';

// Set up SessionModeManager
window.sessionModeManager.mode = 'networked';
window.sessionModeManager.locked = true;
localStorage.setItem('gameSessionMode', 'networked');

// Show view selector tabs (admin panel now visible)
document.getElementById('viewSelector').style.display = 'flex';

// After 1 second delay
// 1. Close connection modal
document.getElementById('connectionModal').style.display = 'none';
// 2. Show Team Entry screen
UIManager.showScreen('teamEntry');
```

**Screen Transition:** 
- Connection Modal closes (display: none)
- Team Entry Screen appears
- View Selector Tabs appear (Scanner | Admin | Debug)
- Connection Status indicator in header shows green dot "Connected"

**Time Elapsed:** ~2-3 seconds (depends on network)

---

## PHASE 4: TEAM ENTRY SCREEN

### Step 4.1: Team Entry Screen Displayed
**File:** `index.html` lines 1553-1570
**Trigger:** After successful connection, modal closes

**Screen Components:**

**Header Section:**
- Connection Status Indicator: Green dot + "Connected" text (clickable to show wizard again)
- Navigation Buttons: 📋 (History), 🏆 (Scoreboard - Black Market only), ⚙️ (Settings)
- Title: "Transaction Station"
- Mode Indicator: "Detective Mode" or "Black Market Mode" (green or orange pill, clickable to toggle)
- Device ID: "Device ID: 001"

**View Selector Tabs (NOW VISIBLE):**
- 📱 Scanner (active/highlighted)
- ⚙️ Admin
- 🐛 Debug

**Main Content Area:**

```
┌──────────────────────────┐
│  [Display: _]            │  ← Large display showing entered number
├──────────────────────────┤
│  [1] [2] [3]             │
│  [4] [5] [6]             │  ← 3x3 numeric keypad
│  [7] [8] [9]             │
│  [CLEAR] [0] [ENTER]     │
└──────────────────────────┘
```

**Visual Style:**
- Team display: 36px font, white text, gray background
- Numpad: Light gray buttons with hover effects
- Clear button: Yellow
- Enter button: Green

### Step 4.2: User Enters Team ID
**File:** `src/app/app.js` lines 93-112
**Trigger:** User clicks number buttons

**For Each Number Clicked:**
```javascript
App.appendNumber(num) // Line 93
  → this.currentTeamId += num (max 10 digits)
  → UIManager.updateTeamDisplay(this.currentTeamId)
  → Display updates: "1" → "12" → "123" etc.
```

**Display Updates Live:** Each digit appears immediately in large display

### Step 4.3: User Confirms Team ID
**Trigger:** Click **ENTER** button
**Handler:** `App.confirmTeamId()` (line 105)

```javascript
confirmTeamId() {
    if (this.currentTeamId.length > 0) {
        document.getElementById('currentTeam').textContent = this.currentTeamId;
        DataManager.clearSession();  // Clear any previous scan data
        UIManager.updateSessionStats();
        UIManager.showScreen('scan');  // Transition to scan screen
    }
}
```

**What Happens:**
1. Validate: Team ID must have at least 1 digit
2. Store team ID in App.currentTeamId
3. Clear any previous transaction data
4. Initialize stats for this team
5. Proceed to Scan Screen

**Screen Transition:** Team Entry → Scan Screen

**OR User Can:**
- Click **CLEAR** button to reset: `App.clearTeamId()` (line 100)
  - Clears currentTeamId
  - Display resets to "_"

---

## PHASE 5: SCAN SCREEN (READY TO SCAN)

### Step 5.1: Scan Screen Appears
**File:** `index.html` lines 1572-1595
**Status:** User has selected team, ready to scan tokens

**Header Section:**
- Connection Status: Green "Connected" indicator
- Mode Indicator: "Detective Mode" or "Black Market Mode" (clickable to toggle)
- Navigation buttons available

**Main Content:**
```
┌────────────────────────────┐
│  Team 123 Ready            │  ← Current team display
├────────────────────────────┤
│                            │
│     ╔════════════════╗    │
│     ║       📡      ║    │  ← Large NFC icon (pulse animation)
│     ║  Tap Memory   ║    │
│     ║    Token      ║    │
│     ║                ║    │
│     ║ Waiting for   ║    │
│     ║  NFC tag...   ║    │
│     ╚════════════════╝    │
│                            │
├────────────────────────────┤
│  [Start Scanning]          │  ← Blue button
│  [Manual Entry (Debug)]    │  ← Gray button
│  [Back to Team Entry]      │  ← Gray button
├────────────────────────────┤
│  Tokens: 0                 │  ← Stats row
│  Score: $0                 │  ← (or "Total Value" in Detective)
└────────────────────────────┘
```

**View Selector Tabs Still Visible:**
- User can switch to Admin tab while waiting to scan
- Admin tab shows session management, video controls, system status

### Step 5.2: User Initiates Scan
**Trigger:** Click **Start Scanning** button
**Handler:** `App.startScan()` (line 650 in app.js)

```javascript
// Line 660-677
button.disabled = true;
button.textContent = 'Scanning...';
status.textContent = 'Scanning... Tap a token';

// Calls NFCHandler.startScan() with callbacks
NFCHandler.startScan(
    (result) => this.processNFCRead(result),  // Success callback
    (err) => { /* error handling */ }         // Error callback
);
```

**Button State:** Start Scanning button disabled, text changes to "Scanning..."
**Status Text:** "Scanning... Tap a token"

**NFC Session Active:** Browser's Web NFC API reader is now listening for NDEF records

### Step 5.3a: Token Tap (NFC Read Success)
**Trigger:** User taps physical RFID/NFC token to device
**Handler:** NFCHandler's `reading` event (Web NFC API)

**NFC Data Flow:**
```javascript
// nfcHandler.js processes NDEF record
reader.onreading = (event) => {
    const message = event.message;
    const record = message.records[0];
    const text = new TextDecoder().decode(record.data);
    // Extract RFID: "534e2b03" or "53:4e:2b:03"
    handleScan(text);
}
```

**Result:** `processNFCRead(result)` called with RFID ID
**Example:** `result = { id: "534e2b03", source: "nfc", raw: "534e2b03" }`

### Step 5.3b: Token Processing Pipeline
**File:** `src/app/app.js` lines 690-730
**Handler:** `App.processNFCRead(result)`

**Validation 1: Team Selected**
```javascript
// Line 694-706
if (!this.currentTeamId || this.currentTeamId.trim() === '') {
    UIManager.showError('Please select a team before scanning tokens');
    // Reset button, return
}
```
**On Failure:** Error toast appears, scan button re-enabled

**Step 5.3b-I: Token ID Cleanup**
```javascript
// Line 709
const cleanId = result.id.trim();
// Handles: "534e2b03 " → "534e2b03"
//          "53:4e:2b:03" → "53:4e:2b:03"
```

**Step 5.3b-II: Fuzzy Token Lookup**
```javascript
// Line 713
const tokenData = TokenManager.findToken(cleanId);
```

**TokenManager.findToken()** performs:
- Exact match in database
- Case-insensitive match
- Format variations (with/without colons)
- Returns: `{ token: {...}, matchedId: "534e2b03" }`
- Not found: Returns `null`

**Example Token Data:**
```javascript
{
  "SF_RFID": "534e2b03",
  "SF_ValueRating": 3,          // 1-5 stars
  "SF_MemoryType": "Technical",  // Personal, Business, or Technical
  "SF_Group": "Server Logs (x5)"
}
```

**Step 5.3b-III: Duplicate Detection**
```javascript
// Line 718-723
const tokenId = tokenData ? tokenData.matchedId : cleanId;
if (DataManager.isTokenScanned(tokenId)) {
    this.showDuplicateError(tokenId);
    return;
}
```

**On Duplicate:**
- Button re-enabled
- Error screen shown: "Token Already Scanned"
- Prevents same token counted twice per team

### Step 5.3c: Transaction Recording
**File:** `src/app/app.js` lines 754-814
**Handler:** `App.recordTransaction(token, tokenId, isUnknown)`

**For FOUND Tokens:**
```javascript
recordTransaction(tokenData.token, tokenData.matchedId, false)
```

**For UNKNOWN Tokens:**
```javascript
recordTransaction(null, cleanId, true)
```

**Transaction Object Created:**
```javascript
{
  timestamp: "2025-10-27T14:30:45.123Z",
  deviceId: "GM_Station_1",
  mode: "blackmarket",  // or "detective"
  teamId: "123",
  rfid: "534e2b03",
  tokenId: "534e2b03",
  memoryType: "Technical",
  group: "Server Logs (x5)",
  valueRating: 3,
  isUnknown: false
}
```

**NETWORKED MODE SPECIFIC (Lines 769-786):**
```javascript
// DON'T add to DataManager yet (wait for backend confirmation)
DataManager.markTokenAsScanned(tokenId);  // Prevent duplicates

// Queue transaction for WebSocket submission
window.queueManager.queueTransaction({
  tokenId: "534e2b03",
  teamId: "123",
  deviceId: "GM_Station_1",
  mode: "blackmarket",
  timestamp: "2025-10-27T14:30:45.123Z"
});
```

**Transaction Queuing Process** (NetworkedQueueManager):
1. Add to pending queue (localStorage backup)
2. Try to send via WebSocket immediately
3. If connection lost: Keep retrying with exponential backoff
4. On reconnect: Auto-flush all queued transactions
5. Backend deduplicates by tokenId+teamId+timestamp

**Scoring (Black Market Mode Only):**
```javascript
// Line 803-806
if (Settings.mode === 'blackmarket' && !isUnknown) {
  const score = DataManager.calculateTokenValue(transaction);
  // Score = ValueRating * MemoryTypeMultiplier * GroupMultiplier
  // Example: 3 (rating) * 5 (technical) * 5 (group) = $375
}
```

**Scoring Formula:**
```
Score = ValueRating * MemoryTypeMultiplier * GroupMultiplier

MemoryTypeMultiplier:
  - Personal: 1x
  - Business: 3x
  - Technical: 5x
  - UNKNOWN: 0x

GroupMultiplier: Extracted from group name (e.g., "Group Name (x5)" → 5x)
```

### Step 5.4: Result Screen Displayed
**File:** `src/app/app.js` line 809 & `src/ui/uiManager.js` lines 252-420
**Handler:** `UIManager.showTokenResult(token, tokenId, isUnknown)`

**Screen Shows:**
```
┌──────────────────────────┐
│  ✅ Transaction Complete!│  ← Green header
├──────────────────────────┤
│  Token Details           │
│                          │
│  RFID: 534e2b03         │
│  Memory Type: Technical  │
│  Group: Server Logs      │
│  Value Rating: ⭐⭐⭐   │
├──────────────────────────┤
│  [Scan Another Token]    │  ← Continue scanning
│  [Finish Team]           │  ← Done with this team
└──────────────────────────┘
```

**For UNKNOWN Tokens:**
```
┌──────────────────────────┐
│  ⚠️ Unknown Token        │  ← Yellow/Orange header
├──────────────────────────┤
│  RFID: abc123def        │
│  Memory Type: UNKNOWN    │
│  Group: Not in Database  │
│  Value: Not Scored       │
└──────────────────────────┘
```

**For DUPLICATES:**
```
┌──────────────────────────┐
│  ❌ Token Already Scanned│  ← Red header
├──────────────────────────┤
│  This token has been used│
│  ID: 534e2b03           │
│  No points awarded       │
└──────────────────────────┘
```

### Step 5.5: User Options After Scan
**File:** `index.html` lines 1621-1622

**Option 1: Scan Another Token**
**Button:** "Scan Another Token"
**Handler:** `App.continueScan()` (line 834)
```javascript
UIManager.updateSessionStats();  // Update stats display
UIManager.showScreen('scan');    // Return to scan screen
```
**Flow:** Return to Scan Screen (Step 5.1) - user can scan next token for same team

**Option 2: Finish Team**
**Button:** "Finish Team"
**Handler:** `App.finishTeam()` (line 839)
```javascript
this.currentTeamId = '';
DataManager.clearSession();
UIManager.updateTeamDisplay('');
UIManager.showScreen('teamEntry');
```
**Flow:** Return to Team Entry Screen - can select new team

---

## PHASE 6: ADMIN PANEL (OPTIONAL - NETWORKED MODE ONLY)

### Step 6.1: Switch to Admin Tab
**Trigger:** User clicks ⚙️ **Admin** tab (visible only in networked mode)
**Handler:** `App.switchView('admin')` (line 146 in app.js)

**What Happens:**
1. All `.view-content` divs hidden
2. `#admin-view` shown
3. Tab highlighting updated
4. Admin modules initialized (first time only)
5. `systemMonitor.refresh()` called

**Screen Transition:** Scanner View → Admin View

**Admin View Shows Three Sections:**

### Step 6.2: Session Management Section
**HTML:** `index.html` lines 1727-1733
**Container:** `#session-status-container` (dynamically rendered)

**Session Management Features:**

**Create New Session:**
```javascript
// App.adminCreateSession() - Line 236
const name = prompt('Enter session name:');
await adminInstances.sessionManager.createSession(name, ['001', '002', '003']);
```

**Prompt:** "Enter session name:" dialog
**Input:** Session name (e.g., "Game Night - Team 5")
**Backend Sends:** `gm:command` event with `action: 'session:create'`
**Wait:** 5-second timeout for `gm:command:ack`
**Success:** Session state updated via `session:update` broadcast

**Session Control Buttons:**
- Pause Session: `App.adminPauseSession()`
- Resume Session: `App.adminResumeSession()`
- End Session: `App.adminEndSession()` (asks for confirmation)

**Session Display** (populated by MonitoringDisplay):
```
Session: "Game Night Round 1"
Status: ACTIVE
Start Time: 2025-10-27 14:30:45
Teams: 3 (001, 002, 003)
Total Scans: 42
Connected Stations: 2 GM + 1 Player
```

### Step 6.3: Video Controls Section
**HTML:** `index.html` lines 1736-1777
**Container:** Dynamically updated by admin modules

**Video Display:**
- Current: Shows currently playing video filename
- Queue: Shows number of queued videos

**Video Control Buttons:**
- Play: `App.adminPlayVideo()`
- Pause: `App.adminPauseVideo()`
- Stop: `App.adminStopVideo()`
- Skip: `App.adminSkipVideo()`

**Manual Queue Control:**
- Input: Video filename (e.g., "jaw001.mp4")
- Autocomplete: Dropdown from available videos
- Add to Queue: Queues video for VLC playback
- Clear Queue: Empties entire queue (confirmation required)

**Video Progress:**
- Progress bar shows current playback position
- Time display: "45s / 120s"

### Step 6.4: System Status Section
**HTML:** `index.html` lines 1781-1799

**Status Indicators:**
- 🟢 Orchestrator: Green = Connected, Red = Disconnected
- 🟢 VLC: Green = Ready, Red = Error/Disconnected
- Connected Devices: List with device IDs and types

**Device List Example:**
```
GM_Station_1      [GM Scanner]
GM_Station_2      [GM Scanner]
Player_Device_1   [Player Scanner]
```

### Step 6.5: Admin Operations
**HTML:** `index.html` lines 1801-1815

**Available Operations:**
- Reset All Scores: `App.adminResetScores()` (confirmation + sync across all scanners)
- Clear Transaction Log: `App.adminClearTransactions()` (confirmation)

**Data Persistence:**
- Changes synced to backend via WebSocket
- All connected scanners notified via broadcasts
- Scores recalculated on affected devices

---

## PHASE 7: ALTERNATIVE FLOWS

### 7.1: Connection Lost During Scan
**Scenario:** Network disconnects while token queued

**Automatic Behavior:**
1. Transaction queued in local localStorage
2. ConnectionManager detects disconnect
3. Status indicator turns orange "Connecting..."
4. Exponential backoff retry (5s, 10s, 20s, etc., max 5 retries)
5. On reconnect: NetworkedQueueManager auto-flushes queue
6. Transactions submitted to backend
7. Status indicator turns green "Connected"

**User Experience:** No action needed - everything handled automatically

### 7.2: Manual Entry (Testing Without NFC)
**Trigger:** Click **Manual Entry (Debug)** button on Scan Screen
**Handler:** `App.manualEntry()` (line 816)

```javascript
const rfid = prompt('Enter RFID manually:');
if (rfid && rfid.trim()) {
    this.processNFCRead({
        id: rfid.trim(),
        source: 'manual',
        raw: rfid.trim()
    });
}
```

**Use Case:** Testing without NFC hardware
**Flow:** Same as NFC scan, bypasses Web NFC API

### 7.3: Connection Wizard (Reconnection)
**Trigger:** User clicks status indicator "Disconnected" or reconnection fails
**Handler:** `showConnectionWizard()` (line 2068)

**Same modal as Step 3, but:**
- Pre-filled with previous URL/station name
- Can update password if changed
- Can select different server

**Use Case:** 
- Session lost
- Admin password changed
- Server moved to different IP
- User switches between orchestrators

### 7.4: Settings Screen
**Trigger:** Click ⚙️ **Settings** button in header
**Handler:** `App.showSettings()` (line 53)

**Settings Available:**
- Device ID: Station identifier (default: "001")
- Station Mode: Toggle between Detective/Black Market
- Data Management:
  - Export JSON: Download all transactions
  - Export CSV: Excel-compatible export
  - Clear All Data: Wipe local storage

**For Networked Mode:**
- Network settings managed via connection wizard
- Cannot reconfigure while connected

---

## PHASE 8: REAL-TIME SYNCHRONIZATION (NETWORKED MODE)

### 8.1: WebSocket Events Received
**File:** `src/network/orchestratorClient.js`

**Event Type 1: sync:full** (on connect + periodically)
```javascript
{
  session: { id, name, status, startTime, scores: {...} },
  scores: { "001": 5000, "002": 3200, ... },
  recentTransactions: [...],
  videoStatus: { current, queue: [...], progress },
  devices: [...],
  systemStatus: { vlc: "connected", ... }
}
```
**Handled By:** AdminModule.SessionManager, VideoController, SystemMonitor

**Event Type 2: session:update** (when session state changes)
```javascript
{
  id, name, status, startTime, endTime,
  metadata: { totalScans, uniqueTokensScanned }
}
```
**Handled By:** AdminModule.SessionManager (updates currentSession)

**Event Type 3: transaction:new** (when any device submits scan)
```javascript
{
  id, tokenId, teamId, memoryType, group,
  score, bonus, isBonus, deviceId, timestamp
}
```
**Handled By:** DataManager (updates backend scores)

**Event Type 4: video:status** (video state changes)
```javascript
{
  current: "jaw001.mp4",
  queue: ["jaw002.mp4", "jaw003.mp4"],
  playing: true,
  progress: { current: 45, total: 120 }
}
```
**Handled By:** AdminModule.VideoController (updates UI)

### 8.2: Automatic UI Updates
**File:** `src/utils/adminModule.js` lines 300-400 (MonitoringDisplay class)

**Updates Happen When:**
- `session:update` event received → SessionManager updates currentSession
- `transaction:new` event received → Scoreboard refreshes
- `video:status` event received → Video controls update
- `device:connected/disconnected` → Device list updates

**No User Action Required** - Everything event-driven

---

## COMPLETE USER FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│ PAGE LOAD (DOMContentLoaded)                                   │
│ • Load token database                                          │
│ • Initialize SessionModeManager                               │
│ • Detect NFC support                                          │
│ • Register service worker                                      │
└────────────────────┬────────────────────────────────────────────┘
                     │
        ┌────────────▼────────────┐
        │ Check saved mode?       │
        ├────────────┬────────────┤
    NO  │            │       YES  │
        │            │            │
   ┌────▼─┐      ┌────▼─────────────┐
   │Game  │      │Connection Ready?  │
   │Mode  │      ├────────┬──────────┤
   │      │  YES  │        │     NO   │
   └────┬─┘       │    ┌───▼─┐ ┌──────▼─┐
        │     ┌───▼──┐ │Team │ │Connection
        │     │Team  │ │Entry│ │Wizard
        │     │Entry │ └─────┘ │
        │     └──────┘         └──────┬─┐
        │                             │ │
   ┌────▼─────────────────────────────▼─┘
   │ Game Mode Selection Screen         │
   │ • Networked Game                   │
   │ • Standalone Game                  │
   └────────┬────────────────────────────┘
            │ (User clicks "Networked")
            │
   ┌────────▼──────────────────────────┐
   │ SessionModeManager.setMode()       │
   │ • Lock mode                        │
   │ • Show tabs                        │
   │ • Show wizard                      │
   └────────┬──────────────────────────┘
            │
   ┌────────▼────────────────────────────┐
   │ Connection Wizard Modal             │
   │ • Scan for servers OR              │
   │ • Manual config:                    │
   │   - Server URL                      │
   │   - Station Name                    │
   │   - GM Password                     │
   └────────┬────────────────────────────┘
            │ (User clicks "Connect")
            │
   ┌────────▼──────────────────────────────────┐
   │ ConnectionManager.connect()               │
   │ • Health check → Auth → WebSocket → Sync │
   └────────┬───────────────────────────────────┘
            │
   ┌────────▼────────────────────────────┐
   │ Modal closes                        │
   │ • Show Team Entry Screen            │
   │ • Show Admin tabs (Scanner/Admin)   │
   │ • Status = Green "Connected"        │
   └────────┬────────────────────────────┘
            │
   ┌────────▼──────────────────────────┐
   │ Team Entry Screen                 │
   │ User enters: 123                   │
   └────────┬──────────────────────────┘
            │ (User clicks ENTER)
            │
   ┌────────▼──────────────────────────┐
   │ Scan Screen                       │
   │ Waiting for NFC tap               │
   └────────┬──────────────────────────┘
            │
        ┌───┴────┐
        │         │
   ┌────▼──┐  ┌──▼────────────────┐
   │Tap NFC│  │Switch to Admin tab │
   │Token  │  │(optional)          │
   └────┬──┘  └────────────────────┘
        │
   ┌────▼──────────────────────────┐
   │ ProcessNFCRead()              │
   │ • Validate team selected       │
   │ • Fuzzy match token           │
   │ • Check duplicate             │
   │ • Queue transaction           │
   └────┬──────────────────────────┘
        │
   ┌────▼──────────────────────────┐
   │ Result Screen                 │
   │ Shows token details           │
   └────┬──────────────────────────┘
        │
    ┌───┴──────┐
    │           │
┌───▼──────┐ ┌──▼──────────┐
│Scan More │ │Finish Team  │
└───┬──────┘ └──┬───────────┘
    │           │
    │      ┌────▼────────────┐
    │      │Team Entry Again │
    │      └──────────────────┘
    │
 └─────────┘
```

---

## SUMMARY TABLE: USER ACTIONS & SCREEN TRANSITIONS

| Screen | User Action | Handler | Result |
|--------|-------------|---------|--------|
| Game Mode | Click "Networked Game" | `App.selectGameMode('networked')` | → Connection Wizard |
| Connection Wizard | Fill form + Click Connect | `handleConnectionSubmit()` | → Team Entry (if connected) |
| Team Entry | Number pad: 1,2,3 + ENTER | `App.confirmTeamId()` | → Scan Screen |
| Team Entry | Click CLEAR | `App.clearTeamId()` | Display resets, stay on screen |
| Scan | Click "Start Scanning" | `App.startScan()` | NFC listener active |
| Scan | Tap NFC token | `processNFCRead()` | → Result Screen |
| Scan | Click "Manual Entry" | `App.manualEntry()` | Prompt for RFID → Result Screen |
| Result | Click "Scan Another Token" | `App.continueScan()` | → Scan Screen |
| Result | Click "Finish Team" | `App.finishTeam()` | → Team Entry |
| Any | Click Admin tab | `App.switchView('admin')` | → Admin View |
| Admin | Click "Create Session" | `App.adminCreateSession()` | Prompt name → WebSocket → State update |
| Any | Click Settings button | `App.showSettings()` | → Settings Screen |
| Any | Click History button | `App.showHistory()` | → History/Transactions Screen |
| Any | Click Scoreboard (BM) | `App.showScoreboard()` | → Scoreboard Screen |

---

## KEY TIMING DETAILS

| Action | Duration | Notes |
|--------|----------|-------|
| Server discovery (UDP) | 100-500ms | Automatic, can skip to manual |
| Health check | 3s timeout | Parallel to other checks |
| HTTP authentication | 1-2s | If password correct |
| WebSocket connection | 1-3s | Depends on latency |
| Auto-sync (sync:full) | Immediate | Server sends on connect |
| Modal to Team Entry | 1000ms | Artificial delay for UX |
| NFC scan read | 50-200ms | Depends on device/tag |
| Transaction queue to server | <500ms | Async, doesn't block UI |
| Retry with backoff | 5s → 10s → 20s → ... | Exponential, max 5 attempts |

---

## CRITICAL BEHAVIORAL NOTES

### Mode Locking
Once user selects "Networked" mode:
- `sessionModeManager.locked = true`
- Cannot switch to standalone without page reload
- Prevents mode confusion during active gameplay

### Offline Transaction Handling
- Queued locally if send fails
- Auto-retry on reconnect
- Backend deduplicates by (tokenId + teamId + timestamp)
- User sees no interruption

### Admin Panel Initialization
- Only created when first accessing Admin tab
- Requires active WebSocket connection
- SessionManager listens to broadcasts for state updates
- MonitoringDisplay auto-refreshes on events

### Token Duplicate Prevention
- Flagged by checking `DataManager.scannedTokens` Set
- Persists across team entries in same session
- Can only be cleared by:
  - GM intervention (delete transaction)
  - End session / start new session

### Connection Status Indicator
- Green + "Connected": WebSocket active
- Orange + "Connecting...": Attempting to reconnect
- Red + "Disconnected": All retries exhausted
- Clickable: Opens connection wizard to reconfigure

---

## ERROR HANDLING FLOWS

### Missing Fields in Connection Wizard
**Error:** User leaves any field empty
**Display:** Yellow warning "⚠️ Please fill in all fields"
**Action:** User fills in, tries again

### Server Unreachable
**Error:** Health check fails (3s timeout)
**Display:** Red error "❌ Server not responding"
**Action:** User checks IP, tries different server, or uses manual entry

### Invalid Password
**Error:** HTTP auth fails
**Display:** Red error "❌ Invalid password"
**Action:** User re-enters correct password

### Connection Lost Mid-Session
**Automatic:** 
- Transaction queued locally
- ConnectionManager retries with backoff
- On reconnect: NetworkedQueueManager flushes queue
- User can keep scanning - no action needed

### Token Not in Database
**Display:** Result screen with "UNKNOWN" label
**Score:** Assigned as 0 points
**Recording:** Still logged, can be GM-reviewed

### Duplicate Token Scanned
**Display:** Result screen "❌ Token Already Scanned"
**Score:** 0 points, no bonus
**Action:** User taps different token

---

## FILE REFERENCES SUMMARY

### Initialization & Mode Selection
- `/src/app/app.js` - Main app coordinator (init, selectGameMode, startScan, etc.)
- `/src/app/sessionModeManager.js` - Mode locking logic
- `/src/app/initializationSteps.js` - Phased startup sequence

### Connection & Authentication
- `/src/network/connectionManager.js` - JWT auth, health checks, retry logic
- `/src/network/orchestratorClient.js` - WebSocket client, event handlers
- `/index.html` lines 1934-2051 - Connection form, wizard modal

### UI & Screen Management
- `/src/ui/uiManager.js` - Screen transitions, error display
- `/index.html` lines 1377-1823 - All screens & view selector tabs

### Admin Panel
- `/src/utils/adminModule.js` - SessionManager, VideoController, SystemMonitor, MonitoringDisplay
- `/index.html` lines 1725-1817 - Admin view HTML structure

### Scanning & Transactions
- `/src/utils/nfcHandler.js` - Web NFC API wrapper
- `/src/network/networkedQueueManager.js` - Transaction queueing & retry
- `/src/core/tokenManager.js` - Token database & fuzzy matching
- `/src/core/dataManager.js` - Scoring, group completion detection

### Styling
- `/index.html` lines 7-1373 - All CSS (inline)
- Modal styles: lines 1220-1373
- Screen visibility: lines 239-246

