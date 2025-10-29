# ALNScanner Networked Mode: Visual Guide

## Screen-by-Screen Walkthrough

### SCREEN 1: Game Mode Selection
```
╔════════════════════════════════════╗
║   About Last Night Scanner         ║
╠════════════════════════════════════╣
║                                    ║
║   How are you playing today?       ║
║                                    ║
║   ┌──────────────┐   ┌──────────┐ ║
║   │  🌐 NETWORK  │   │  📱 LOCAL │ ║
║   │   GAME       │   │   GAME    │ ║
║   │              │   │           │ ║
║   │ Orchestrator │   │ Standalone│ ║
║   │   Server     │   │   Mode    │ ║
║   └──────────────┘   └──────────┘ ║
║                                    ║
║   USER CLICKS: 🌐 Networked Game  ║
╚════════════════════════════════════╝
                  ↓
           (Mode LOCKED)
           (Wizard appears)
```

### SCREEN 2: Connection Wizard Modal
```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🎮 Connect to Game Server       ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                  ┃
┃  🔍 Scan for Game Servers        ┃ ← Click for auto-discovery
┃  ✅ Found 1 game server(s)       ┃
┃                                  ┃
┃  ┌──────────────────────────────┐┃
┃  │ 🎮 Game Server at 192.168... ││
┃  │                [SELECT]       ││
┃  └──────────────────────────────┘┃
┃                                  ┃
┃  ─── OR Enter Manually ───       ┃
┃                                  ┃
┃  Server Address:                 ┃
┃  [http://192.168.1.100:3000    ] ┃ ← Auto-filled or manual
┃                                  ┃
┃  Station Name:                   ┃
┃  [GM Station 1                 ] ┃ ← Auto-numbered
┃                                  ┃
┃  GM Password:                    ┃
┃  [••••••••                      ] ┃ ← Hidden input
┃                                  ┃
┃  [  CONNECT  ]  [  CANCEL  ]     ┃
┃                                  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                  ↓
        (Health Check)
        (Auth → JWT Token)
        (WebSocket Handshake)
        (Auto-sync from backend)
```

### SCREEN 3: Team Entry
```
╔════════════════════════════════════════════╗
║ 🟢 Connected | Detective Mode | 📋 🏆 ⚙️ ║
║ Device ID: 001                             ║
╠════════════════════════════════════════════╣
║                                            ║
║   📱 Scanner  |  ⚙️ Admin  |  🐛 Debug   ║  ← Tabs visible
║                                            ║
║   ┌──────────────────────────────┐        ║
║   │  _                           │        ║  ← Display (empty)
║   └──────────────────────────────┘        ║
║                                            ║
║   ┌───────────────────────────────┐       ║
║   │  [1]  [2]  [3]               │       ║
║   │  [4]  [5]  [6]               │       ║  ← Keypad
║   │  [7]  [8]  [9]               │       ║
║   │ [CLR] [0] [ENTER]            │       ║
║   └───────────────────────────────┘       ║
║                                            ║
╚════════════════════════════════════════════╝

INPUT SEQUENCE:
  1 → [1]
  1 2 3 → [123]
  ENTER → Next screen
```

### SCREEN 4: Scan Ready
```
╔════════════════════════════════════════════╗
║ 🟢 Connected | Detective Mode              ║
╠════════════════════════════════════════════╣
║                                            ║
║   📱 Scanner  |  ⚙️ Admin  |  🐛 Debug   ║
║                                            ║
║   Team 123 Ready                           ║
║                                            ║
║       ╔════════════════╗                   ║
║       ║       📡      ║                   ║
║       ║  Tap Memory   ║                   ║
║       ║    Token      ║                   ║
║       ║                ║                   ║
║       ║ Waiting for   ║                   ║
║       ║  NFC tag...   ║                   ║
║       ╚════════════════╝                   ║
║                                            ║
║   ┌────────────────────────────────┐      ║
║   │  [Start Scanning]              │ ← Click to activate NFC
║   │  [Manual Entry (Debug)]        │ ← Type RFID manually
║   │  [Back to Team Entry]          │ ← Change team
║   └────────────────────────────────┘      ║
║                                            ║
║   Tokens: 0          Score: $0             ║  ← Live stats
║                                            ║
╚════════════════════════════════════════════╝

FLOW:
  User clicks "Start Scanning"
           ↓
  Browser waits for NFC tap
           ↓
  User taps physical token
           ↓
  Web NFC API reads RFID
           ↓
  processNFCRead() processes
           ↓
  Result screen
```

