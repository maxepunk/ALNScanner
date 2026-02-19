import { SessionReportGenerator } from '../../../src/core/sessionReportGenerator.js';

// Shared test fixtures
const mockTokenDatabase = {
  'sof001': {
    SF_RFID: 'sof001',
    SF_ValueRating: 3,
    SF_MemoryType: 'Personal',
    SF_Group: '',
    summary: '11:32PM - SOFIA discovers hidden files on MARCUS laptop.',
    owner: 'SOFIA'
  },
  'mab001': {
    SF_RFID: 'mab001',
    SF_ValueRating: 5,
    SF_MemoryType: 'Technical',
    SF_Group: 'Server Logs (x5)',
    summary: '05/12/2022 - MARCUS refactors the prototype code.',
    owner: 'MARCUS'
  },
  'alr001': {
    SF_RFID: 'alr001',
    SF_ValueRating: 2,
    SF_MemoryType: 'Business',
    SF_Group: '',
    summary: '03/20/2020 - ALEX files lawsuit against MARCUS.',
    owner: 'ALEX'
  },
  'det001': {
    SF_RFID: 'det001',
    SF_ValueRating: 1,
    SF_MemoryType: 'Personal',
    SF_Group: '',
    summary: '04/07/2022 - DEREK meets OLIVER.',
    owner: 'DEREK'
  }
};

const mockSession = {
  id: 'test-session-123',
  name: 'Test Game Night',
  startTime: '2026-02-16T19:00:00.000Z',
  endTime: '2026-02-16T21:15:00.000Z',
  status: 'ended',
  teams: ['Whitemetal Inc.', 'Shadow Corp'],
  metadata: { totalScans: 5, playerScanCount: 3 }
};

const mockScores = [
  { teamId: 'Whitemetal Inc.', score: 800000 },
  { teamId: 'Shadow Corp', score: 150000 }
];

const mockTransactions = [
  {
    id: 'tx-1',
    tokenId: 'sof001',
    teamId: 'Whitemetal Inc.',
    mode: 'detective',
    status: 'accepted',
    points: 0,
    timestamp: '2026-02-16T19:30:00.000Z',
    deviceId: 'GM_STATION_1',
    memoryType: 'Personal',
    valueRating: 3,
    summary: '11:32PM - SOFIA discovers hidden files on MARCUS laptop.'
  },
  {
    id: 'tx-2',
    tokenId: 'mab001',
    teamId: 'Shadow Corp',
    mode: 'blackmarket',
    status: 'accepted',
    points: 750000,
    timestamp: '2026-02-16T19:45:00.000Z',
    deviceId: 'GM_STATION_1',
    memoryType: 'Technical',
    valueRating: 5,
    summary: null
  },
  {
    id: 'tx-3',
    tokenId: 'alr001',
    teamId: 'Whitemetal Inc.',
    mode: 'blackmarket',
    status: 'accepted',
    points: 75000,
    timestamp: '2026-02-16T20:00:00.000Z',
    deviceId: 'GM_STATION_2',
    memoryType: 'Business',
    valueRating: 2,
    summary: null
  }
];

const mockPlayerScans = [
  {
    id: 'ps-1',
    tokenId: 'sof001',
    deviceId: 'PLAYER_42',
    deviceType: 'player',
    timestamp: '2026-02-16T19:15:00.000Z'
  },
  {
    id: 'ps-2',
    tokenId: 'mab001',
    deviceId: 'PLAYER_42',
    deviceType: 'player',
    timestamp: '2026-02-16T19:20:00.000Z'
  },
  {
    id: 'ps-3',
    tokenId: 'det001',
    deviceId: 'PLAYER_07',
    deviceType: 'player',
    timestamp: '2026-02-16T20:30:00.000Z'
  }
];

