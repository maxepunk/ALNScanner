import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import TokenManager, { TokenManagerClass } from '../../../src/core/tokenManager.js';

/**
 * TokenManager Tests - Validating Real Behavior
 * ✅ Test actual token lookup logic, group building
 * ✅ Only mock external dependencies (fetch)
 * ❌ DON'T test that Debug.log was called - test outcomes
 */

describe('TokenManager - ES6 Module', () => {
  beforeEach(() => {
    // Reset singleton state
    TokenManager.database = {};
    TokenManager.groupInventory = null;
    TokenManager._dataManagerHelpers = null;

    // Mock fetch for loadDatabase tests
    global.fetch = jest.fn();
  });

  it('should export TokenManager singleton', () => {
    expect(TokenManager).toBeInstanceOf(TokenManagerClass);
  });

  describe('loadDatabase', () => {
    it('should load tokens from data/tokens.json', async () => {
      const mockTokens = {
        "token1": { SF_RFID: "token1", SF_ValueRating: 3, SF_MemoryType: "Technical" }
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        url: 'data/tokens.json',
        json: () => Promise.resolve(mockTokens)
      });

      const result = await TokenManager.loadDatabase();

      expect(result).toBe(true);
      expect(TokenManager.database).toEqual(mockTokens);
      expect(TokenManager.groupInventory).toBeDefined();
    });

    it('should fallback to root tokens.json if data/ fails', async () => {
      const mockTokens = {
        "token2": { SF_RFID: "token2", SF_ValueRating: 5, SF_MemoryType: "Business" }
      };

      global.fetch
        .mockResolvedValueOnce({ ok: false }) // data/tokens.json fails
        .mockResolvedValueOnce({ // tokens.json succeeds
          ok: true,
          url: 'tokens.json',
          json: () => Promise.resolve(mockTokens)
        });

      const result = await TokenManager.loadDatabase();

      expect(result).toBe(true);
      expect(TokenManager.database).toEqual(mockTokens);
    });

    it('should load demo data if both paths fail', async () => {
      global.fetch.mockResolvedValue({ ok: false });

      const result = await TokenManager.loadDatabase();

      expect(result).toBe(false);
      expect(Object.keys(TokenManager.database).length).toBeGreaterThan(0);
      expect(TokenManager.database['deadbeef']).toBeDefined();
    });
  });

  describe('loadDemoData', () => {
    it('should load predefined demo tokens', () => {
      TokenManager.loadDemoData();

      expect(TokenManager.database['a1b2c3d4']).toBeDefined();
      expect(TokenManager.database['deadbeef']).toBeDefined();
      expect(TokenManager.database['cafe1234']).toBeDefined();
      expect(TokenManager.groupInventory).toBeDefined();
    });

    it('should build group inventory from demo data', () => {
      TokenManager.loadDemoData();

      const groups = Object.values(TokenManager.groupInventory);
      expect(groups.length).toBeGreaterThan(0);

      // Server Logs group should have 2 tokens
      const serverLogs = groups.find(g => g.displayName.includes('Server Logs'));
      expect(serverLogs).toBeDefined();
      expect(serverLogs.tokens.size).toBe(2);
      expect(serverLogs.multiplier).toBe(5);
    });
  });

  describe('buildGroupInventory', () => {
    beforeEach(() => {
      TokenManager.database = {
        "token1": { SF_RFID: "token1", SF_ValueRating: 3, SF_MemoryType: "Technical", SF_Group: "Test Group (x5)" },
        "token2": { SF_RFID: "token2", SF_ValueRating: 2, SF_MemoryType: "Technical", SF_Group: "Test Group (x5)" },
        "token3": { SF_RFID: "token3", SF_ValueRating: 5, SF_MemoryType: "Business", SF_Group: "test group (x5)" } // lowercase
      };
    });

    it('should normalize group names case-insensitively', () => {
      const inventory = TokenManager.buildGroupInventory();

      const groups = Object.keys(inventory);
      expect(groups.length).toBe(1); // All 3 tokens in same group

      const testGroup = inventory[groups[0]];
      expect(testGroup.tokens.size).toBe(3);
      expect(testGroup.multiplier).toBe(5);
    });

    it('should track multiple memory types in group', () => {
      const inventory = TokenManager.buildGroupInventory();
      const group = Object.values(inventory)[0];

      expect(group.memoryTypes.has('Technical')).toBe(true);
      expect(group.memoryTypes.has('Business')).toBe(true);
      expect(group.memoryTypes.size).toBe(2);
    });

    it('should handle tokens without groups', () => {
      TokenManager.database = {
        "solo1": { SF_RFID: "solo1", SF_ValueRating: 3, SF_MemoryType: "Personal" },
        "solo2": { SF_RFID: "solo2", SF_ValueRating: 2, SF_MemoryType: "Technical", SF_Group: "" }
      };

      const inventory = TokenManager.buildGroupInventory();

      // Tokens with no group or empty group get normalized to ""
      expect(inventory[""]).toBeDefined();
      expect(inventory[""].tokens.size).toBe(2);
    });
  });

  describe('findToken - Fuzzy Matching', () => {
    beforeEach(() => {
      TokenManager.database = {
        "abc123": { SF_RFID: "abc123", SF_ValueRating: 3 },
        "DEAD:BE:EF": { SF_RFID: "DEAD:BE:EF", SF_ValueRating: 5 },
        "cafe1234": { SF_RFID: "cafe1234", SF_ValueRating: 2 }
      };
    });

    it('should find exact match', () => {
      const result = TokenManager.findToken('abc123');

      expect(result).not.toBeNull();
      expect(result.token.SF_RFID).toBe('abc123');
      expect(result.matchedId).toBe('abc123');
    });

    it('should match case-insensitively', () => {
      const result = TokenManager.findToken('ABC123');

      expect(result).not.toBeNull();
      expect(result.matchedId).toBe('abc123');
    });

    it('should match with colons removed', () => {
      const result = TokenManager.findToken('DEADBEEF');

      expect(result).not.toBeNull();
      expect(result.token.SF_RFID).toBe('DEAD:BE:EF');
      expect(result.matchedId).toBe('DEAD:BE:EF');
    });

    it('should match lowercase without colons', () => {
      const result = TokenManager.findToken('dead:be:ef');

      expect(result).not.toBeNull();
      expect(result.token.SF_RFID).toBe('DEAD:BE:EF');
    });

    it('should add colons for hex strings', () => {
      const result = TokenManager.findToken('cafe1234');

      expect(result).not.toBeNull();
      expect(result.token.SF_RFID).toBe('cafe1234');
    });

    it('should return null for non-existent token', () => {
      const result = TokenManager.findToken('unknown999');

      expect(result).toBeNull();
    });
  });

  describe('getAllTokens', () => {
    it('should return array of all token objects', () => {
      TokenManager.database = {
        "token1": { SF_RFID: "token1", SF_ValueRating: 3 },
        "token2": { SF_RFID: "token2", SF_ValueRating: 5 }
      };

      const tokens = TokenManager.getAllTokens();

      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBe(2);
      expect(tokens[0].SF_RFID).toBeDefined();
    });

    it('should return empty array for empty database', () => {
      TokenManager.database = {};

      const tokens = TokenManager.getAllTokens();

      expect(tokens).toEqual([]);
    });
  });

  describe('getGroupInventory', () => {
    it('should return cached inventory if available', () => {
      const mockInventory = { "test": { tokens: new Set(["t1"]) } };
      TokenManager.groupInventory = mockInventory;

      const result = TokenManager.getGroupInventory();

      expect(result).toBe(mockInventory);
    });

    it('should build inventory if not cached', () => {
      TokenManager.groupInventory = null;
      TokenManager.database = {
        "t1": { SF_RFID: "t1", SF_ValueRating: 3, SF_MemoryType: "Personal", SF_Group: "Group A (x2)" }
      };

      const result = TokenManager.getGroupInventory();

      expect(result).toBeDefined();
      expect(TokenManager.groupInventory).toBe(result);
    });
  });

  describe('setDataManagerHelpers', () => {
    it('should inject DataManager helper methods', () => {
      const mockHelpers = {
        parseGroupInfo: jest.fn(),
        normalizeGroupName: jest.fn()
      };

      TokenManager.setDataManagerHelpers(mockHelpers);

      expect(TokenManager._dataManagerHelpers).toBe(mockHelpers);
    });
  });
});
