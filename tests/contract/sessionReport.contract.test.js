/**
 * Session Report Contract Test — GOLDEN MASTER
 *
 * EXTERNAL CONTRACT: The markdown produced by SessionReportGenerator is consumed
 * by the owner's GenAI pipeline (github.com/maxepunk/aboutlastnight parseRawInput).
 * The pipeline parses section headings and markdown table columns by exact string
 * matching. ANY change to section titles, table header rows, column ordering, or
 * separator structure WILL break the pipeline.
 *
 * Per decision B9 (docs/decisions/2026-06-09-tier-b2-showcontrol-content-pipeline.md):
 * - Until Phase 3 delivers a structured JSON bundle, the markdown format IS the contract.
 * - Changes to this output require a coordinated pipeline update FIRST.
 * - This test file is the enforcement mechanism: if it fails, you broke the contract.
 *
 * See: docs/session-report-contract.md for full documentation.
 *
 * DO NOT update the golden string or relax the structural assertions without
 * first coordinating with the GenAI pipeline owner.
 */

import { SessionReportGenerator } from '../../src/core/sessionReportGenerator.js';

// ---------------------------------------------------------------------------
// Rich fixture: exercises all code paths (both transaction modes, group
// completion, player scans, admin adjustment, rejected transactions).
// Timestamps are UTC-fixed so formatted times are deterministic in any TZ.
// The jsdom environment sets TZ to UTC; toLocaleTimeString('en-US') renders
// UTC times which are the same as the fixture values below.
// ---------------------------------------------------------------------------

const CONTRACT_TOKEN_DATABASE = {
  'sof001': {
    SF_RFID: 'sof001',
    SF_ValueRating: 3,
    SF_MemoryType: 'Personal',
    SF_Group: '',
    summary: 'Sof discovers hidden files.',
    owner: 'SOFIA',
  },
  'mab001': {
    SF_RFID: 'mab001',
    SF_ValueRating: 5,
    SF_MemoryType: 'Technical',
    SF_Group: 'Server Logs (x5)',
    summary: 'Marcus refactors code.',
    owner: 'MARCUS',
  },
  'alr001': {
    SF_RFID: 'alr001',
    SF_ValueRating: 2,
    SF_MemoryType: 'Business',
    SF_Group: '',
    summary: 'Alex files lawsuit.',
    owner: 'ALEX',
  },
  'det001': {
    SF_RFID: 'det001',
    SF_ValueRating: 1,
    SF_MemoryType: 'Personal',
    SF_Group: '',
    summary: 'Derek meets Oliver.',
    owner: 'DEREK',
  },
  'jam001': {
    SF_RFID: 'jam001',
    SF_ValueRating: 4,
    SF_MemoryType: 'Party',
    SF_Group: 'Server Logs (x5)',
    summary: 'James hosts party.',
    owner: 'JAMES',
  },
};

const CONTRACT_SESSION = {
  id: 'contract-test-session-v1',
  name: 'About Last Night — Contract Test',
  startTime: '2026-02-16T19:00:00.000Z',
  endTime: '2026-02-16T21:00:00.000Z',
  status: 'ended',
  teams: ['Whitemetal Inc.', 'Shadow Corp', 'Red Handed'],
};

const CONTRACT_SCORES = [
  {
    teamId: 'Whitemetal Inc.',
    score: 975000,
    adminAdjustments: [
      {
        delta: 50000,
        reason: 'Puzzle bonus',
        timestamp: '2026-02-16T20:30:00.000Z',
        gmStation: 'GM_STATION_1',
      },
    ],
  },
  { teamId: 'Shadow Corp', score: 225000, adminAdjustments: [] },
  {
    teamId: 'Red Handed',
    score: 0,
    adminAdjustments: [
      {
        delta: -25000,
        reason: 'Penalty: rule violation',
        timestamp: '2026-02-16T20:45:00.000Z',
        gmStation: 'GM_STATION_2',
      },
    ],
  },
];

