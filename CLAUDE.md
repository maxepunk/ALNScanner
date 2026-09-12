# CLAUDE.md

Last verified: 2026-06-18

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
  tokens.schema.json   # JSON Schema for tokens.json (enforced by backend contract test)
  game.json            # Pack RULES file: scoring, modes, groupRules, duplicatePolicy, gameClock
  game.schema.json     # JSON Schema for game.json
  pack-manifest.json   # Pack inventory + contentHash (regenerate after ANY pack-file edit:
                       #   node backend/scripts/build-pack-manifest.js <packDir>)
  pack-manifest.schema.json
  tag-writer.html      # NFC tag programming tool
  token-checkin.html   # Token inventory check-in tool
```

Note: the legacy `scoring-config.json` was RETIRED in Phase 3 A3 slice 2
(debt ledger L1) — `game.json`'s `scoring` block is the sole shared
scoring source, and the manifest builders permanently exclude a file by
the old name from pack inventory (tombstone).

## Token Schema

```json
{
  "tokenId": {
    "image": "assets/images/{tokenId}.bmp" | null,
    "audio": "assets/audio/{tokenId}.wav|.mp3" | null,
    "video": "{tokenId}.mp4" | null,
    "processingImage": "assets/images/{tokenId}.bmp" | null,
    "SF_RFID": "tokenId",
    "SF_ValueRating": 1-5,
    "SF_MemoryType": "Personal" | "Business" | "Technical" | "Mention" | "Party" | null,
    "SF_Group": "Group Name" | "",
    "summary": "Optional description text",
    "owner": "Character Name" | null
  }
}
```

**Field Notes:**
- `SF_*` fields are synced from Notion (source of truth)
- `SF_MemoryType: null` is tolerated (scores 0x as UNKNOWN); the sync script warns on it. Since D2b the type set is OPEN and pack-declared (exact-case match against `game.json` `scoring.typeMultipliers`; ALN declares Personal/Business/Technical/Mention/Party)
- `SF_Group` (tokens v2, A3 slice 2b): the PURE group name — a `"(xN)"` suffix is schema-ILLEGAL (tokens.schema.json). Multipliers live in `game.json` `groups` (sole source). The `Group Name (xN)` shorthand survives only as the Notion authoring format; `sync_notion_to_tokens.py` is its sole parser (derives the groups block, emits pure names)
- `video` tokens use `processingImage` as placeholder during playback
- Asset paths are relative to the consuming application's asset directory
- `owner`: Character who owns this memory, resolved from Notion Elements→Characters Owner relation during sync (role prefix stripped)

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

## Scoring Values (`game.json` `scoring` block)

Single source of truth for scoring values, read at runtime by the backend
(`packService.getScoringRules()`), the GM Scanner (`applyPackScoring()`
via its packLoader), the post-session validators, and the config-tool
economy editor. Contains `baseValues` (rating -> dollar amount) and
`typeMultipliers` (memory type -> multiplier). Formula:

```
tokenScore = scoring.baseValues[SF_ValueRating] × scoring.typeMultipliers[SF_MemoryType]
```

After editing, regenerate the manifest
(`node backend/scripts/build-pack-manifest.js .`) — the backend's
freshness contract test and the scanners' per-file sha1 verify both fail
on a drifted pack without it.

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