describe('SessionReportGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = new SessionReportGenerator(mockTokenDatabase);
  });

  describe('constructor', () => {
    it('should store the token database', () => {
      expect(generator.tokenDatabase).toBe(mockTokenDatabase);
    });
  });

  describe('generate()', () => {
    it('should return a markdown string', () => {
      const report = generator.generate({
        session: mockSession,
        scores: mockScores,
        transactions: mockTransactions,
        playerScans: mockPlayerScans
      });
      expect(typeof report).toBe('string');
      expect(report.length).toBeGreaterThan(0);
    });

    it('should include session header with name', () => {
      const report = generator.generate({
        session: mockSession,
        scores: mockScores,
        transactions: mockTransactions,
        playerScans: mockPlayerScans
      });
      expect(report).toContain('# Session Report: Test Game Night');
    });

    it('should include session summary section', () => {
      const report = generator.generate({
        session: mockSession,
        scores: mockScores,
        transactions: mockTransactions,
        playerScans: mockPlayerScans
      });
      expect(report).toContain('## Session Summary');
      expect(report).toContain('Whitemetal Inc.');
      expect(report).toContain('Shadow Corp');
    });
  });

  describe('_buildSessionSummary()', () => {
    it('should include team count and list', () => {
      const summary = generator._buildSessionSummary(
        mockSession, mockScores, mockTransactions, mockPlayerScans
      );
      expect(summary).toContain('Whitemetal Inc.');
      expect(summary).toContain('Shadow Corp');
    });

    it('should include transaction counts by mode', () => {
      const summary = generator._buildSessionSummary(
        mockSession, mockScores, mockTransactions, mockPlayerScans
      );
      expect(summary).toContain('1 detective');
      expect(summary).toContain('2 black market');
    });

    it('should include leaderboard sorted by score descending', () => {
      const summary = generator._buildSessionSummary(
        mockSession, mockScores, mockTransactions, mockPlayerScans
      );
      // Whitemetal $800,000 should be before Shadow Corp $150,000
      const whiteIdx = summary.indexOf('Whitemetal Inc.');
      const shadowIdx = summary.indexOf('Shadow Corp');
      expect(whiteIdx).toBeLessThan(shadowIdx);
    });

    it('should include player scan count', () => {
      const summary = generator._buildSessionSummary(
        mockSession, mockScores, mockTransactions, mockPlayerScans
      );
      expect(summary).toContain('3');
    });
  });

  describe('_buildDetectiveSection()', () => {
    it('should only include detective mode transactions', () => {
      const section = generator._buildDetectiveSection(mockTransactions);
      expect(section).toContain('sof001');
      expect(section).not.toContain('mab001');
      expect(section).not.toContain('alr001');
    });

    it('should include Owner column from token database', () => {
      const section = generator._buildDetectiveSection(mockTransactions);
      expect(section).toContain('SOFIA');
    });

    it('should use Exposed By as the team column header', () => {
      const section = generator._buildDetectiveSection(mockTransactions);
      expect(section).toContain('Exposed By');
    });

    it('should include evidence summary', () => {
      const section = generator._buildDetectiveSection(mockTransactions);
      expect(section).toContain('SOFIA discovers hidden files');
    });

    it('should return a note when no detective transactions exist', () => {
      const section = generator._buildDetectiveSection([
        { ...mockTransactions[1] } // blackmarket only
      ]);
      expect(section).toContain('No detective transactions');
    });
  });

  describe('_buildBlackMarketSection()', () => {
    it('should only include blackmarket mode transactions', () => {
      const section = generator._buildBlackMarketSection(mockTransactions);
      expect(section).toContain('mab001');
      expect(section).toContain('alr001');
      expect(section).not.toContain('sof001');
    });

    it('should use Buried By as the team column header', () => {
      const section = generator._buildBlackMarketSection(mockTransactions);
      expect(section).toContain('Buried By');
    });

    it('should include scoring breakdown', () => {
      const section = generator._buildBlackMarketSection(mockTransactions);
      // mab001: rating 5 Technical = $150,000 × 5x = $750,000
      expect(section).toContain('$750,000');
      expect(section).toContain('Technical');
    });

    it('should include Owner column from token database', () => {
      const section = generator._buildBlackMarketSection(mockTransactions);
      expect(section).toContain('MARCUS');
      expect(section).toContain('ALEX');
    });

    it('should include per-team subtotals', () => {
      const section = generator._buildBlackMarketSection(mockTransactions);
      expect(section).toContain('Shadow Corp');
      expect(section).toContain('Whitemetal Inc.');
    });

    it('should return a note when no blackmarket transactions exist', () => {
      const section = generator._buildBlackMarketSection([
        { ...mockTransactions[0] } // detective only
      ]);
      expect(section).toContain('No black market transactions');
    });
  });

  describe('_buildPlayerActivitySection()', () => {
    it('should list all player scans', () => {
      const section = generator._buildPlayerActivitySection(
        mockPlayerScans, mockTransactions
      );
      expect(section).toContain('sof001');
      expect(section).toContain('mab001');
      expect(section).toContain('det001');
    });

    it('should include Owner column from token database', () => {
      const section = generator._buildPlayerActivitySection(
        mockPlayerScans, mockTransactions
      );
      expect(section).toContain('SOFIA');
      expect(section).toContain('DEREK');
    });

    it('should identify tokens scanned but never turned in', () => {
      const section = generator._buildPlayerActivitySection(
        mockPlayerScans, mockTransactions
      );
      // det001 was scanned by player but never turned in via GM
      expect(section).toContain('det001');
      expect(section).toMatch(/never turned in|not processed/i);
    });

    it('should identify most active devices', () => {
      const section = generator._buildPlayerActivitySection(
        mockPlayerScans, mockTransactions
      );
      // PLAYER_42 scanned 2 tokens, PLAYER_07 scanned 1
      expect(section).toContain('PLAYER_42');
    });

    it('should return a note when no player scans exist', () => {
      const section = generator._buildPlayerActivitySection([], mockTransactions);
      expect(section).toContain('No player scan');
    });
  });

  describe('_formatCurrency()', () => {
    it('should format numbers with dollar sign and commas', () => {
      expect(generator._formatCurrency(750000)).toBe('$750,000');
      expect(generator._formatCurrency(10000)).toBe('$10,000');
      expect(generator._formatCurrency(0)).toBe('$0');
    });
  });

  describe('_formatTimestamp()', () => {
    it('should format ISO timestamp to readable local time', () => {
      const formatted = generator._formatTimestamp('2026-02-16T19:30:00.000Z');
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  describe('_getTokenOwner()', () => {
    it('should return character name from token database', () => {
      expect(generator._getTokenOwner('sof001')).toBe('SOFIA');
      expect(generator._getTokenOwner('mab001')).toBe('MARCUS');
    });

    it('should return "Unknown" for tokens not in database', () => {
      expect(generator._getTokenOwner('nonexistent')).toBe('Unknown');
    });

    it('should return "Unknown" for tokens without character field', () => {
      generator.tokenDatabase = { 'test': { SF_RFID: 'test' } };
      expect(generator._getTokenOwner('test')).toBe('Unknown');
    });
  });

  describe('_formatDuration()', () => {
    it('should format duration in hours and minutes', () => {
      // mockSession: 19:00 to 21:15 = 2h 15m
      const formatted = generator._formatDuration(
        mockSession.startTime, mockSession.endTime
      );
      expect(formatted).toContain('2h');
      expect(formatted).toContain('15m');
    });
  });
});
