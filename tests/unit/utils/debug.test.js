import { describe, it, expect, beforeEach } from '@jest/globals';
import Debug, { DebugLogger } from '../../../src/utils/debug.js';

describe('Debug - ES6 Module', () => {
  beforeEach(() => {
    Debug.clear();
  });

  it('should export Debug singleton', () => {
    expect(Debug).toBeDefined();
    expect(Debug).toBeInstanceOf(DebugLogger);
  });

  it('should log messages', () => {
    Debug.log('Test message');
    expect(Debug.messages).toHaveLength(1);
    expect(Debug.messages[0]).toContain('Test message');
    expect(Debug.messages[0]).toContain('✓');
  });

  it('should log error messages with error prefix', () => {
    Debug.log('Error message', true);
    expect(Debug.messages).toHaveLength(1);
    expect(Debug.messages[0]).toContain('Error message');
    expect(Debug.messages[0]).toContain('❌');
  });

  it('should respect max message limit', () => {
    // CONFIG.MAX_DEBUG_MESSAGES = 50
    for (let i = 0; i < 55; i++) {
      Debug.log(`Message ${i}`);
    }

    expect(Debug.messages).toHaveLength(50);
    expect(Debug.messages[0]).toContain('Message 5'); // First 5 dropped
  });

  it('should clear messages', () => {
    Debug.log('Message 1');
    Debug.log('Message 2');
    expect(Debug.messages).toHaveLength(2);

    Debug.clear();
    expect(Debug.messages).toHaveLength(0);
  });

  it('should handle updatePanel with no DOM element', () => {
    // Should not throw when DOM element doesn't exist
    expect(() => Debug.updatePanel()).not.toThrow();
  });

  it('should handle toggle with no app instance', () => {
    // Should not throw and log warning
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    Debug.toggle();

    expect(consoleSpy).toHaveBeenCalledWith('Debug view not available in this mode');
    consoleSpy.mockRestore();
  });
});
