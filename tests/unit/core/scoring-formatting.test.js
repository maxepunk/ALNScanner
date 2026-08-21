/**
 * @jest-environment jsdom
 */

// A3 slice 3b: star construction + the money-format wiring through
// applyPackScoring. Stars centralize the three ad-hoc constructions
// (uiManager ⭐-repeat, GameOpsRenderer's odd 1+repeat(r-1), and the
// hardcoded-5-scale ★/☆ card rating that threw RangeError for r>5).
// Glyphs stay per-surface baked (Q-3b-2 held — theming is 3c territory);
// only the CONSTRUCTION and the scale derivation are shared.

import { describe, it, expect, afterEach } from '@jest/globals';
import { applyPackScoring, formatStars } from '../../../src/core/scoring.js';
import { formatCurrency, applyPackMoneyFormat } from '../../../src/utils/formatCurrency.js';

const PACK_SCORING = {
  baseValues: { 1: 100, 2: 200, 3: 300, 4: 400, 5: 500 },
  typeMultipliers: { Personal: 1, UNKNOWN: 0 },
};

describe('formatStars (slice 3b construction helper)', () => {
  afterEach(() => {
    applyPackScoring(null); // shim path resets scale to the baked 5-table
    applyPackMoneyFormat(null);
  });

  it('filled-only rendering matches the legacy repeat for ratings 1-5', () => {
    for (let r = 1; r <= 5; r++) {
      expect(formatStars(r)).toBe('⭐'.repeat(r));
    }
  });

  it('filled+empty rendering matches the legacy card construction for 1-5', () => {
    for (let r = 1; r <= 5; r++) {
      expect(formatStars(r, { filled: '★', empty: '☆' }))
        .toBe('★'.repeat(r) + '☆'.repeat(5 - r));
    }
  });

  it('DEFECT FIX: rating > scale clamps instead of throwing RangeError', () => {
    // The old GameOpsRenderer card did '☆'.repeat(5-rating) → RangeError
    // for rating 6+ (census-verified, no test pinned it).
    expect(() => formatStars(9, { filled: '★', empty: '☆' })).not.toThrow();
    expect(formatStars(9, { filled: '★', empty: '☆' })).toBe('★★★★★');
  });

  it('rating 0/null/undefined renders all-empty (never negative repeats)', () => {
    expect(formatStars(0, { filled: '★', empty: '☆' })).toBe('☆☆☆☆☆');
    expect(formatStars(null, { filled: '★', empty: '☆' })).toBe('☆☆☆☆☆');
    expect(formatStars(undefined)).toBe('');
  });

  it('the scale derives from the APPLIED pack baseValues keys (schema-frozen at 5 today)', () => {
    applyPackScoring({
      baseValues: { 1: 10, 2: 20, 3: 30 }, // hypothetical 3-scale pack
      typeMultipliers: { Personal: 1, UNKNOWN: 0 },
    });
    expect(formatStars(2, { filled: '★', empty: '☆' })).toBe('★★☆');
    expect(formatStars(9)).toBe('⭐⭐⭐'); // clamped to the 3-scale
  });
});

describe('applyPackScoring drives the money format (slice 3b wiring)', () => {
  afterEach(() => {
    applyPackScoring(null);
    applyPackMoneyFormat(null);
  });

  it('a pack scoring block with a display format rewires formatCurrency', () => {
    applyPackScoring({ ...PACK_SCORING, display: { unit: 'credits', format: '#,### cr' } });
    expect(formatCurrency(25000)).toBe('25,000 cr');
  });

  it('a pack without a display block resets to the baked ALN spec (no stale carry-over)', () => {
    applyPackMoneyFormat('#,### cr'); // stale toy spec
    applyPackScoring(PACK_SCORING);
    expect(formatCurrency(25000)).toBe('$25,000');
  });

  it('the shim path (unusable scoring) also resets to the baked spec', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    applyPackMoneyFormat('#,### cr');
    applyPackScoring(null); // shim
    expect(formatCurrency(25000)).toBe('$25,000');
    warnSpy.mockRestore();
  });
});
