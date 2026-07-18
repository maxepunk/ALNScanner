/**
 * @jest-environment jsdom
 */

import { describe, it, expect } from '@jest/globals';
// A3 slice 2 (ledger L1 retirement): scoring-config.json is GONE from
// ALN-TokenData — the pack's game.json `scoring` block is the sole shared
// source, and the baked shim in scoring.js is a VENDORED table. This suite
// pins (a) the vendored shim equal to the real pack file (drift tripwire,
// same doctrine as the modeSemantics tables) and (b) the shim's guard
// behavior.
import gameConfig from '../../../data/game.json';

describe('Vendored Scoring Shim (ledger L2 — baked last resort)', () => {
  it('DRIFT TRIPWIRE: the vendored baked tables mirror data/game.json scoring exactly', async () => {
    const { SCORING_CONFIG } = await import('../../../src/core/scoring.js');

    Object.entries(gameConfig.scoring.baseValues).forEach(([rating, value]) => {
      expect(SCORING_CONFIG.BASE_VALUES[parseInt(rating)]).toBe(value);
    });
    expect(Object.keys(SCORING_CONFIG.BASE_VALUES)).toHaveLength(
      Object.keys(gameConfig.scoring.baseValues).length
    );
    expect(SCORING_CONFIG.TYPE_MULTIPLIERS).toEqual(gameConfig.scoring.typeMultipliers);
    // D2s2: the baked semantics mirror ALN too (allowNegative)
    expect(SCORING_CONFIG.ALLOW_NEGATIVE).toBe(gameConfig.scoring.semantics.allowNegative);
  });

  it('pack game.json declares UNKNOWN as 0x (the null-memory-type contract)', () => {
    expect(gameConfig.scoring.typeMultipliers['UNKNOWN']).toBe(0);
  });

  it('pack game.json declares the Mention and Party multipliers', () => {
    expect(gameConfig.scoring.typeMultipliers['Mention']).toBe(3);
    expect(gameConfig.scoring.typeMultipliers['Party']).toBe(5);
  });

  it('should return 0 for unknown memory types in calculateTokenValue', async () => {
    const { calculateTokenValue } = await import('../../../src/core/scoring.js');

    // Unknown type should return 0 (matches backend behavior)
    const result = calculateTokenValue({
      valueRating: 3,
      memoryType: 'SomeRandomUnknownType',
      isUnknown: false
    });
    expect(result).toBe(0);
  });

  it('should return correct value for known memory types', async () => {
    const { calculateTokenValue, SCORING_CONFIG } = await import('../../../src/core/scoring.js');

    // Rating 3 Technical = 50000 * 5 = 250000
    const result = calculateTokenValue({
      valueRating: 3,
      memoryType: 'Technical',
      isUnknown: false
    });
    expect(result).toBe(SCORING_CONFIG.BASE_VALUES[3] * SCORING_CONFIG.TYPE_MULTIPLIERS['Technical']);
    expect(result).toBe(250000);
  });

  describe('applyPackScoring guard (PR #12 review — empty tables must not wipe baked values)', () => {
    it('rejects an EMPTY-but-present baseValues object and keeps baked values intact', async () => {
      const { applyPackScoring, SCORING_CONFIG } = await import('../../../src/core/scoring.js');
      const bakedBase = { ...SCORING_CONFIG.BASE_VALUES };
      const bakedMult = { ...SCORING_CONFIG.TYPE_MULTIPLIERS };
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // {} is truthy — a falsy-only guard would pass it, delete every
      // baked value, repopulate nothing, and every token scores $0
      // silently for the rest of the session.
      const applied = applyPackScoring({ baseValues: {}, typeMultipliers: { Personal: 1 } });

      expect(applied).toBe(false);
      expect(SCORING_CONFIG.BASE_VALUES).toEqual(bakedBase);
      expect(SCORING_CONFIG.TYPE_MULTIPLIERS).toEqual(bakedMult);
      expect(warnSpy.mock.calls.some(([m]) => String(m).includes('LEGACY SHIM ACTIVE'))).toBe(true);
      warnSpy.mockRestore();
    });

    it('rejects an empty typeMultipliers object the same way', async () => {
      const { applyPackScoring, SCORING_CONFIG } = await import('../../../src/core/scoring.js');
      const bakedBase = { ...SCORING_CONFIG.BASE_VALUES };
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const applied = applyPackScoring({ baseValues: { 1: 10000 }, typeMultipliers: {} });

      expect(applied).toBe(false);
      expect(SCORING_CONFIG.BASE_VALUES).toEqual(bakedBase);
      warnSpy.mockRestore();
    });
  });

  describe('scoring.semantics.allowNegative ingestion (D2s2 — backend _normalizeScoring parity)', () => {
    it('applies the pack flag: false (toy shape) and true (ALN shape)', async () => {
      const { applyPackScoring, SCORING_CONFIG } = await import('../../../src/core/scoring.js');

      applyPackScoring({
        baseValues: { 1: 100 }, typeMultipliers: { Personal: 2 },
        semantics: { allowNegative: false },
      });
      expect(SCORING_CONFIG.ALLOW_NEGATIVE).toBe(false);

      applyPackScoring({
        baseValues: { 1: 100 }, typeMultipliers: { Personal: 2 },
        semantics: { allowNegative: true },
      });
      expect(SCORING_CONFIG.ALLOW_NEGATIVE).toBe(true);
    });

    it('declared scoring WITHOUT semantics gets the conservative floor (strict === true, backend rule)', async () => {
      const { applyPackScoring, SCORING_CONFIG } = await import('../../../src/core/scoring.js');

      applyPackScoring({ baseValues: { 1: 100 }, typeMultipliers: { Personal: 2 } });
      expect(SCORING_CONFIG.ALLOW_NEGATIVE).toBe(false);
    });

    it('the shim path restores the baked default (true, ALN mirror)', async () => {
      const { applyPackScoring, SCORING_CONFIG } = await import('../../../src/core/scoring.js');
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      applyPackScoring({
        baseValues: { 1: 100 }, typeMultipliers: { Personal: 2 },
        semantics: { allowNegative: false },
      });
      expect(SCORING_CONFIG.ALLOW_NEGATIVE).toBe(false);

      applyPackScoring(null); // unusable → baked shim
      expect(SCORING_CONFIG.ALLOW_NEGATIVE).toBe(true);
      warnSpy.mockRestore();
    });
  });
});

describe('pack groups block (D1b/v2 — the SOLE multiplier source)', () => {
  it('parseGroupInfo resolves declared names through the block; everything else reads 1 (no suffix parse exists)', async () => {
    const { applyPackGroups, parseGroupInfo } = await import('../../../src/core/scoring.js');

    applyPackGroups({ 'Server Logs': { multiplier: 7 } });
    // v2 pure name resolves through the block
    expect(parseGroupInfo('Server Logs')).toEqual({ name: 'Server Logs', multiplier: 7 });
    // A lingering "(xN)" suffix is part of the NAME now — it does not
    // resolve to the declared group and never yields a multiplier (the
    // suffix parsers died at the tokens-v2 cutover, D3b)
    expect(parseGroupInfo('Server Logs (x2)')).toEqual({ name: 'Server Logs (x2)', multiplier: 1 });
    // Undeclared name: 1 ("group with no completion bonus")
    expect(parseGroupInfo('Rogue Set')).toEqual({ name: 'Rogue Set', multiplier: 1 });

    applyPackGroups(null); // no block (legacy game.json-less pack): all 1
    expect(parseGroupInfo('Server Logs')).toEqual({ name: 'Server Logs', multiplier: 1 });
  });
});