### SCREEN 5: Result (Success)
```
╔════════════════════════════════════════════╗
║ 🟢 Connected | Detective Mode              ║
╠════════════════════════════════════════════╣
║                                            ║
║   📱 Scanner  |  ⚙️ Admin  |  🐛 Debug   ║
║                                            ║
║   ┌────────────────────────────────┐      ║
║   │ ✅ Transaction Complete!       │ ← Green header
║   └────────────────────────────────┘      ║
║                                            ║
║   Token Details                            ║
║   ─────────────────────────────────        ║
║   RFID:        534e2b03                    ║
║   Memory Type: Technical                   ║
║   Group:       Server Logs                 ║
║   Value:       ⭐⭐⭐  (3 stars)          ║
║                                            ║
║   ┌────────────────────────────────┐      ║
║   │  [Scan Another Token]          │ ← Same team
║   │  [Finish Team]                 │ ← New team
║   └────────────────────────────────┘      ║
║                                            ║
╚════════════════════════════════════════════╝
```

### SCREEN 5b: Result (Unknown Token)
```
╔════════════════════════════════════════════╗
║                                            ║
║   ┌────────────────────────────────┐      ║
║   │ ⚠️  Unknown Token              │ ← Orange header
║   └────────────────────────────────┘      ║
║                                            ║
║   Token Details                            ║
║   ─────────────────────────────────        ║
║   RFID:        xyz123abc                   ║
║   Memory Type: UNKNOWN                     ║
║   Group:       Not in Database             ║
║   Score:       Not Scored (0 points)       ║
║                                            ║
║   Note: Token ID recorded but not scored   ║
║                                            ║
╚════════════════════════════════════════════╝
```

### SCREEN 5c: Result (Duplicate)
```
╔════════════════════════════════════════════╗
║                                            ║
║   ┌────────────────────────────────┐      ║
║   │ ❌ Token Already Scanned       │ ← Red header
║   └────────────────────────────────┘      ║
║                                            ║
║   This token has been used                 ║
║   ID: 534e2b03                             ║
║   No points awarded                        ║
║                                            ║
║   (Prevent duplicate scoring)              ║
║                                            ║
╚════════════════════════════════════════════╝
```

### SCREEN 6: Admin Panel
```
╔════════════════════════════════════════════╗
║ 🟢 Connected | Detective Mode              ║
╠════════════════════════════════════════════╣
║                                            ║
║   📱 Scanner  | ⚙️ Admin ← CLICKED |🐛 Debug
║                                            ║
║   ┌────────────────────────────────┐      ║
║   │ Session Management             │      ║
║   │ ────────────────────────────   │      ║
║   │ Session: Game Night Round 1    │      ║
║   │ Status: ACTIVE                 │      ║
║   │ Start: 2025-10-27 14:30:45    │      ║
║   │ Teams: 3 (001, 002, 003)       │      ║
║   │ Total Scans: 42                │      ║
║   │                                │      ║
║   │ [Create] [Pause] [Resume] [End]│      ║
║   └────────────────────────────────┘      ║
║                                            ║
║   ┌────────────────────────────────┐      ║
║   │ Video Controls                 │      ║
║   │ ────────────────────────────   │      ║
║   │ Current: jaw001.mp4            │      ║
║   │ Queue: 3 videos                │      ║
║   │ Progress: ███░░░░░ 45s / 120s │      ║
║   │                                │      ║
║   │ [Play] [Pause] [Stop] [Skip]   │      ║
║   │                                │      ║
║   │ Manual: [jaw003.mp4] [Add]     │      ║
║   │ [Clear Queue]                  │      ║
║   └────────────────────────────────┘      ║
║                                            ║
║   ┌────────────────────────────────┐      ║
║   │ System Status                  │      ║
║   │ ────────────────────────────   │      ║
║   │ 🟢 Orchestrator: Connected     │      ║
║   │ 🟢 VLC: Ready                  │      ║
║   │ Devices: 3 (GM_Station_1, ...) │      ║
║   └────────────────────────────────┘      ║
║                                            ║
╚════════════════════════════════════════════╝
```

## Connection Sequence Diagram