const CONTRACT_TRANSACTIONS = [
  // detective mode — two tokens
  {
    id: 'tx-1', tokenId: 'sof001', teamId: 'Whitemetal Inc.',
    mode: 'detective', status: 'accepted', points: 0,
    timestamp: '2026-02-16T19:30:00.000Z', deviceId: 'GM_STATION_1',
    memoryType: 'Personal', valueRating: 3,
    summary: 'Sof discovers hidden files.',
  },
  {
    id: 'tx-4', tokenId: 'det001', teamId: 'Whitemetal Inc.',
    mode: 'detective', status: 'accepted', points: 0,
    timestamp: '2026-02-16T20:15:00.000Z', deviceId: 'GM_STATION_1',
    memoryType: 'Personal', valueRating: 1,
    summary: 'Derek meets Oliver.',
  },
  // blackmarket mode — three tokens across two teams
  {
    id: 'tx-2', tokenId: 'mab001', teamId: 'Shadow Corp',
    mode: 'blackmarket', status: 'accepted', points: 750000,
    timestamp: '2026-02-16T19:45:00.000Z', deviceId: 'GM_STATION_1',
    memoryType: 'Technical', valueRating: 5, summary: null,
  },
  {
    id: 'tx-3', tokenId: 'alr001', teamId: 'Whitemetal Inc.',
    mode: 'blackmarket', status: 'accepted', points: 75000,
    timestamp: '2026-02-16T20:00:00.000Z', deviceId: 'GM_STATION_2',
    memoryType: 'Business', valueRating: 2, summary: null,
  },
  {
    id: 'tx-5', tokenId: 'jam001', teamId: 'Shadow Corp',
    mode: 'blackmarket', status: 'accepted', points: 375000,
    timestamp: '2026-02-16T20:20:00.000Z', deviceId: 'GM_STATION_2',
    memoryType: 'Party', valueRating: 4, summary: null,
  },
  // rejected transaction — must NOT appear in any section
  {
    id: 'tx-6', tokenId: 'mab001', teamId: 'Red Handed',
    mode: 'blackmarket', status: 'rejected', points: 0,
    timestamp: '2026-02-16T20:25:00.000Z', deviceId: 'GM_STATION_2',
    memoryType: 'Technical', valueRating: 5, summary: null,
  },
];

const CONTRACT_PLAYER_SCANS = [
  { id: 'ps-1', tokenId: 'sof001', deviceId: 'PLAYER_42', deviceType: 'player', timestamp: '2026-02-16T19:10:00.000Z' },
  { id: 'ps-2', tokenId: 'mab001', deviceId: 'PLAYER_42', deviceType: 'player', timestamp: '2026-02-16T19:20:00.000Z' },
  { id: 'ps-3', tokenId: 'det001', deviceId: 'PLAYER_07', deviceType: 'player', timestamp: '2026-02-16T20:25:00.000Z' },
  { id: 'ps-4', tokenId: 'jam001', deviceId: 'PLAYER_42', deviceType: 'player', timestamp: '2026-02-16T20:30:00.000Z' },
  { id: 'ps-5', tokenId: 'sof001', deviceId: 'PLAYER_07', deviceType: 'player', timestamp: '2026-02-16T20:40:00.000Z' },
  { id: 'ps-6', tokenId: 'det001', deviceId: 'PLAYER_42', deviceType: 'player', timestamp: '2026-02-16T20:50:00.000Z' },
];

// ---------------------------------------------------------------------------
// The EXACT golden output produced by SessionReportGenerator v1.
// Pinned to byte-level fidelity. If this string changes, the GenAI pipeline
// parseRawInput WILL break. Coordinate with the pipeline owner before
// updating. See docs/session-report-contract.md.
// ---------------------------------------------------------------------------
const GOLDEN_OUTPUT = `# Session Report: About Last Night — Contract Test
**Monday, February 16, 2026 | Duration: 2h 0m | Teams: 3**

## Session Summary

- **Teams:** Whitemetal Inc., Shadow Corp, Red Handed
- **Total Transactions:** 5 (2 detective, 3 black market)
- **Player Scans:** 6
- **Unique Tokens Processed:** 5

### Final Standings

1. **Whitemetal Inc.** — $975,000 ($925,000 transactions +$50,000 adjustments)
2. **Shadow Corp** — $225,000
3. **Red Handed** — $0 ($25,000 transactions $-25,000 adjustments)

---

## Detective Evidence Log

| Token | Owner | Exposed By | Time | Evidence |
|-------|-------|------------|------|----------|
| det001 | DEREK | Whitemetal Inc. | 08:15 PM | Derek meets Oliver. |
| sof001 | SOFIA | Whitemetal Inc. | 07:30 PM | Sof discovers hidden files. |

---

## Scoring Timeline

| Time | Type | Detail | Team | Amount |
|------|------|--------|------|--------|
| 07:45 PM | Sale | mab001/MARCUS (5★ Technical, $150,000 \xd7 5x) | Shadow Corp | +$750,000 |
| 08:00 PM | Sale | alr001/ALEX (2★ Business, $25,000 \xd7 3x) | Whitemetal Inc. | +$75,000 |
| 08:20 PM | Sale | jam001/JAMES (4★ Party, $75,000 \xd7 5x) | Shadow Corp | +$375,000 |
| 08:30 PM | Adjustment | Puzzle bonus (GM_STATION_1) | Whitemetal Inc. | +$50,000 |
| 08:45 PM | Adjustment | Penalty: rule violation (GM_STATION_2) | Red Handed | -$25,000 |

### Final Totals

- **Shadow Corp:** $1,125,000 ($1,125,000 sales + $0 adjustments)
- **Whitemetal Inc.:** $125,000 ($75,000 sales + $50,000 adjustments)
- **Red Handed:** -$25,000 ($0 sales - $25,000 adjustments)

---

## Player Activity

| Token | Owner | Device | Time |
|-------|-------|--------|------|
| sof001 | SOFIA | PLAYER_42 | 07:10 PM |
| mab001 | MARCUS | PLAYER_42 | 07:20 PM |
| det001 | DEREK | PLAYER_07 | 08:25 PM |
| jam001 | JAMES | PLAYER_42 | 08:30 PM |
| sof001 | SOFIA | PLAYER_07 | 08:40 PM |
| det001 | DEREK | PLAYER_42 | 08:50 PM |

### Activity Stats

**Most Active Devices:**
- PLAYER_42: 4 scans
- PLAYER_07: 2 scans

**Most Scanned Tokens:**
- sof001 (SOFIA): 2 scans
- det001 (DEREK): 2 scans

`;

