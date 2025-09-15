# GM Scanner Maintenance Guide

## Token Synchronization

The GM Scanner shares a token database with the Player Scanner through a git submodule. This guide covers maintenance tasks for keeping tokens synchronized.

## Quick Reference

```bash
# Get latest tokens
python3 sync.py

# Get latest and deploy to GitHub Pages
python3 sync.py --deploy

# Local sync only (no GitHub operations)
python3 sync.py --local
```

## Understanding the Architecture

```
┌─────────────────┐
│  ALN-TokenData  │  ← Central token repository
│  (Shared Repo)  │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌──────────┐  ┌──────────────┐
│    GM    │  │    Player    │
│  Scanner │  │   Scanner    │
│   (NFC)  │  │  (QR Codes)  │
└──────────┘  └──────────────┘
```

### Key Differences
- **GM Scanner**: Uses NFC tokens for team gameplay, NO QR code generation
- **Player Scanner**: Generates QR codes for players to scan memories
- **Shared**: Both use same `data/tokens.json` via git submodule

## Common Workflows

### Getting Latest Token Updates

When tokens have been updated (either in Player Scanner or central repo):

```bash
cd ALNScanner
python3 sync.py
```

This will:
1. Pull latest changes from shared token repository
2. Update your local submodule reference
3. Verify token structure for GM operations

### Deploying GM Interface

To make the GM Scanner available online:

```bash
python3 sync.py --deploy
```

The interface will be available at:
```
https://[username].github.io/ALNScanner/
```

### Editing Tokens as GM

While the Player Scanner typically manages memory content, GMs may need to adjust token metadata:

1. Edit `data/tokens.json` with required fields:
   - `SF_RFID`: Token identifier
   - `SF_ValueRating`: 1-5 star rating
   - `SF_MemoryType`: Category (Technical, Personal, etc.)
   - `SF_Group`: Group name with multiplier (e.g., "Server Logs (x5)")

2. Sync your changes:
   ```bash
   python3 sync.py --deploy
   ```

3. Changes propagate to:
   - Shared token repository
   - Player Scanner (on their next sync)
   - Live GM interface

## Token Database Structure

Each token requires these GM-specific fields:

```json
{
  "token_id": {
    "SF_RFID": "token_id",
    "SF_ValueRating": 3,
    "SF_MemoryType": "Technical",
    "SF_Group": "Server Logs (x5)"
  }
}
```

The Player Scanner adds additional fields (image, audio) that the GM Scanner ignores.

## Troubleshooting

### "No tokens.json found!"
```bash
git submodule init
git submodule update
python3 sync.py
```

### "Could not push"
Someone else updated tokens. Pull first:
```bash
python3 sync.py  # This handles pull automatically
```

### Token Structure Warnings
The sync script verifies tokens have required GM fields. If you see warnings, check that all tokens have:
- SF_RFID
- SF_ValueRating
- SF_MemoryType
- SF_Group

### GitHub Pages Not Updating
1. Check Actions tab for deployment status
2. Wait 1-2 minutes for GitHub Pages cache
3. Try force refresh (Ctrl+Shift+R) in browser

## GitHub Actions

For web-based sync:
1. Go to repository's Actions tab
2. Click "Sync & Deploy GM Scanner"
3. Click "Run workflow"

This runs the same sync process from GitHub's servers.

## Best Practices

1. **Before game day**: Run `python3 sync.py` to ensure latest tokens
2. **After token edits**: Always sync to propagate changes
3. **Regular syncs**: Even if you haven't edited, sync to get others' changes
4. **Test locally**: Use `python3 sync.py --local` to test without pushing

## Relationship to Player Scanner

- **Player Scanner** (`aln-memory-scanner`):
  - Manages memory content (images, audio)
  - Generates QR codes for printing
  - Players scan QR codes to collect memories

- **GM Scanner** (`ALNScanner`):
  - Tracks team transactions
  - Manages scoring and leaderboards
  - Uses NFC tokens for physical gameplay

Both apps work together to create the complete game experience, sharing the same token database but serving different roles.

## Support

For issues with:
- Token structure: Check `SUBMODULE_INFO.md`
- Sync process: Review this guide or check `sync.py --help`
- Game features: See main `README.md`

---

*This maintenance guide is for game administrators managing the GM Scanner system.*