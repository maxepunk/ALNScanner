/**
 * @jest-environment jsdom
 */

import { describe, it, expect } from '@jest/globals';
import scoringConfig from '../../../data/scoring-config.json';

describe('Shared Scoring Config (Frontend)', () => {
  it('should import scoring config from data submodule', () => {
    expect(scoringConfig.version).toBe('1.0');
    expect(scoringConfig.baseValues).toBeDefined();
    expect(scoringConfig.typeMultipliers).toBeDefined();
  });

  it('should have identical values to SCORING_CONFIG in scoring.js', async () => {
    const { SCORING_CONFIG } = await import('../../../src/core/scoring.js');

    // Verify base values match
    Object.entries(scoringConfig.baseValues).forEach(([rating, value]) => {
      expect(SCORING_CONFIG.BASE_VALUES[parseInt(rating)]).toBe(value);
    });

    // Verify type multipliers match
    Object.entries(scoringConfig.typeMultipliers).forEach(([type, multiplier]) => {
      expect(SCORING_CONFIG.TYPE_MULTIPLIERS[type]).toBe(multiplier);
    });
  });

  it('should have UNKNOWN type multiplier as 0', () => {
    expect(scoringConfig.typeMultipliers['UNKNOWN']).toBe(0);
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
});