```
┌──────────────┐
│  User Input  │
│   "Connect"  │
└──────┬───────┘
       │
       ▼
┌──────────────────────────┐
│  Validate Form Fields    │
│ • Server Address         │
│ • Station Name           │
│ • Password               │
└──────┬───────────────────┘
       │ (All valid)
       ▼
┌──────────────────────────┐
│  Health Check            │
│  GET /health             │
│  3s timeout              │
└──────┬────────┬──────────┘
   OK  │        │ FAIL
       ▼        ▼
    Continue   Error
               (red)
       
       ▼
┌──────────────────────────┐
│  HTTP Authentication     │
│  POST /api/admin/auth    │
│  { password }            │
└──────┬────────┬──────────┘
   OK  │        │ FAIL
       ▼        ▼
    Continue   Error
               (red)
       
       ▼
┌──────────────────────────┐
│  Save Credentials        │
│ • URL                    │
│ • JWT Token              │
│ • Station Name/ID        │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  WebSocket Connection    │
│  io.connect() + JWT      │
│  Handshake Auth          │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  Server Validates JWT    │
│  Middleware checks token │
└──────┬─────────────┬──────┘
  Valid │             │ Invalid
       ▼             ▼
    Connect        Reject
    accepted       (connect_error)
       │             │
       ▼             ▼
┌──────────────┐  Error
│ Auto-Sync    │  (red)
│ sync:full    │
└──────┬───────┘
       │
       ▼
┌──────────────────────────┐
│  Update UI               │
│ • Close modal (1s delay) │
│ • Show Team Entry        │
│ • Show admin tabs        │
│ • Status = Green         │
└──────────────────────────┘
```

## Token Processing Flowchart

```
┌─────────────────────────┐
│   NFC Tag Tap           │
│   "534e2b03"            │
└────────────┬────────────┘
             │
             ▼
    ┌────────────────────┐
    │ Validate Team      │
    │ Selected?          │
    └────┬──────────┬────┘
        NO          YES
         │           │
    Error │           ▼
     MSG  │  ┌──────────────┐
         │  │ Clean Token   │
         │  │ ID            │
         │  └────┬──────────┘
         │       │
         │       ▼
         │  ┌──────────────────┐
         │  │ TokenManager.    │
         │  │ findToken()      │
         │  │ (fuzzy match)    │
         │  └────┬──────┬──────┘
         │     FOUND  NOT FOUND
         │      │        │
         │      ▼        ▼
         │  ┌──────┐  ┌─────────┐
         │  │Token │  │UNKNOWN  │
         │  │Found │  │Token    │
         │  └──┬───┘  └────┬────┘
         │     │          │
         │     ▼          ▼
         │  ┌──────────────────────┐
         │  │ Check Duplicate      │
         │  │ isTokenScanned()?    │
         │  └──┬────────────┬──────┘
         │   YES             NO
         │    │              │
         │  Error            ▼
         │  (red)    ┌──────────────┐
         │           │ Queue        │
         │           │ Transaction  │
         │           │ (WebSocket)  │
         │           └────┬─────────┘
         │                │
         │                ▼
         │     ┌──────────────────┐
         │     │ Calculate Score  │
         │     │ (Black Market)   │
         │     │ Rating × Type ×  │
         │     │ Group Multiplier │
         │     └────┬─────────────┘
         │          │
         │          ▼
         │     ┌──────────────┐
         │     │ Show Result  │
         │     │ Screen       │
         │     └────┬─────────┘
         │          │
         └─────┬────┘
               │
               ▼
        ┌─────────────────┐
        │ Continue Scan   │
        │ OR Finish Team  │
        └─────────────────┘
```

## Real-Time Sync Events

```
BACKEND (Orchestrator)          FRONTEND (Scanner)
                                
┌─────────────┐                     
│ Server      │                     
│ Connected   │                     
└──────┬──────┘                     
       │                            
       ├──────────sync:full────────────> ┌──────────────┐
       │ {session, scores, ..}           │ SessionMgr   │
       │                                 │ VidController│
       │                                 │ SysMon       │
       │                                 └──────┬───────┘
       │                                        │
       │                                        ▼
       │                            ┌──────────────────┐
       │                            │ Update Admin UI  │
       │                            │ • Session Status │
       │                            │ • Video Queue    │
       │                            │ • Device List    │
       │                            └──────────────────┘
       │
       │
       ├────session:update────────────> ┌──────────────┐
       │ {status, teams, ...}            │ SessionMgr   │
       │                                 │ updates      │
       │                                 │ currentSession
       │                                 └──────────────┘
       │
       │
       ├─────transaction:new───────────> ┌──────────────┐
       │ {tokenId, score, ...}            │ DataManager  │
       │                                 │ updates      │
       │                                 │ backend      │
       │                                 │ scores Map   │
       │                                 └──────┬───────┘
       │                                        │
       │                                        ▼
       │                            ┌──────────────────┐
       │                            │ Scoreboard       │
       │                            │ refreshes on     │
       │                            │ user request     │
       │                            └──────────────────┘
       │
       │
       ├──────video:status────────────> ┌──────────────┐
       │ {current, queue, ...}            │ VideoCtrl    │
       │                                 │ updates UI   │
       │                                 └──────────────┘
```

