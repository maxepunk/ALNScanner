# 🎮 Memory Transaction Station

ALN Memory scanner tool. 

## 📋 Table of Contents

- [Features](#-features)
- [Game Modes](#-game-modes)
- [Technology Stack](#-technology-stack)
- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Usage Guide](#-usage-guide)
- [Token Database](#-token-database)
- [Architecture](#-architecture)
- [Testing](#-testing)
- [Configuration](#-configuration)
- [Browser Support](#-browser-support)
- [Contributing](#-contributing)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)

## ✨ Features

### Core Functionality
- **NFC Token Scanning** - Real-time scanning using Web NFC API
- **Dual Game Modes** - Detective Mode for investigation, Black Market for high-stakes trading
- **Team Management** - 6-digit team ID system with session tracking
- **Global Duplicate Prevention** - Each token can only be scanned once across all teams
- **Group Completion Bonuses** - Collect full sets for multiplier rewards
- **Real-time Scoring** - Instant feedback with detailed calculations
- **Persistent Storage** - All transactions saved locally

### Advanced Features
- 🏆 **Dynamic Leaderboard** - Live team rankings with medal indicators
- 📊 **Enhanced Team Analytics** - Detailed breakdowns with group progress tracking
- 🎯 **Smart Token Matching** - Fuzzy matching for various RFID formats
- 📱 **Mobile-First Design** - Optimized for tablet/phone gameplay
- 🔍 **Transaction History** - Searchable, filterable activity log
- 🎨 **Visual Progress Indicators** - Progress bars and completion badges
- 💾 **Data Export** - JSON/CSV export capabilities
- 🐛 **Debug Mode** - Built-in testing and diagnostic tools

## 🎮 Game Modes

### 🔍 Detective Mode
Teams work as investigators collecting memory tokens and tracking star ratings. Focus on gathering evidence and building a complete picture of the memory landscape.

- **Scoring**: Based on star ratings (1-5 ⭐)
- **Display**: Shows cumulative star value
- **Theme**: Investigation and discovery

### 💰 Black Market Mode
High-stakes competitive mode where memories have monetary value. Teams compete for the highest score through strategic token collection and group completion bonuses.

- **Scoring**: Currency-based with multipliers
- **Base Values**: $100 - $10,000 per token
- **Type Multipliers**: 1x - 5x based on memory type
- **Group Bonuses**: 2x - 20x for complete sets
- **Features**: Exclusive scoreboard and detailed profit analytics

## 🛠 Technology Stack

- **Frontend**: Vanilla JavaScript (ES6+ Modules)
- **Build System**: Vite 5.x with hot module reload
- **Testing**: Jest (598 unit tests) + Playwright (E2E)
- **Styling**: Custom CSS with responsive design
- **NFC**: Web NFC API
- **Storage**: localStorage for persistence
- **Architecture**: Modular ES6 with dependency injection
- **Deployment**: Static build to dist/ directory

## 🚀 Quick Start

### Prerequisites
- **Node.js**: v20+ with npm
- **Browser**: Modern Chrome/Edge (v89+)
- **Device**: NFC-enabled Android phone/tablet
- **Connection**: HTTPS required for Web NFC

### Instant Setup
1. Clone the repository
2. Install dependencies
3. Start development server
4. Open on NFC-enabled device

```bash
# Clone repository
git clone https://github.com/maxepunk/ALNScanner.git

# Navigate to directory
cd ALNScanner

# Install dependencies
npm install

# Start development server (HTTPS on port 8443)
npm run dev

# Scanner opens automatically at https://localhost:8443
```

## 📦 Installation

### Option 1: Development Mode (Recommended)
For local development with hot module reload and HTTPS:

```bash
# Install dependencies
npm install

# Start dev server (auto-opens browser at https://localhost:8443)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

**Note**: Dev server auto-generates self-signed certificate for HTTPS (required for NFC API).

### Option 2: Production Deployment
Build and deploy the static site:

```bash
# Build for production (outputs to dist/)
npm run build

# Deploy dist/ directory to any static host
# Examples: GitHub Pages, Netlify, Vercel, Apache, Nginx
```

### Option 3: GitHub Pages (Automated)
Automatic deployment on push to main branch:

1. Push changes to `main` branch
2. GitHub Actions builds and deploys automatically
3. Access at `https://maxepunk.github.io/ALNScanner/`

### Option 4: Backend Integration
Connect to orchestrator backend for networked mode:

```bash
# 1. Start orchestrator (from parent repo)
cd ../../backend && npm run dev

# 2. Start scanner dev server
cd ../ALNScanner && npm run dev

# 3. Select "Networked Mode" in scanner UI
# 4. Enter orchestrator URL: https://[IP]:3000
# 5. Authenticate with admin password
```

## 📖 Usage Guide

### Station Setup
1. **Configure Station**
   - Enter Station ID (up to 10 characters)
   - Select game mode (Detective/Black Market)
   - Click "Start Station"

2. **Team Entry**
   - Teams enter their 6-digit ID using the numpad
   - Press Enter to begin scanning session

3. **Token Scanning**
   - Tap "Start Scanning"
   - Hold NFC token against device
   - View transaction details
   - Continue scanning or finish team

### Navigation
- 📋 **History** - View all transactions
- 🏆 **Scoreboard** - Team rankings (Black Market only)
- ⚙️ **Settings** - Station configuration and data management

### Manual Entry (Debug)
For testing without NFC hardware:
1. Click "Manual Entry"
2. Enter token ID
3. System processes as normal scan

## 🗄 Token Database

### Structure
Tokens are stored in `tokens.json` with the following format:

```json
{
  "token_id": {
    "SF_RFID": "token_id",
    "SF_ValueRating": 1-5,
    "SF_MemoryType": "Technical|Personal|Business|etc",
    "SF_Group": "Group Name (xN)"
  }
}
```

### Field Definitions
| Field | Description | Example |
|-------|-------------|---------|
| `SF_RFID` | Unique token identifier | "a1b2c3d4" |
| `SF_ValueRating` | Base value tier (1-5) | 3 |
| `SF_MemoryType` | Category for multiplier | "Technical" |
| `SF_Group` | Group name with bonus | "Server Logs (x5)" |

### Group Bonuses
Groups with multiple tokens offer completion bonuses:
- Format: `"Group Name (xN)"` where N is the multiplier
- Example: Collecting all "Server Logs (x5)" tokens gives 5x bonus
- Only applies to groups with 2+ tokens

### Memory Type Multipliers
Default multipliers for Black Market mode:
- **Personal**: 1x
- **Business**: 3x
- **Technical**: 5x
- **Unknown**: 0x (no value)

## 🏗 Architecture

### Module Structure
```
┌─────────────────────────────────────┐
│           Main App Module           │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────┐      ┌──────────┐   │
│  │  Debug   │      │ Settings │   │
│  └──────────┘      └──────────┘   │
│                                     │
│  ┌──────────┐      ┌──────────┐   │
│  │   NFC    │◄────►│  Token   │   │
│  │ Handler  │      │ Manager  │   │
│  └──────────┘      └──────────┘   │
│                                     │
│  ┌──────────┐      ┌──────────┐   │
│  │   Data   │◄────►│    UI    │   │
│  │ Manager  │      │ Manager  │   │
│  └──────────┘      └──────────┘   │
│                                     │
└─────────────────────────────────────┘
```

### Key Modules

#### `App`
Main coordinator handling initialization and user interactions.

#### `NFCHandler`
Manages Web NFC API interactions and token reading.

#### `TokenManager`
- Token database management
- Group inventory building
- Fuzzy matching algorithms

#### `DataManager`
- Transaction storage and retrieval
- Score calculations with bonuses
- Group completion detection
- Data persistence

#### `UIManager`
- Screen navigation
- Dynamic content rendering
- Enhanced team details with grouping
- Real-time updates

#### `Settings`
Configuration persistence and mode management.

#### `Debug`
Logging system with visual debug panel.

## 🧪 Testing

### Automated Testing

The scanner uses a 3-tier testing strategy:

**L1: Unit Tests (Jest)**
```bash
npm test                    # Run all 598 unit tests (~15-30s)
npm test -- --coverage      # With coverage report
npm test -- dataManager     # Run specific test suite
```

- **Location**: `tests/unit/`
- **Coverage**: 598 tests across all modules
- **Scope**: Individual component testing with mocks

**L2: Scanner E2E Tests (Playwright)**
```bash
npm run test:e2e           # Run E2E tests (~2-3 min)
npm run test:all           # L1 + L2 combined
```

- **Location**: `tests/e2e/specs/`
- **Scope**: Full scanner testing WITHOUT backend orchestrator
- **Coverage**: Standalone mode, UI navigation, localStorage

**L3: Full Stack E2E Tests (Parent Repo)**
```bash
# Run from parent repository
cd ../../backend
npm run test:e2e
```

- **Location**: `../../backend/tests/e2e/flows/`
- **Scope**: Complete integration with live orchestrator
- **Coverage**: Networked mode, WebSocket, transaction flow

### Pre-Merge Verification

Run comprehensive checks before merging:
```bash
./verify-merge-ready.sh
```

This script performs 8 validation checks:
1. Dependencies installed
2. Critical files present
3. Vite HTTPS plugin configured
4. All 598 unit tests passing
5. Production build succeeds
6. Build artifacts verified
7. Bundle size check (<10MB)
8. Critical module tests passing

### Built-in Test Functions
Access via Settings > Data Management:

1. **Test Token Match** - Verify token database lookups
2. **Test Group Parsing** - Validate group name parsing
3. **Test Group Inventory** - Review group structures
4. **Test Completions** - Check completion detection
5. **Test Bonuses** - Verify score calculations
6. **Test Enhanced UI** - Validate UI data structures

### Manual Testing Workflow
```javascript
// 1. Start with clean data
DataManager.clearData()

// 2. Load test tokens
App.manualEntry()
// Try: a1b2c3d4, deadbeef, cafe1234

// 3. Check scoring
App.testBonusCalculations()

// 4. Verify UI
App.testEnhancedUI()
```

### Debug Panel
Click the 🐛 button to open real-time debug logging.

## ⚙ Configuration

### Environment Variables
Configure via URL parameters:
- `?mode=blackmarket` - Start in Black Market mode
- `?debug=true` - Enable debug panel on load

### localStorage Keys
| Key | Description |
|-----|-------------|
| `stationId` | Current station identifier |
| `stationMode` | Active game mode |
| `transactions` | Transaction history |
| `scannedTokens` | Global token registry |

### Customization Points
- `CONFIG` object for timing/limits
- `SCORING_CONFIG` for value adjustments
- CSS variables for theming
- Token database structure

## 🌐 Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome Android 89+ | ✅ Full | Recommended |
| Edge Android 89+ | ✅ Full | Recommended |
| Chrome Desktop | ⚠️ Partial | No NFC, demo mode only |
| Safari | ❌ None | Web NFC not supported |
| Firefox | ❌ None | Web NFC not supported |

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Install dependencies: `npm install`
4. Make your changes
5. Test thoroughly: `npm run test:all`
6. Submit a pull request

### Code Style
- Use ES6+ modules with `import`/`export`
- Document functions with JSDoc comments
- Follow dependency injection pattern
- Use event-driven architecture (EventTarget)
- Maintain modular structure in `src/` directory

### Testing Requirements
- All unit tests must pass (598/598)
- Add tests for new features
- Run E2E tests for UI changes: `npm run test:e2e`
- Verify both game modes (Detective + Black Market)
- Check responsive design on mobile devices
- Validate NFC functionality on Android device

### Build Verification
Before submitting PR:
```bash
npm run test:all              # All tests
npm run build                 # Production build
./verify-merge-ready.sh       # Pre-merge checks
```

## 🔧 Troubleshooting

### Common Issues

#### NFC Not Working
- **Solution**: Ensure HTTPS connection and NFC is enabled
- **Check**: Browser supports Web NFC API
- **Alternative**: Use manual entry for testing

#### Tokens Not Recognized
- **Solution**: Check token ID format in database
- **Debug**: Use "Test Token Match" function
- **Format**: IDs can be with/without colons

#### Scoring Issues
- **Solution**: Verify token has valid memory type
- **Check**: Group multipliers in database
- **Debug**: Use "Test Bonus Calculations"

#### Data Not Persisting
- **Solution**: Check localStorage is enabled
- **Verify**: No private browsing mode
- **Export**: Backup data regularly

### Debug Commands (Console)
```javascript
// View all transactions
console.table(DataManager.transactions)

// Check token database
console.log(TokenManager.database)

// Force recalculation
DataManager.calculateTeamScoreWithBonuses('teamId')

// Export current state
DataManager.exportData('json')
```

## 🔄 Token Database Synchronization

### Overview
The GM Scanner uses a shared token database that's synchronized between the Player Scanner and GM Scanner apps. Tokens are maintained in a central repository and synced via git submodule.

### Quick Sync
To get the latest token updates:
```bash
python3 sync.py
```

To sync and deploy the GM interface:
```bash
python3 sync.py --deploy
```

### Sync Workflow
1. **Automatic bidirectional sync** - Push local changes, pull remote changes
2. **No QR generation** - GM Scanner uses NFC tokens (QR codes handled by Player Scanner)
3. **GitHub Pages deployment** - Optional `--deploy` flag publishes to live site

### Token Management Details
See [MAINTENANCE.md](MAINTENANCE.md) for detailed synchronization instructions and [SUBMODULE_INFO.md](SUBMODULE_INFO.md) for token database structure.

## 📄 License

MIT License - See LICENSE file for details
