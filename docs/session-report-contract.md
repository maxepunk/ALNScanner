# Session Report Format Contract — v2

**Status:** Active external contract  
**Version:** v2 (implicit — no version marker in the markdown itself; the bytes ARE the contract until B9's structured bundle lands)  
**Enforcement:** `tests/contract/sessionReport.contract.test.js`

---

## Overview

`src/core/sessionReportGenerator.js` produces a post-game markdown report that is consumed by an external GenAI pipeline at `github.com/maxepunk/aboutlastnight` (the `parseRawInput` function). The pipeline parses the markdown by **exact section heading strings and table column positions**. The markdown format is therefore an external API contract, not a mere rendering detail.

Per **Decision B9** (`docs/decisions/2026-06-09-tier-b2-showcontrol-content-pipeline.md`): until Phase 3 delivers a structured JSON session bundle as the canonical artifact, the markdown format must remain byte-compatible. The planned migration: engine emits the structured bundle (schema landed — slice 7) → pipeline consumes the bundle directly (ROADMAP §8.10). There is NO pack-template step — the pack-template design was superseded by the wording mechanism this document describes (program §13.4 ruling). Until that migration is complete, this contract must not change without coordinating the pipeline update first.

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
6. *(revised, A3 slice 7)* — the placeholder/wording rule below

**Wording is pack-declared (v2, A3 slice 7 — program §13.4).** Rules #1–#5
name the STRUCTURE, which stays engine-fixed. Everything else the reader
sees — the empty-section placeholders (the old Rule #6), the summary
bullet labels (including the pipeline-read "Total Transactions" label),
class-count terms, breakdown words, fallback copy, duration units, and
the Scoring Timeline Type noun (per-mode `verbNoun`) — resolves through
`strings.report.*` / the mode table at render time. Three mechanisms
keep the pipeline's view of ALN output unchanged by construction:

- The baked defaults ARE ALN's voice: ALN's pack deliberately declares
  NO report strings section, so the golden masters (which render with no
  pack applied) byte-pin the exact tier the pipeline consumes. A
  snapshot pin fails loudly if any baked default drifts.
- Every pack-declared leaf passes ONE sanitizer (`_rt`/`_cell`: escape
  `|`, newlines to spaces, strip control/bidi) before ANY sink —
  including the H1/metadata-line interpolations — so Rules #4/#5's
  format lines are escape-protected: no wording can add an unescaped
  `|` separator or split a table row. An adversarial-pack contract test
  proves the anchors are byte-identical under hostile wording.
- A divergently-worded pack changes only its OWN report's wording; the
  structural invariants are asserted on every render the contract test
  produces (baked, sparse, empty, divergent, adversarial).

Provenance asymmetry, recorded: the B9 session bundle carries an
`engine` identity stamp; this markdown cannot gain one without breaking
the golden bytes. The scanner warns at export when the applied pack
wording did not come from the network tier — that warn is the only
staleness signal the exported file gets.

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

Status (A3 slice 7, 2026-09-03): the bundle SCHEMA landed as an engine
contract artifact — `backend/contracts/session-bundle.schema.json`
(integer schemaVersion const, engine identity stamp, optional data
sections, reserved `intake` and per-game `gameState` namespaces) with
its own contract suite. No emitter exists yet by design; Phase-4 D
intake is the first writer. The old "markdown template" step is DEAD —
program §13.4 ruled "no template language"; wording is a structured
strings block instead (above).

Remaining path (ROADMAP §8.10, owner-paced):
1. Phase-4 D intake writes `session-bundle.json` instances
2. The GenAI pipeline migrates to consuming the bundle directly
3. This contract document is superseded by the bundle schema
4. The golden master tests are replaced by bundle-schema validation

Until step 3 is complete and confirmed, this contract is binding.
