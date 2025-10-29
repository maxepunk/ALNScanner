# ALNScanner Networked Mode Documentation

This folder contains comprehensive documentation for ALNScanner's networked mode operation, including complete user flows, quick references, and visual guides.

## Available Documentation

### 1. **NETWORKED_MODE_USER_FLOW.md** (1,142 lines)
Complete step-by-step documentation of the entire user journey from app launch to token scanning in networked mode.

**Covers:**
- App initialization (7 phases)
- Game mode selection and mode locking
- Connection Wizard modal (form fields, validation, authentication)
- Team entry screen (keypad interaction)
- Scan screen (NFC workflow)
- Result screen (success, unknown, duplicate tokens)
- Admin panel (session, video, system management)
- Real-time synchronization (WebSocket events)
- Error handling and recovery flows
- Alternative flows (manual entry, reconnection, settings)
- File references for all relevant code
- Complete timing details and decision trees

**Best for:** Understanding every detail of the networked mode flow, debugging specific issues, architectural understanding.

### 2. **NETWORKED_MODE_QUICK_REFERENCE.md** (237 lines)
Quick lookup guide for the most important information about networked mode.

**Covers:**
- Mode selection steps
- Connection Wizard form fields and process
- Team entry and scanning procedures
- Result screen options
- Admin panel access and features
- Real-time sync broadcast types
- Connection lost/offline behavior
- Alternative actions (reconnect, history, scoreboard)
- Error messages and solutions
- File locations for developers
- Troubleshooting checklist

**Best for:** Quick lookups, testing checklists, understanding key features at a glance.

### 3. **NETWORKED_MODE_VISUAL_GUIDE.md** (445 lines)
ASCII art diagrams and visual representations of screens and flows.

**Covers:**
- Screen-by-screen visual walkthroughs (all 6 main screens)
- Connection sequence diagram (with decision points)
- Token processing flowchart
- Real-time sync event diagram
- Visual representation of modal structure
- Button locations and interactions

**Best for:** Visual learners, understanding screen layout, presentations, teaching others how to use the app.

## Quick Start: Where to Find What

**"How does the app work from start to finish?"**
→ Read: **NETWORKED_MODE_USER_FLOW.md** (Phases 1-8)

**"What are the steps to scan a token?"**
→ Read: **NETWORKED_MODE_QUICK_REFERENCE.md** (Team Entry → Scan Screens section)

**"Show me the screens visually"**
→ Read: **NETWORKED_MODE_VISUAL_GUIDE.md** (Screen-by-Screen Walkthrough)

**"How does the connection process work?"**
→ Read: **NETWORKED_MODE_USER_FLOW.md** (Phase 3) + **NETWORKED_MODE_VISUAL_GUIDE.md** (Connection Sequence)

**"What happens when I click the Admin tab?"**
→ Read: **NETWORKED_MODE_USER_FLOW.md** (Phase 6) or **NETWORKED_MODE_QUICK_REFERENCE.md** (Admin Panel section)

**"How do WebSocket events update the UI?"**
→ Read: **NETWORKED_MODE_USER_FLOW.md** (Phase 8) + **NETWORKED_MODE_VISUAL_GUIDE.md** (Real-Time Sync Events)

**"What's the error message saying?"**
→ Read: **NETWORKED_MODE_QUICK_REFERENCE.md** (Error Messages & Solutions table)

**"I'm debugging an issue - where's the code?"**
→ Read: **NETWORKED_MODE_USER_FLOW.md** (File References Summary at end) or **NETWORKED_MODE_QUICK_REFERENCE.md** (File Locations section)

## Key Concepts

### Mode Locking
Once a user selects "Networked Mode" at startup, the mode is **locked** and cannot be changed without reloading the page. This prevents confusion during active gameplay.

### Connection Wizard
A modal form that:
1. Discovers orchestrator servers via UDP broadcast (optional)
2. Accepts manual configuration (URL, station name, password)
3. Performs health checks and JWT authentication
4. Establishes WebSocket connection with auto-sync

### Three Main Screens
1. **Team Entry** - Numeric keypad to enter team ID (1-10 digits)
2. **Scan Screen** - Ready to receive NFC tap or manual entry
3. **Result Screen** - Shows token details, next action options

### Admin Panel (Networked Only)
Only accessible in networked mode via three tabs:
- **Scanner** - Standard NFC scanning interface
- **Admin** - Session creation, video control, system monitoring
- **Debug** - Real-time logs

### Real-Time Synchronization
WebSocket broadcasts automatically update the UI:
- `sync:full` - Complete state snapshot on connect
- `session:update` - Session state changes
- `transaction:new` - New token scans
- `video:status` - Video playback updates
- `device:connected/disconnected` - Device tracking