// ---------------------------------------------------------------------------
// Helper: extract all H2/H3 section headings from a markdown string
// ---------------------------------------------------------------------------
function extractHeadings(markdown) {
  return markdown
    .split('\n')
    .filter(line => /^#{2,3} /.test(line))
    .map(line => line.trim());
}

// ---------------------------------------------------------------------------
// Helper: extract table header rows (lines that start with "| " and are
// immediately followed by a separator line "|---")
// ---------------------------------------------------------------------------
function extractTableHeaders(markdown) {
  const lines = markdown.split('\n');
  const headers = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].startsWith('| ') && lines[i + 1].startsWith('|---')) {
      headers.push(lines[i].trim());
    }
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('SessionReportGenerator — External Contract (v1)', () => {
  let generator;
  let report;

  beforeAll(() => {
    generator = new SessionReportGenerator(CONTRACT_TOKEN_DATABASE);
    report = generator.generate({
      session: CONTRACT_SESSION,
      scores: CONTRACT_SCORES,
      transactions: CONTRACT_TRANSACTIONS,
      playerScans: CONTRACT_PLAYER_SCANS,
    });
  });

  // -- Golden master (byte-exact) ------------------------------------------

  it('GOLDEN MASTER: output matches the pinned contract string byte-for-byte', () => {
    // If this test fails, the GenAI pipeline parseRawInput will break.
    // DO NOT update GOLDEN_OUTPUT without coordinating a pipeline migration.
    expect(report).toBe(GOLDEN_OUTPUT);
  });

  // -- Structural assertions (readable failure messages) --------------------

  describe('Section headings (GenAI pipeline anchors)', () => {
    it('contains exactly the required top-level sections in order', () => {
      const headings = extractHeadings(report);
      expect(headings).toEqual([
        '## Session Summary',
        '### Final Standings',
        '## Detective Evidence Log',
        '## Scoring Timeline',
        '### Final Totals',
        '## Player Activity',
        '### Activity Stats',
      ]);
    });

    it('has "Session Summary" as the first H2 section', () => {
      expect(report).toMatch(/^# Session Report:.+\n\*\*.+\n\n## Session Summary/m);
    });

    it('has "Detective Evidence Log" section heading (pipeline anchor)', () => {
      expect(report).toContain('## Detective Evidence Log');
    });

    it('has "Scoring Timeline" section heading (pipeline anchor)', () => {
      expect(report).toContain('## Scoring Timeline');
    });

    it('has "Player Activity" section heading (pipeline anchor)', () => {
      expect(report).toContain('## Player Activity');
    });
  });

  describe('Table column structure (GenAI pipeline column indices)', () => {
    it('Detective Evidence Log table has correct column headers in order', () => {
      const headers = extractTableHeaders(report);
      const detectiveHeader = headers.find(h => h.includes('Exposed By'));
      expect(detectiveHeader).toBe('| Token | Owner | Exposed By | Time | Evidence |');
    });

    it('Scoring Timeline table has correct column headers in order', () => {
      const headers = extractTableHeaders(report);
      const timelineHeader = headers.find(h => h.includes('Type') && h.includes('Detail'));
      expect(timelineHeader).toBe('| Time | Type | Detail | Team | Amount |');
    });

    it('Player Activity table has correct column headers in order', () => {
      const headers = extractTableHeaders(report);
      const playerHeader = headers.find(h => h.includes('Device'));
      expect(playerHeader).toBe('| Token | Owner | Device | Time |');
    });
  });

  describe('Report header format', () => {
    it('starts with H1 "# Session Report: <name>"', () => {
      expect(report).toMatch(/^# Session Report: /);
    });

    it('second line is bold metadata with | separators (Duration, Teams)', () => {
      const lines = report.split('\n');
      expect(lines[1]).toMatch(/^\*\*.*\| Duration:.*\| Teams:/);
    });
  });

  describe('Content correctness', () => {
    it('excludes rejected transactions (sales rows) from Scoring Timeline', () => {
      // tx-6 is a rejected blackmarket transaction for Red Handed.
      // It must NOT appear as a Sale row. Note: Red Handed CAN appear as an
      // Adjustment row (they have an admin penalty adjustment), which is correct.
      const timelineSection = report.slice(
        report.indexOf('## Scoring Timeline'),
        report.indexOf('## Player Activity'),
      );
      // The Sale column (Type = Sale) must not list Red Handed as a team
      const saleRows = timelineSection
        .split('\n')
        .filter(l => l.includes('| Sale |'));
      for (const row of saleRows) {
        expect(row).not.toContain('Red Handed');
      }
    });

    it('includes admin adjustments in Scoring Timeline', () => {
      expect(report).toContain('Adjustment');
      expect(report).toContain('Puzzle bonus (GM_STATION_1)');
      expect(report).toContain('Penalty: rule violation (GM_STATION_2)');
    });

    it('includes both detective and blackmarket transaction counts in summary', () => {
      expect(report).toContain('2 detective');
      expect(report).toContain('3 black market');
    });

    it('sorts detective evidence log alphabetically by tokenId', () => {
      const detectiveSection = report.slice(
        report.indexOf('## Detective Evidence Log'),
        report.indexOf('## Scoring Timeline'),
      );
      const detIdx = detectiveSection.indexOf('| det001');
      const sofIdx = detectiveSection.indexOf('| sof001');
      expect(detIdx).toBeGreaterThan(0);
      expect(sofIdx).toBeGreaterThan(0);
      expect(detIdx).toBeLessThan(sofIdx);
    });

    it('sorts scoring timeline events chronologically', () => {
      const timeline = report.slice(
        report.indexOf('## Scoring Timeline'),
        report.indexOf('### Final Totals'),
      );
      const mabIdx = timeline.indexOf('mab001');
      const alrIdx = timeline.indexOf('alr001');
      const jamIdx = timeline.indexOf('jam001');
      const puzzleIdx = timeline.indexOf('Puzzle bonus');
      const penaltyIdx = timeline.indexOf('Penalty:');
      expect(mabIdx).toBeGreaterThan(0);
      expect(mabIdx).toBeLessThan(alrIdx);
      expect(alrIdx).toBeLessThan(jamIdx);
      expect(jamIdx).toBeLessThan(puzzleIdx);
      expect(puzzleIdx).toBeLessThan(penaltyIdx);
    });

    it('leaderboard sorts teams by score descending', () => {
      const summarySection = report.slice(
        report.indexOf('### Final Standings'),
        report.indexOf('---'),
      );
      const whiteIdx = summarySection.indexOf('Whitemetal Inc.');
      const shadowIdx = summarySection.indexOf('Shadow Corp');
      const redIdx = summarySection.indexOf('Red Handed');
      expect(whiteIdx).toBeLessThan(shadowIdx);
      expect(shadowIdx).toBeLessThan(redIdx);
    });

    it('player activity table is sorted chronologically', () => {
      const activitySection = report.slice(
        report.indexOf('## Player Activity'),
      );
      const sof1Idx = activitySection.indexOf('PLAYER_42 | 07:10 PM');
      const mabIdx = activitySection.indexOf('PLAYER_42 | 07:20 PM');
      expect(sof1Idx).toBeGreaterThan(0);
      expect(sof1Idx).toBeLessThan(mabIdx);
    });
  });

  describe('Section separators (GenAI pipeline section boundaries)', () => {
    it('separates all major sections with "---" horizontal rule', () => {
      // The pipeline uses --- to delimit sections. Count them.
      const separators = report.split('\n').filter(l => l.trim() === '---');
      // Expected: after Session Summary, after Detective Evidence Log,
      // after Scoring Timeline = 3 separators
      expect(separators.length).toBe(3);
    });
  });
});
