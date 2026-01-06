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
});