### Offline Resilience
If connection is lost during scanning:
- Transactions queued in localStorage
- Exponential backoff retry (5s → 10s → 20s...)
- Auto-flush on reconnect
- User experiences no interruption

## File Organization

```
ALNScanner/
├── docs/                              # This folder
│   ├── README.md                      # You are here
│   ├── NETWORKED_MODE_USER_FLOW.md    # Complete detailed flow
│   ├── NETWORKED_MODE_QUICK_REFERENCE.md  # Quick lookup
│   └── NETWORKED_MODE_VISUAL_GUIDE.md      # Visual diagrams
├── js/
│   ├── app/
│   │   ├── app.js                     # Main coordinator
│   │   ├── sessionModeManager.js      # Mode selection/locking
│   │   └── initializationSteps.js     # Startup sequence
│   ├── network/
│   │   ├── connectionManager.js       # JWT auth, health checks
│   │   ├── orchestratorClient.js      # WebSocket client
│   │   └── networkedQueueManager.js   # Transaction queue
│   ├── ui/
│   │   └── uiManager.js               # Screen management
│   ├── utils/
│   │   ├── adminModule.js             # Admin panel functionality
│   │   ├── nfcHandler.js              # NFC API wrapper
│   │   └── config.js                  # Configuration
│   └── core/
│       ├── dataManager.js             # Scoring and transactions
│       ├── tokenManager.js            # Token database
│       └── standaloneDataManager.js   # Standalone-only features
└── index.html                         # Main PWA (1417 lines)
```

## Common Scenarios

### "User just loaded the app"
1. Token database loads (Phase 1A)
2. Check if saved mode exists (Phase 1B-C)
3. If new user: Show Game Mode Screen
4. If returning user: Check connection, show Team Entry or wizard

### "User selected Networked Mode"
1. Mode locked to 'networked'
2. Connection Wizard modal opens
3. User fills form (server, name, password)
4. Health check + HTTP auth + WebSocket handshake
5. Team Entry screen appears
6. Admin tabs become visible

### "User scans a token"
1. NFC API returns RFID
2. Fuzzy match against token database
3. Check for duplicate
4. Queue transaction for WebSocket
5. Calculate score (if Black Market mode)
6. Show result screen with details

### "Network connection lost"
1. Status indicator turns orange
2. Transaction queued in localStorage
3. ConnectionManager retries (exponential backoff)
4. On reconnect: Queue auto-flushes
5. Status indicator turns green

### "User switches to Admin tab"
1. Admin modules initialized (first time only)
2. View changes from scanner to admin
3. Session status, video controls, system status displayed
4. Event listeners register for auto-updates

## Testing & Development

### Test Networked Mode Locally
```bash
# Terminal 1: Start orchestrator
cd ../backend && npm run dev:full

# Terminal 2: Serve scanner (requires HTTPS)
npx http-server -S -C cert.pem -K key.pem

# Browser: Open https://localhost:8080/
# Select Networked Mode
# Enter localhost URL + admin password
```

### Manual Testing Checklist
See **NETWORKED_MODE_QUICK_REFERENCE.md** for complete troubleshooting checklist.

### Code Locations
All file references provided in both documents for easy navigation to relevant code.

## Architecture Highlights

### Initialization (11 phases: 1A-1J)
- Token database load
- Mode selection
- Connection restoration
- UI/NFC initialization
- Service worker registration

### Connection Flow
1. Health check (3s timeout)
2. HTTP authentication (JWT token)
3. WebSocket handshake with token
4. Server auto-sync with `sync:full`

### Transaction Flow
1. NFC read or manual entry
2. Fuzzy token lookup
3. Duplicate detection
4. Queue transaction (WebSocket)
5. Calculate score
6. Show result
7. Continue or finish

### Admin Panel
- Session: Create, pause, resume, end
- Video: Play, pause, stop, skip, queue management
- System: Monitor orchestrator, VLC, connected devices
- Operations: Reset scores, clear transactions

### Real-Time Updates
All WebSocket broadcasts automatically update UI without user action via event-driven architecture.

## Additional Resources

- Main project CLAUDE.md: `/home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/CLAUDE.md`
- Backend orchestrator: `/home/maxepunk/projects/AboutLastNight/ALN-Ecosystem/backend/`
- Submodule: ALN-TokenData (shared token definitions)

## Notes for Developers

- All UI state changes go through `UIManager.showScreen()`
- All WebSocket events handled in `orchestratorClient.js`
- All scoring logic in `dataManager.js`
- All token matching in `tokenManager.js`
- Admin panel separated into `adminModule.js` for maintainability

---

**Documentation last updated:** October 27, 2025
**ALNScanner version:** Networked mode architecture
**Total documentation:** 1,824 lines across 4 files
