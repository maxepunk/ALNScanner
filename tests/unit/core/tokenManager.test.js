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

  describe('loadDatabase (via packLoader — Phase 3 A2)', () => {
    // The direct-fetch chain (HTTP-3 root-first order, HTTP-4 SPA-shell and
    // empty-map guards) moved INTO the pack loader's bundled tier — see
    // tests/unit/core/packLoader.test.js for that coverage. These tests pin
    // TokenManager's own behavior: database/state wiring, runtime scoring
    // application, and fail-hard semantics.
    const PACK_INFO = {
      packId: 'about-last-night',
      version: '1.0.0',
      contentHash: `sha256:${'a'.repeat(64)}`,
      source: 'network',
    };

    function mockPack({ tokens, gameConfig = null }) {
      TokenManager._packLoader = {
        loadPack: jest.fn().mockResolvedValue({ tokens, gameConfig, info: { ...PACK_INFO } }),
        getActivePack: jest.fn(() => ({ ...PACK_INFO })),
      };
    }

    it('loads the token database and group inventory from the pack', async () => {
      const mockTokens = {
        token1: { SF_RFID: 'token1', SF_ValueRating: 3, SF_MemoryType: 'Technical' },
      };
      mockPack({ tokens: mockTokens });

      const result = await TokenManager.loadDatabase();

      expect(result).toBe(true);
      expect(TokenManager.database).toEqual(mockTokens);
      expect(TokenManager.groupInventory).toBeDefined();
    });

    const pristineScoring = (() => {
      const { SCORING_CONFIG } = require('../../../src/core/scoring.js');
      return {
        BASE_VALUES: { ...SCORING_CONFIG.BASE_VALUES },
        TYPE_MULTIPLIERS: { ...SCORING_CONFIG.TYPE_MULTIPLIERS },
      };
    })();
    afterEach(() => {
      // applyPackScoring mutates the exported singleton in place — undo it
      // so tests can't leak pack values into each other.
      const { SCORING_CONFIG } = require('../../../src/core/scoring.js');
      for (const key of Object.keys(SCORING_CONFIG.BASE_VALUES)) delete SCORING_CONFIG.BASE_VALUES[key];
      Object.assign(SCORING_CONFIG.BASE_VALUES, pristineScoring.BASE_VALUES);
      for (const key of Object.keys(SCORING_CONFIG.TYPE_MULTIPLIERS)) delete SCORING_CONFIG.TYPE_MULTIPLIERS[key];
      Object.assign(SCORING_CONFIG.TYPE_MULTIPLIERS, pristineScoring.TYPE_MULTIPLIERS);
    });

    it('applies runtime pack scoring from game.json (the F-TOOL-05 kill)', async () => {
      const { SCORING_CONFIG } = require('../../../src/core/scoring.js');
      mockPack({
        tokens: { t1: { SF_RFID: 't1', SF_ValueRating: 1, SF_MemoryType: 'Personal' } },
        gameConfig: {
          scoring: {
            baseValues: { 1: 111, 2: 222, 3: 333, 4: 444, 5: 555 },
            typeMultipliers: { Personal: 9, UNKNOWN: 0 },
          },
        },
      });

      await TokenManager.loadDatabase();

      expect(SCORING_CONFIG.BASE_VALUES[1]).toBe(111);
      expect(SCORING_CONFIG.BASE_VALUES[5]).toBe(555);
      expect(SCORING_CONFIG.TYPE_MULTIPLIERS.Personal).toBe(9);
    });

    it('warns and keeps baked scoring when the pack has no game.json (ledger L2 shim)', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockPack({
        tokens: { t1: { SF_RFID: 't1', SF_ValueRating: 1, SF_MemoryType: 'Personal' } },
        gameConfig: null,
      });

      await TokenManager.loadDatabase();

      expect(warnSpy.mock.calls.some(([m]) => String(m).includes('LEGACY SHIM ACTIVE'))).toBe(true);
      const { SCORING_CONFIG } = require('../../../src/core/scoring.js');
      expect(SCORING_CONFIG.BASE_VALUES).toEqual(pristineScoring.BASE_VALUES);
      expect(SCORING_CONFIG.TYPE_MULTIPLIERS).toEqual(pristineScoring.TYPE_MULTIPLIERS);
      warnSpy.mockRestore();
    });

    it('tolerates null pack identity (bundled tier without a readable manifest)', async () => {
      TokenManager._packLoader = {
        loadPack: jest.fn().mockResolvedValue({
          tokens: { t1: { SF_RFID: 't1', SF_ValueRating: 2, SF_MemoryType: 'Business' } },
          gameConfig: { /* no scoring block */ },
          info: { packId: null, version: null, contentHash: null, source: 'bundled' },
        }),
        getActivePack: jest.fn(() => null),
      };
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await TokenManager.loadDatabase();

      expect(result).toBe(true);
      expect(Object.keys(TokenManager.database)).toEqual(['t1']);
      warnSpy.mockRestore();
    });

    it('returns false and leaves the database empty when the pack load fails', async () => {
      // "CRITICAL: Fail hard if database cannot be loaded. Do NOT load demo data."
      TokenManager._packLoader = {
        loadPack: jest.fn().mockRejectedValue(new Error('all tiers failed')),
        getActivePack: jest.fn(() => null),
      };

      const result = await TokenManager.loadDatabase();

      expect(result).toBe(false);
      expect(Object.keys(TokenManager.database).length).toBe(0);
    });
  });

  // NOTE: loadDemoData was removed as a design decision.
  // Scanner now fails hard if tokens.json cannot be loaded.
  // This ensures proper token data is always available for game sessions.

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
