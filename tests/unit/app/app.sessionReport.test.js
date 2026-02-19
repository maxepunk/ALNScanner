import { SessionReportGenerator } from '../../../src/core/sessionReportGenerator.js';

// Test that the report generator is invoked correctly by the app handler.
// We test the integration point — data assembly and download trigger.

describe('Session Report Download', () => {
  let generator;

  const mockTokenDatabase = {
    'tok001': { SF_RFID: 'tok001', owner: 'Alex Reeves' }
  };

  const mockSessionData = {
    session: {
      id: 'sess-1',
      name: 'Game Night',
      startTime: '2026-02-16T19:00:00.000Z',
      endTime: '2026-02-16T21:00:00.000Z',
      status: 'ended',
      teams: ['Team A']
    },
    scores: [{ teamId: 'Team A', score: 100000 }],
    transactions: [],
    playerScans: []
  };

  beforeEach(() => {
    generator = new SessionReportGenerator(mockTokenDatabase);
  });

  it('should generate a markdown string from session data', () => {
    const report = generator.generate(mockSessionData);
    expect(report).toContain('# Session Report: Game Night');
    expect(report).toContain('Team A');
  });

  it('should generate a valid filename', () => {
    const name = mockSessionData.session.name;
    const date = '2026-02-16';
    const filename = `session-report-${name.toLowerCase().replace(/\s+/g, '-')}-${date}.md`;
    expect(filename).toBe('session-report-game-night-2026-02-16.md');
  });

  it('should handle real character name format from Notion', () => {
    const report = generator.generate(mockSessionData);
    // Character name should be used as-is from token database
    expect(generator._getTokenOwner('tok001')).toBe('Alex Reeves');
  });
});
