import { buildGameActivity } from '../../../src/core/gameActivityBuilder.js';

const mockTokenManager = {
  findToken: jest.fn((id) => ({
    SF_MemoryType: 'Technical',
    SF_ValueRating: 3,
    SF_Group: 'Test Group (x3)',
    summary: 'Test summary'
  }))
};

describe('buildGameActivity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return empty results for no data', () => {
    const result = buildGameActivity({
      transactions: [], playerScans: [], tokenManager: mockTokenManager
    });
    expect(result.tokens).toEqual([]);
    expect(result.stats.totalTokens).toBe(0);
  });

  it('should create discovery events from player scans', () => {
    const scans = [{
      tokenId: 'tok1', deviceId: 'dev1', timestamp: '2026-01-01T00:00:00Z',
      tokenData: { SF_ValueRating: 3, SF_MemoryType: 'Technical' }
    }];
    const result = buildGameActivity({
      transactions: [], playerScans: scans, tokenManager: mockTokenManager
    });
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].status).toBe('available');
    expect(result.tokens[0].events[0].type).toBe('discovery');
    expect(result.stats.available).toBe(1);
  });

  it('should create claim events from transactions', () => {
    const txs = [{
      tokenId: 'tok1', teamId: 'TeamA', mode: 'blackmarket',
      timestamp: '2026-01-01T00:00:00Z', points: 50000,
      memoryType: 'Technical', valueRating: 3
    }];
    const result = buildGameActivity({
      transactions: txs, playerScans: [], tokenManager: mockTokenManager
    });
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].status).toBe('claimed');
    expect(result.tokens[0].events[0].type).toBe('claim');
    expect(result.stats.claimed).toBe(1);
    expect(result.stats.claimedWithoutDiscovery).toBe(1);
  });

  it('should apply transactionFilter when provided', () => {
    const txs = [
      { tokenId: 'tok1', teamId: 'A', mode: 'blackmarket', timestamp: '2026-01-01T00:00:00Z', points: 100, status: 'accepted', memoryType: 'Personal', valueRating: 1 },
      { tokenId: 'tok2', teamId: 'A', mode: 'blackmarket', timestamp: '2026-01-01T00:01:00Z', points: 200, status: 'duplicate', memoryType: 'Personal', valueRating: 1 }
    ];
    const result = buildGameActivity({
      transactions: txs, playerScans: [], tokenManager: mockTokenManager,
      options: { transactionFilter: (tx) => !tx.status || tx.status === 'accepted' }
    });
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].tokenId).toBe('tok1');
  });

  it('should use pointsFallback when tx.points is missing', () => {
    const txs = [{
      tokenId: 'tok1', teamId: 'A', mode: 'blackmarket',
      timestamp: '2026-01-01T00:00:00Z', points: 0,
      memoryType: 'Technical', valueRating: 3
    }];
    const fallback = jest.fn(() => 99999);
    const result = buildGameActivity({
      transactions: txs, playerScans: [], tokenManager: mockTokenManager,
      options: { pointsFallback: fallback }
    });
    expect(fallback).toHaveBeenCalledWith(txs[0]);
    expect(result.tokens[0].events[0].points).toBe(99999);
  });

  it('should sort events chronologically within each token', () => {
    const scans = [{
      tokenId: 'tok1', deviceId: 'dev1', timestamp: '2026-01-01T00:05:00Z',
      tokenData: { SF_ValueRating: 1, SF_MemoryType: 'Personal' }
    }];
    const txs = [{
      tokenId: 'tok1', teamId: 'A', mode: 'blackmarket',
      timestamp: '2026-01-01T00:01:00Z', points: 100,
      memoryType: 'Personal', valueRating: 1
    }];
    const result = buildGameActivity({
      transactions: txs, playerScans: scans, tokenManager: mockTokenManager
    });
    expect(result.tokens[0].events[0].type).toBe('claim');
    expect(result.tokens[0].events[1].type).toBe('discovery');
  });
});
