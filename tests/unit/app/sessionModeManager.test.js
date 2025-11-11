/**
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import sessionModeManager, { SessionModeManager } from '../../../src/app/sessionModeManager.js';

describe('SessionModeManager - ES6 Module (Simple State Manager)', () => {
  beforeEach(() => {
    // Clear localStorage (global mock from test-setup.js)
    localStorage.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('Constructor & Initialization', () => {
    it('should create SessionModeManager instance with default values', () => {
      const instance = new SessionModeManager();

      expect(instance.mode).toBeNull();
      expect(instance.locked).toBe(false);
    });

    it('should NOT extend EventTarget (simple state manager)', () => {
      const instance = new SessionModeManager();

      expect(instance).not.toBeInstanceOf(EventTarget);
      expect(instance.addEventListener).toBeUndefined();
      expect(instance.dispatchEvent).toBeUndefined();
    });

    it('should export singleton instance', () => {
      expect(sessionModeManager).toBeInstanceOf(SessionModeManager);
    });

    it('should export class for testing', () => {
      expect(SessionModeManager).toBeDefined();
      expect(typeof SessionModeManager).toBe('function');
    });
  });

  describe('setMode() - Mode Locking', () => {
    it('should set mode to networked and lock', () => {
      const instance = new SessionModeManager();
      instance.setMode('networked');

      expect(instance.mode).toBe('networked');
      expect(instance.locked).toBe(true);
    });

    it('should set mode to standalone and lock', () => {
      const instance = new SessionModeManager();
      instance.setMode('standalone');

      expect(instance.mode).toBe('standalone');
      expect(instance.locked).toBe(true);
    });

    it('should persist mode to localStorage', () => {
      const instance = new SessionModeManager();
      instance.setMode('networked');

      expect(localStorage.getItem('gameSessionMode')).toBe('networked');
    });

    it('should throw error when trying to change locked mode', () => {
      const instance = new SessionModeManager();
      instance.setMode('networked');

      expect(() => {
        instance.setMode('standalone');
      }).toThrow('Cannot change session mode after it is locked');
    });

    it('should throw error for invalid mode', () => {
      const instance = new SessionModeManager();

      expect(() => {
        instance.setMode('invalid');
      }).toThrow("Invalid session mode: invalid. Must be 'networked' or 'standalone'");
    });

    it('should throw error for null mode', () => {
      const instance = new SessionModeManager();

      expect(() => {
        instance.setMode(null);
      }).toThrow("Invalid session mode: null. Must be 'networked' or 'standalone'");
    });

    it('should throw error for undefined mode', () => {
      const instance = new SessionModeManager();

      expect(() => {
        instance.setMode(undefined);
      }).toThrow("Invalid session mode: undefined. Must be 'networked' or 'standalone'");
    });

    it('should handle localStorage errors gracefully', () => {
      const instance = new SessionModeManager();

      // Mock localStorage.setItem to throw error
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = jest.fn(() => {
        throw new Error('Storage full');
      });

      // Should not throw, but mode should still be set
      expect(() => {
        instance.setMode('networked');
      }).not.toThrow();

      expect(instance.mode).toBe('networked');
      expect(instance.locked).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to persist session mode:', expect.any(Error));

      // Restore
      Storage.prototype.setItem = originalSetItem;
      consoleSpy.mockRestore();
    });
  });

  describe('isNetworked() / isStandalone()', () => {
    it('should return true when mode is networked', () => {
      const instance = new SessionModeManager();
      instance.setMode('networked');

      expect(instance.isNetworked()).toBe(true);
      expect(instance.isStandalone()).toBe(false);
    });

    it('should return true when mode is standalone', () => {
      const instance = new SessionModeManager();
      instance.setMode('standalone');

      expect(instance.isNetworked()).toBe(false);
      expect(instance.isStandalone()).toBe(true);
    });

    it('should return false when mode is null', () => {
      const instance = new SessionModeManager();

      expect(instance.isNetworked()).toBe(false);
      expect(instance.isStandalone()).toBe(false);
    });
  });

  describe('restoreMode() - Mode Restoration', () => {
    it('should restore networked mode from localStorage', () => {
      localStorage.setItem('gameSessionMode', 'networked');

      const instance = new SessionModeManager();
      const restored = instance.restoreMode();

      expect(restored).toBe('networked');
      expect(instance.mode).toBe('networked');
      expect(instance.locked).toBe(false); // Not locked on restore
    });

    it('should restore standalone mode from localStorage', () => {
      localStorage.setItem('gameSessionMode', 'standalone');

      const instance = new SessionModeManager();
      const restored = instance.restoreMode();

      expect(restored).toBe('standalone');
      expect(instance.mode).toBe('standalone');
      expect(instance.locked).toBe(false); // Not locked on restore
    });

    it('should return null when no mode is saved', () => {
      const instance = new SessionModeManager();
      const restored = instance.restoreMode();

      expect(restored).toBeNull();
      expect(instance.mode).toBeNull();
    });

    it('should return null for invalid saved mode', () => {
      localStorage.setItem('gameSessionMode', 'invalid');

      const instance = new SessionModeManager();
      const restored = instance.restoreMode();

      expect(restored).toBeNull();
      expect(instance.mode).toBeNull();
    });

    it('should allow changing mode after restore (not locked)', () => {
      localStorage.setItem('gameSessionMode', 'networked');

      const instance = new SessionModeManager();
      instance.restoreMode();

      // Should be able to change mode since not locked
      expect(() => {
        instance.setMode('standalone');
      }).not.toThrow();

      expect(instance.mode).toBe('standalone');
      expect(instance.locked).toBe(true);
    });

    it('should handle localStorage errors gracefully', () => {
      const instance = new SessionModeManager();

      // Mock localStorage.getItem to throw error
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = jest.fn(() => {
        throw new Error('Storage error');
      });

      const restored = instance.restoreMode();

      expect(restored).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to read persisted session mode:', expect.any(Error));

      // Restore
      Storage.prototype.getItem = originalGetItem;
      consoleSpy.mockRestore();
    });
  });

  describe('clearMode() - Mode Clearing', () => {
    it('should clear mode and unlock', () => {
      const instance = new SessionModeManager();
      instance.setMode('networked');

      instance.clearMode();

      expect(instance.mode).toBeNull();
      expect(instance.locked).toBe(false);
    });

    it('should remove mode from localStorage', () => {
      const instance = new SessionModeManager();
      instance.setMode('networked');

      expect(localStorage.getItem('gameSessionMode')).toBe('networked');

      instance.clearMode();

      expect(localStorage.getItem('gameSessionMode')).toBeNull();
    });

    it('should allow setting new mode after clear', () => {
      const instance = new SessionModeManager();
      instance.setMode('networked');
      instance.clearMode();

      expect(() => {
        instance.setMode('standalone');
      }).not.toThrow();

      expect(instance.mode).toBe('standalone');
    });

    it('should be safe to call multiple times', () => {
      const instance = new SessionModeManager();
      instance.setMode('networked');

      expect(() => {
        instance.clearMode();
        instance.clearMode();
        instance.clearMode();
      }).not.toThrow();
    });

    it('should handle localStorage errors gracefully', () => {
      const instance = new SessionModeManager();
      instance.setMode('networked');

      // Mock localStorage.removeItem to throw error
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const originalRemoveItem = Storage.prototype.removeItem;
      Storage.prototype.removeItem = jest.fn(() => {
        throw new Error('Storage error');
      });

      expect(() => {
        instance.clearMode();
      }).not.toThrow();

      expect(instance.mode).toBeNull();
      expect(instance.locked).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to clear persisted session mode:', expect.any(Error));

      // Restore
      Storage.prototype.removeItem = originalRemoveItem;
      consoleSpy.mockRestore();
    });
  });

  describe('getMode() / isLocked() - State Queries', () => {
    it('should return current mode', () => {
      const instance = new SessionModeManager();

      expect(instance.getMode()).toBeNull();

      instance.setMode('networked');
      expect(instance.getMode()).toBe('networked');
    });

    it('should return locked state', () => {
      const instance = new SessionModeManager();

      expect(instance.isLocked()).toBe(false);

      instance.setMode('networked');
      expect(instance.isLocked()).toBe(true);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle typical networked mode flow', () => {
      const instance = new SessionModeManager();

      // Initial state
      expect(instance.getMode()).toBeNull();
      expect(instance.isLocked()).toBe(false);

      // User selects networked mode
      instance.setMode('networked');
      expect(instance.isNetworked()).toBe(true);
      expect(instance.isLocked()).toBe(true);
      expect(localStorage.getItem('gameSessionMode')).toBe('networked');

      // Cannot change mode
      expect(() => instance.setMode('standalone')).toThrow();
    });

    it('should handle typical standalone mode flow', () => {
      const instance = new SessionModeManager();

      // User selects standalone mode
      instance.setMode('standalone');
      expect(instance.isStandalone()).toBe(true);
      expect(instance.isLocked()).toBe(true);
      expect(localStorage.getItem('gameSessionMode')).toBe('standalone');

      // Cannot change mode
      expect(() => instance.setMode('networked')).toThrow();
    });

    it('should handle page reload with mode restoration', () => {
      // First session
      const instance1 = new SessionModeManager();
      instance1.setMode('networked');

      // Simulate page reload (new instance)
      const instance2 = new SessionModeManager();
      const restored = instance2.restoreMode();

      expect(restored).toBe('networked');
      expect(instance2.getMode()).toBe('networked');
      expect(instance2.isLocked()).toBe(false); // Unlocked, user can change

      // User can choose to keep or change mode
      instance2.setMode('networked'); // Confirm same mode
      expect(instance2.isLocked()).toBe(true);
    });

    it('should handle mode change after restoration', () => {
      // First session
      const instance1 = new SessionModeManager();
      instance1.setMode('networked');

      // Simulate page reload
      const instance2 = new SessionModeManager();
      instance2.restoreMode();

      // User changes their mind
      instance2.setMode('standalone');
      expect(instance2.isStandalone()).toBe(true);
      expect(localStorage.getItem('gameSessionMode')).toBe('standalone');
    });

    it('should handle clean session (no previous mode)', () => {
      const instance = new SessionModeManager();
      const restored = instance.restoreMode();

      expect(restored).toBeNull();
      expect(instance.getMode()).toBeNull();
      expect(instance.isLocked()).toBe(false);

      // User can select any mode
      instance.setMode('standalone');
      expect(instance.isStandalone()).toBe(true);
    });

    it('should handle mode clearing and restart', () => {
      const instance = new SessionModeManager();
      instance.setMode('networked');

      // Clear mode (e.g., logout or reset)
      instance.clearMode();

      // Can select new mode
      instance.setMode('standalone');
      expect(instance.isStandalone()).toBe(true);
      expect(localStorage.getItem('gameSessionMode')).toBe('standalone');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string as invalid mode', () => {
      const instance = new SessionModeManager();

      expect(() => {
        instance.setMode('');
      }).toThrow("Invalid session mode: . Must be 'networked' or 'standalone'");
    });

    it('should handle whitespace as invalid mode', () => {
      const instance = new SessionModeManager();

      expect(() => {
        instance.setMode('  ');
      }).toThrow("Invalid session mode:   . Must be 'networked' or 'standalone'");
    });

    it('should be case-sensitive for mode values', () => {
      const instance = new SessionModeManager();

      expect(() => {
        instance.setMode('Networked'); // Capital N
      }).toThrow();

      expect(() => {
        instance.setMode('STANDALONE'); // All caps
      }).toThrow();
    });

    it('should handle rapid mode switching attempts', () => {
      const instance = new SessionModeManager();
      instance.setMode('networked');

      // Try to switch multiple times
      expect(() => instance.setMode('standalone')).toThrow();
      expect(() => instance.setMode('standalone')).toThrow();
      expect(() => instance.setMode('networked')).toThrow();

      // Mode should still be networked
      expect(instance.getMode()).toBe('networked');
    });

    it('should maintain state across multiple operations', () => {
      const instance = new SessionModeManager();

      // Perform various operations
      instance.restoreMode(); // No saved mode
      expect(instance.getMode()).toBeNull();

      instance.setMode('networked');
      expect(instance.isNetworked()).toBe(true);

      const mode = instance.getMode();
      expect(mode).toBe('networked');

      const locked = instance.isLocked();
      expect(locked).toBe(true);

      // State should remain consistent
      expect(instance.mode).toBe('networked');
      expect(instance.locked).toBe(true);
    });
  });

  describe('Singleton Instance', () => {
    it('should provide singleton instance', () => {
      expect(sessionModeManager).toBeDefined();
      expect(sessionModeManager).toBeInstanceOf(SessionModeManager);
    });

    it('should have same instance across imports', () => {
      // Note: In actual usage, multiple imports would get same instance
      // We can at least verify the exported instance is correct
      expect(sessionModeManager.mode).toBeNull();
      expect(sessionModeManager.locked).toBe(false);
    });
  });
});
