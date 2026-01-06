# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

ALN-TokenData is a **shared Git submodule** containing token definitions for the About Last Night immersive game. It's consumed by multiple scanner applications (GM Scanner, Player Scanner Web, ESP32 Scanner) and the backend orchestrator.

This repo is embedded as a nested submodule in scanner repos at `data/` paths.

## File Structure

```
ALN-TokenData/
  shared/
    aln-tools.css      # Shared design system (colors, panels, buttons)
    aln-tools.js       # Shared utilities (config, NFC, token loading)
  tokens.json          # Token definitions (synced from Notion)
  tokens.json.backup   # Manual backup
  tag-writer.html      # NFC tag programming tool
  token-checkin.html   # Token inventory check-in tool
```

## Token Schema

```json
{
  "tokenId": {
    "image": "assets/images/{tokenId}.bmp" | null,
    "audio": "assets/audio/{tokenId}.wav" | null,
    "video": "{tokenId}.mp4" | null,
    "processingImage": "assets/images/{tokenId}.bmp" | null,
    "SF_RFID": "tokenId",
    "SF_ValueRating": 1-5,
    "SF_MemoryType": "Personal" | "Business" | "Technical",
    "SF_Group": "Group Name (xN)" | "",
    "summary": "Optional description text"
  }
}
```

**Field Notes:**
- `SF_*` fields are synced from Notion (source of truth)
- `SF_Group` format: `"Group Name (xN)"` where N is the group size multiplier
- `video` tokens use `processingImage` as placeholder during playback
- Asset paths are relative to the consuming application's asset directory

## Data Flow

```
Notion Elements DB
        ↓
sync_notion_to_tokens.py (in parent ALN-Ecosystem/scripts/)
        ↓
ALN-TokenData/tokens.json
        ↓
    ┌───┴───────────────────┬──────────────────┬─────────────────┐
    ↓                       ↓                  ↓                 ↓
Backend               GM Scanner        Player Scanner    ESP32 Scanner
(loads directly)   (data/ submodule)  (data/ submodule)  (downloads via API)
```

## NFC Tools

Both tools require **Chrome on Android** (Web NFC API).

### Tag Writer (`tag-writer.html`)

Programs NFC tags with token data for game use.

**Workflow:**
1. Select environment (local/dev/prod)
2. Load tokens and select which to write
3. Tap NFC tags to write token IDs with verification

**Tag Format (NDEF):**
- Record 1: Text record with tokenId (for ESP32/MFRC522 hardware)
- Record 2: URL record with `{baseUrl}?token={tokenId}` (Android auto-open)

**Critical:** Text record MUST be first for ESP32 hardware scanner compatibility.

**URL Parameters:**
- `?preselect=tok1,tok2,tok3` - Pre-select specific tokens for writing

### Token Check-In (`token-checkin.html`)

Inventory management tool for GMs to track collected tokens after a game.

**Workflow:**
1. Load tokens from configured environment
2. Scan NFC tags to mark as collected (or click to toggle manually)
3. View progress: collected vs missing
4. "Write Missing" button opens tag-writer with missing tokens pre-selected

**Persistence:** Uses localStorage (`aln_token_checkin` key)

```javascript
{
  "version": "1.0",
  "lastUpdated": "2025-12-10T18:30:00Z",
  "collected": ["alr001", "det002", "mab001"]
}
```

## Shared Modules (`shared/`)

### aln-tools.css

Design system used by both NFC tools:
- CSS variables (colors, fonts, spacing)
- Component styles: `.panel`, `.header`, `.btn`, `.status-bar`, `.token-list`
- Overlay and modal patterns

### aln-tools.js

ES6 module with shared utilities:

```javascript
// Environment config
ENV_CONFIG, getEnvironment(envSelect, customUrlInput)

// Token loading
loadTokens(env, timeoutMs)

// NFC operations
checkNFCSupport()
readNFCTag(timeoutMs)
startContinuousScan(onRead, onError)
writeNFCTag(tokenId, url)

// UI helpers
setStatusBar(element, text, type)
$('elementId')

// URL helpers
getURLParam(name)
buildURLWithParams(base, params)

// Utilities
sleep(ms)
formatRelativeTime(date)
```

## Scoring Values (Reference)

Token values are calculated by consuming applications:

```
tokenScore = BASE_VALUES[SF_ValueRating] × TYPE_MULTIPLIERS[SF_MemoryType]

BASE_VALUES: {1: $10000, 2: $25000, 3: $50000, 4: $75000, 5: $150000}
TYPE_MULTIPLIERS: {Personal: 1x, Business: 3x, Technical: 5x}
```

## Editing tokens.json

**Preferred:** Edit in Notion, then run sync script:
```bash
cd ../  # ALN-Ecosystem root
python scripts/sync_notion_to_tokens.py
```

**Manual edits:** Acceptable for quick fixes, but will be overwritten on next Notion sync.

## Submodule Operations

When this repo is updated, consuming repos need their submodule references updated:

```bash
# From consuming repo (e.g., ALNScanner/)
git submodule update --remote --merge data
git add data
git commit -m "sync: update token data"
```
