import { describe, it, expect } from '@jest/globals';
import CONFIG from '../../../src/utils/config.js';

describe('CONFIG - ES6 Module', () => {
  it('should export CONFIG object', () => {
    expect(CONFIG).toBeDefined();
    expect(typeof CONFIG).toBe('object');
  });

  it('should have MAX_TEAM_ID_LENGTH', () => {
    expect(CONFIG.MAX_TEAM_ID_LENGTH).toBe(6);
  });

  it('should have animation and timing constants', () => {
    expect(CONFIG.ANIMATION_DURATION).toBe(200);
    expect(CONFIG.SCAN_SIMULATION_DELAY).toBe(1000);
    expect(CONFIG.NFC_PULSE_INTERVAL).toBe(2000);
  });

  it('should have debug configuration', () => {
    expect(CONFIG.MAX_DEBUG_MESSAGES).toBe(50);
  });

  it('should have UI configuration', () => {
    expect(CONFIG.MODE_TOGGLE_SCALE).toBe(1.1);
  });
});
