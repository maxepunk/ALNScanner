# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ALNScanner is the **Game Master (GM) Scanner** for the "About Last Night" immersive crime thriller game. It's a Progressive Web App that GMs use to track team transactions via NFC token scanning during live gameplay. This is NOT the player-facing app.

## Key Differences from Player Scanner

- **This app (ALNScanner)**: GM tool with NFC scanning, team management, leaderboards
- **Player app (aln-memory-scanner)**: Player tool with QR scanning, memory display, audio/images

## Core Functionality

### NFC-Based Team Gameplay
- Teams tap physical NFC/RFID tokens at GM stations
- Tracks transactions, scores, and group completions
- Two game modes: Detective (star ratings) and Black Market (currency)
- Real-time leaderboard and analytics

### Token Management
- Reads tokens via Web NFC API (Android Chrome/Edge only)
- Uses shared token database via git submodule at `data/`
- Does NOT generate QR codes (that's the Player Scanner's job)

## Development Commands

### Token Synchronization
```bash
# Get latest tokens from shared repository
python3 sync.py

# Sync and deploy to GitHub Pages
python3 sync.py --deploy

# Local sync only (no GitHub push)
python3 sync.py --local
```

### Testing
- Open `index.html` in Chrome/Edge on Android device
- Use "Manual Entry" button for testing without NFC hardware
- Debug panel available via 🐛 button

## Architecture

### File Structure
```
ALNScanner/
├── index.html          # Single-file PWA (125KB) with all JS/CSS inline
├── sync.py             # Token sync tool (GM-specific, no QR generation)
├── data/               # Git submodule pointing to ALN-TokenData
│   └── tokens.json     # Shared token database
├── MAINTENANCE.md      # Detailed sync instructions
└── README.md           # Comprehensive app documentation
```

### Token Database Schema
```json
{
  "token_id": {
    "SF_RFID": "token_id",        // Required: Token identifier
    "SF_ValueRating": 1-5,         // Required: Star rating
    "SF_MemoryType": "Technical",  // Required: Category for multipliers
    "SF_Group": "Group (xN)"       // Required: Group with bonus multiplier
  }
}
```

## Important Notes

- **NO BUILD PROCESS**: Pure HTML/JS/CSS in single file
- **NFC ONLY**: Requires Android device with Chrome 89+ for NFC scanning
- **NO QR CODES**: This app doesn't generate or use QR codes
- **SHARED TOKENS**: Both GM and Player apps use same token database
- **GM FOCUSED**: All features designed for game master operations

## Common Tasks

### Update tokens after changes
```bash
python3 sync.py --deploy
```

### Test without NFC hardware
Use the "Manual Entry" feature in the UI to enter token IDs directly.

### Deploy to GitHub Pages
The app is served directly from the main branch at:
```
https://[username].github.io/ALNScanner/
```

## Relationship to Player Scanner

1. **Shared**: Both apps use `data/tokens.json` submodule
2. **Different**: GM app uses NFC, Player app uses QR codes  
3. **Complementary**: GM tracks gameplay, Player displays memories

When making changes, remember this is the GM tool for managing live gameplay, not the player-facing memory collection app.