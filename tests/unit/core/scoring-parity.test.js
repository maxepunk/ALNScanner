/**
 * @jest-environment jsdom
 */

/**
 * calculateTokenValue — backend parity pins (train fix vehicle, LB-2 + LB-3)
 *
 * The parity surface is backend/src/services/tokenService.js
 * calculateTokenValue: EXACT-CASE type lookup via Object.hasOwn (a type
 * named 'constructor' must never resolve via the prototype chain into a
 * Function → NaN — backend round-2 review C10, scanner twin LB-3/S1-3),
 * `??`-style UNKNOWN fallback, and Math.floor on the product (LB-2/S1-4:
 * a pack with fractional multipliers must pay the same integer both sides).
 *
 * Fresh module per test: applyPackScoring mutates SCORING_CONFIG in place,
 * so each test resets modules and re-imports to start from the baked shim.
 */

describe('calculateTokenValue — backend tokenService parity (LB-2 + LB-3)', () => {
  let scoring;
  let warnSpy;

  beforeEach(async () => {
    jest.resetModules();
    // The baked-shim path warns LOUDLY by design; keep test output clean.
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    scoring = await import('../../../src/core/scoring.js');
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('LB-3 — prototype-chain type names never resolve (backend C10 twin)', () => {
    it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__'])(
      'memoryType %j scores 0, not NaN',
      (hostileType) => {
        const result = scoring.calculateTokenValue({
          valueRating: 3,
          memoryType: hostileType,
          isUnknown: false,
        });
        expect(result).toBe(0);
        expect(Number.isNaN(result)).toBe(false);
      }
    );

    it('a null memoryType falls back to UNKNOWN (0x) — backend `type ?? \'\'` twin', () => {
      expect(scoring.calculateTokenValue({
        valueRating: 5,
        memoryType: null,
        isUnknown: false,
      })).toBe(0);
    });

    it('a pack-declared 0 multiplier pays 0 via its OWN entry, not the UNKNOWN fallback', () => {
      scoring.applyPackScoring({
        baseValues: { 1: 10000 },
        typeMultipliers: { Worthless: 0, Personal: 1, UNKNOWN: 0 },
      });
      expect(scoring.calculateTokenValue({
        valueRating: 1,
        memoryType: 'Worthless',
        isUnknown: false,
      })).toBe(0);
      expect(scoring.calculateTokenValue({
        valueRating: 1,
        memoryType: 'Personal',
        isUnknown: false,
      })).toBe(10000);
    });
  });

  describe('LB-2 — Math.floor on the product (backend tokenService twin)', () => {
    it('a fractional pack multiplier floors to the same integer the backend pays', () => {
      scoring.applyPackScoring({
        baseValues: { 1: 10001 },
        typeMultipliers: { Half: 0.5, UNKNOWN: 0 },
      });
      // 10001 × 0.5 = 5000.5 → the backend pays Math.floor = 5000; a
      // scanner paying 5000.5 drifts the standalone ledger off parity.
      expect(scoring.calculateTokenValue({
        valueRating: 1,
        memoryType: 'Half',
        isUnknown: false,
      })).toBe(5000);
    });

    it('integer products are untouched by the floor (baked ALN values)', () => {
      expect(scoring.calculateTokenValue({
        valueRating: 3,
        memoryType: 'Technical',
        isUnknown: false,
      })).toBe(250000);
    });
  });
});
