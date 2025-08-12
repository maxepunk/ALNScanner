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

- **Frontend**: Vanilla JavaScript (ES6+)
- **Styling**: Custom CSS with responsive design
- **NFC**: Web NFC API
- **Storage**: localStorage for persistence
- **Architecture**: Modular single-page application
- **Build**: Zero dependencies, single HTML file

## 🚀 Quick Start

### Prerequisites
- Modern Chrome/Edge browser (v89+)
- NFC-enabled device (Android phone/tablet)
- HTTPS connection (required for Web NFC)

### Instant Setup
1. Clone the repository
2. Serve the HTML file over HTTPS
3. Open on NFC-enabled device
4. Start scanning!

```bash
# Clone repository
git clone https://github.com/yourusername/memory-transaction-station.git

# Navigate to directory
cd memory-transaction-station

# Serve with any HTTPS server
npx serve -s --ssl-cert cert.pem --ssl-key key.pem
```

## 📦 Installation

### Option 1: Direct Hosting
Simply host the `index.html` file on any HTTPS-enabled web server.

### Option 2: Local Development
```bash
# Using Python
python3 -m http.server 8000 --bind 127.0.0.1

# Using Node.js
npx http-server -S -C cert.pem -K key.pem

# Using PHP
php -S localhost:8000
```

### Option 3: GitHub Pages
1. Fork this repository
2. Enable GitHub Pages in settings
3. Access at `https://yourusername.github.io/memory-transaction-station`

### SSL Certificate Generation (for local testing)
```bash
# Generate self-signed certificate
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
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
- **Technical**: 5x
- **Personal**: 1x
- **Business**: 3x
- **Military**: 4x
- **Intelligence**: 4x
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
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Code Style
- Use ES6+ features
- Document functions with JSDoc
- Follow existing module patterns
- Maintain single-file architecture

### Testing Requirements
- Test all game modes
- Verify scoring calculations
- Check responsive design
- Validate NFC functionality

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
