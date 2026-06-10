# Session Report Format Contract — v1

**Status:** Active external contract  
**Version:** v1 (implicit — no version marker in the markdown itself; the bytes ARE the contract until B9's structured bundle lands)  
**Enforcement:** `tests/contract/sessionReport.contract.test.js`

---

## Overview

`src/core/sessionReportGenerator.js` produces a post-game markdown report that is consumed by an external GenAI pipeline at `github.com/maxepunk/aboutlastnight` (the `parseRawInput` function). The pipeline parses the markdown by **exact section heading strings and table column positions**. The markdown format is therefore an external API contract, not a mere rendering detail.

Per **Decision B9** (`docs/decisions/2026-06-09-tier-b2-showcontrol-content-pipeline.md`): until Phase 3 delivers a structured JSON session bundle as the canonical artifact, the markdown format must remain byte-compatible. The planned migration: engine emits structured bundle → pack template renders markdown → pipeline consumes bundle directly. Until that migration is complete, this contract must not change without coordinating the pipeline update first.

---

## Section Semantics

The report has four top-level sections (H2) rendered in this order:

### 1. Session Summary (`## Session Summary`)

Purpose: high-level session metadata consumed by the pipeline as the overview context for LLM interpretation.

Fields:
- Team list (comma-separated, order matches session.teams)
- Transaction counts by mode (`N detective, N black market`)
- Player scan count
- Unique token count
- Final Standings leaderboard (sorted descending by score, with adjustment breakdown if any team has admin adjustments)

Pipeline dependency: The pipeline reads "Total Transactions", player scan count, and leaderboard rankings as structured metadata.

### 2. Detective Evidence Log (`## Detective Evidence Log`)

Purpose: exposes which tokens were submitted as evidence, ordered alphabetically by tokenId so the pipeline can deduplicate across sessions.

Table columns (in exact order):
```
| Token | Owner | Exposed By | Time | Evidence |
```

- `Token`: tokenId (RFID string)
- `Owner`: character name from tokens.json `owner` field ("Unknown" if absent)
- `Exposed By`: team name
- `Time`: formatted as `HH:MM AM/PM` (en-US locale, UTC base)
- `Evidence`: token summary text (pipe characters escaped as `\|`, newlines replaced by space)

If no detective transactions: single italics line `*No detective transactions this session.*`

Pipeline dependency: The pipeline indexes evidence cards by Token+Owner+Evidence. Column order is position-fixed.

### 3. Scoring Timeline (`## Scoring Timeline`)

Purpose: chronological audit trail of all scoring events (black market sales + admin adjustments). Consumed by the pipeline to reconstruct team economics.

Table columns (in exact order):
```
| Time | Type | Detail | Team | Amount |
```

- `Time`: formatted as `HH:MM AM/PM`
- `Type`: `Sale` (blackmarket transaction) or `Adjustment` (admin score adjustment)
- `Detail`: for Sale — `{tokenId}/{owner} ({rating}★ {type}, {baseValue} × {mult}x)`; for Adjustment — `{reason} ({gmStation})`
- `Team`: teamId
- `Amount`: signed currency (`+$N` or `-$N`)

Followed by `### Final Totals` subsection: per-team breakdown of sales total vs adjustments total vs combined final.

If no scoring events: single italics line `*No scoring events this session.*`

Pipeline dependency: The pipeline sums team totals from both the table rows and the Final Totals text block. Both must remain present.

### 4. Player Activity (`## Player Activity`)

Purpose: records which tokens players discovered (via player scanners) before GM processing. Consumed by the pipeline to infer player engagement.

Scan log table columns (in exact order):
```
| Token | Owner | Device | Time |
```

Followed by `### Activity Stats` subsection:
- Most Active Devices (sorted by scan count descending)
- Most Scanned Tokens (tokens with 2+ scans, sorted descending)
- Tokens Scanned but Never Turned In (optional — omitted if all player-scanned tokens were also GM-processed)

If no player scans: single italics line `*No player scans this session.*`

Pipeline dependency: The pipeline uses the scan log table to populate per-character discovery data.

---

## Section Separators

Each major section (Session Summary, Detective Evidence Log, Scoring Timeline) ends with a `---` horizontal rule line followed by a blank line. The pipeline uses these separators to delimit section boundaries during parsing.

The Player Activity section does NOT end with `---` (it is the final section).

---

## Change Rules

**NEVER change any of the following without coordinating a pipeline migration:**

1. The exact text of any `## Section Title` or `### Subsection Title` heading
2. The column ordering or column header text of any markdown table
3. The presence or position of `---` section separators
4. The format of the H1 header line (`# Session Report: {name}`)
5. The format of the metadata line (`**{date} | Duration: {duration} | Teams: {count}**`)
6. The "empty section" placeholder text (italics lines)

**Safe changes** (do not affect pipeline):

- Adding new fields at the END of existing table rows (the pipeline reads by column index, not by name-lookup — this is fragile; confirm with pipeline author before adding columns)
- Adding entirely new sections AFTER `## Player Activity` (pipeline ignores unknown trailing content)
- Reformatting currency, timestamps, or emoji within existing cells (the pipeline uses LLM extraction, not regex on cell values — but confirm before doing this)

---

## Enforcement

`tests/contract/sessionReport.contract.test.js` contains:

1. A **golden master test** that compares the full rendered output byte-for-byte against a pinned string. Failure means the bytes changed.
2. **Structural assertions** that check section heading list, table header rows, and separator count independently — these produce readable failure messages that identify which structural element changed.

To regenerate the golden string after an intentional (pipeline-coordinated) change:
1. Coordinate with the pipeline owner and confirm the migration plan.
2. Run the generator on the contract fixture and capture output.
3. Update `GOLDEN_OUTPUT` in the contract test.
4. Update this document.
5. Commit with message: `contract(session-report): update v1 golden — coordinated with pipeline`

---

## Phase 3 Migration Path (B9)

When Phase 3 structured bundle lands:
1. Engine emits `session-bundle.json` (versioned schema, game-agnostic)
2. ALN pack includes a markdown template that renders the bundle into today's table format
3. The GenAI pipeline migrates to consuming `session-bundle.json` directly
4. This contract document is superseded by the bundle schema
5. The golden master test is replaced by a bundle-schema validation test

Until step 3 is complete and confirmed, this contract is binding.
