/**
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import settings, { Settings } from '../../../src/ui/settings.js';

describe('Settings - ES6 Module (Event-Driven)', () => {
  beforeEach(() => {
    // Clear localStorage (global mock from test-setup.js)
    localStorage.clear();

    // Setup DOM elements
    document.body.innerHTML = `
      <div id="settingsScreen">
        <input id="deviceId" type="text" />
        <span id="deviceIdDisplay"></span>
        <input id="modeToggle" type="checkbox" />
      </div>
    `;
  });

  afterEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('Constructor & Initialization', () => {
    it('should create Settings instance with default values', () => {
      const instance = new Settings();

      expect(instance.deviceId).toBe('001');
      expect(instance.mode).toBe('detective');
    });

    it('should extend EventTarget for event-driven architecture', () => {
      const instance = new Settings();

      expect(instance).toBeInstanceOf(EventTarget);
      expect(typeof instance.addEventListener).toBe('function');
      expect(typeof instance.dispatchEvent).toBe('function');
    });

    it('should export singleton instance', () => {
      expect(settings).toBeInstanceOf(Settings);
    });
  });

  describe('load() - Event-Driven Behavior', () => {
    it('should load default values when localStorage is empty', () => {
      const instance = new Settings();
      instance.load();

      expect(instance.deviceId).toBe('001');
      expect(instance.mode).toBe('detective');
    });

    it('should load values from localStorage', () => {
      localStorage.setItem('deviceId', '042');
      localStorage.setItem('mode', 'blackmarket');

      const instance = new Settings();
      instance.load();

      expect(instance.deviceId).toBe('042');
      expect(instance.mode).toBe('blackmarket');
    });

    it('should emit settings:loaded event with correct detail', (done) => {
      localStorage.setItem('deviceId', '123');
      localStorage.setItem('mode', 'blackmarket');

      const instance = new Settings();

      instance.addEventListener('settings:loaded', (event) => {
        expect(event.detail.deviceId).toBe('123');
        expect(event.detail.mode).toBe('blackmarket');
        done();
      });

      instance.load();
    });

    it('should update DOM elements with loaded values', () => {
      localStorage.setItem('deviceId', '456');
      localStorage.setItem('mode', 'detective');

      const instance = new Settings();
      instance.load();

      expect(document.getElementById('deviceId').value).toBe('456');
      expect(document.getElementById('deviceIdDisplay').textContent).toBe('456');
      expect(document.getElementById('modeToggle').checked).toBe(false);
    });

    it('should set modeToggle checked for blackmarket mode', () => {
      localStorage.setItem('mode', 'blackmarket');

      const instance = new Settings();
      instance.load();

      expect(document.getElementById('modeToggle').checked).toBe(true);
    });

    it('should handle missing DOM elements gracefully', () => {
      document.body.innerHTML = ''; // Remove all elements

      const instance = new Settings();

      expect(() => instance.load()).not.toThrow();
      expect(instance.deviceId).toBe('001'); // Still loads from localStorage
    });
  });

  describe('save() - Event-Driven Behavior', () => {
    it('should save values to localStorage', () => {
      const instance = new Settings();
      instance.deviceId = '999';
      instance.mode = 'blackmarket';
      instance.save();

      expect(localStorage.getItem('deviceId')).toBe('999');
      expect(localStorage.getItem('mode')).toBe('blackmarket');
    });

    it('should emit settings:saved event with correct detail', (done) => {
      const instance = new Settings();
      instance.deviceId = '789';
      instance.mode = 'detective';

      instance.addEventListener('settings:saved', (event) => {
        expect(event.detail.deviceId).toBe('789');
        expect(event.detail.mode).toBe('detective');
        done();
      });

      instance.save();
    });

    it('should emit settings:changed event when values change', (done) => {
      const instance = new Settings();
      instance.deviceId = '001';
      instance.mode = 'detective';

      instance.addEventListener('settings:changed', (event) => {
        expect(event.detail.deviceId).toBe('555');
        expect(event.detail.mode).toBe('blackmarket');
        expect(event.detail.oldDeviceId).toBe('001');
        expect(event.detail.oldMode).toBe('detective');
        done();
      });

      // Simulate reading from active settings screen
      document.getElementById('settingsScreen').classList.add('active');
      document.getElementById('deviceId').value = '555';
      document.getElementById('modeToggle').checked = true;

      instance.save();
    });

    it('should NOT emit settings:changed if values did not change', () => {
      const instance = new Settings();
      instance.deviceId = '001';
      instance.mode = 'detective';

      const changedHandler = jest.fn();
      instance.addEventListener('settings:changed', changedHandler);

      instance.save();

      expect(changedHandler).not.toHaveBeenCalled();
    });

    it('should read from DOM when settings screen is active', () => {
      document.getElementById('settingsScreen').classList.add('active');
      document.getElementById('deviceId').value = '333';
      document.getElementById('modeToggle').checked = true;

      const instance = new Settings();
      instance.save();

      expect(instance.deviceId).toBe('333');
      expect(instance.mode).toBe('blackmarket');
      expect(localStorage.getItem('deviceId')).toBe('333');
      expect(localStorage.getItem('mode')).toBe('blackmarket');
    });

    it('should NOT read from DOM when settings screen is not active', () => {
      document.getElementById('settingsScreen').classList.remove('active');
      document.getElementById('deviceId').value = '777';
      document.getElementById('modeToggle').checked = true;

      const instance = new Settings();
      instance.deviceId = '001';
      instance.mode = 'detective';
      instance.save();

      // Should save current instance values, not DOM values
      expect(instance.deviceId).toBe('001');
      expect(instance.mode).toBe('detective');
      expect(localStorage.getItem('deviceId')).toBe('001');
      expect(localStorage.getItem('mode')).toBe('detective');
    });

    it('should update deviceIdDisplay in DOM', () => {
      const instance = new Settings();
      instance.deviceId = '888';
      instance.save();

      expect(document.getElementById('deviceIdDisplay').textContent).toBe('888');
    });

    it('should handle missing DOM elements gracefully', () => {
      document.body.innerHTML = ''; // Remove all elements

      const instance = new Settings();
      instance.deviceId = '123';
      instance.mode = 'detective';

      expect(() => instance.save()).not.toThrow();
      expect(localStorage.getItem('deviceId')).toBe('123');
    });

    it('should use default deviceId if DOM input is empty', () => {
      document.getElementById('settingsScreen').classList.add('active');
      document.getElementById('deviceId').value = '';

      const instance = new Settings();
      instance.save();

      expect(instance.deviceId).toBe('001');
      expect(localStorage.getItem('deviceId')).toBe('001');
    });
  });

  describe('Mode handling', () => {
    it('should handle detective mode correctly', () => {
      const instance = new Settings();
      instance.mode = 'detective';
      instance.save();

      expect(localStorage.getItem('mode')).toBe('detective');
    });

    it('should handle blackmarket mode correctly', () => {
      const instance = new Settings();
      instance.mode = 'blackmarket';
      instance.save();

      expect(localStorage.getItem('mode')).toBe('blackmarket');
    });

    it('should convert checkbox unchecked to detective mode', () => {
      document.getElementById('settingsScreen').classList.add('active');
      document.getElementById('modeToggle').checked = false;

      const instance = new Settings();
      instance.save();

      expect(instance.mode).toBe('detective');
    });

    it('should convert checkbox checked to blackmarket mode', () => {
      document.getElementById('settingsScreen').classList.add('active');
      document.getElementById('modeToggle').checked = true;

      const instance = new Settings();
      instance.save();

      expect(instance.mode).toBe('blackmarket');
    });
  });

  describe('localStorage persistence', () => {
    it('should persist settings across load/save cycles', () => {
      const instance1 = new Settings();
      instance1.deviceId = '456';
      instance1.mode = 'blackmarket';
      instance1.save();

      // Create new instance and load
      const instance2 = new Settings();
      instance2.load();

      expect(instance2.deviceId).toBe('456');
      expect(instance2.mode).toBe('blackmarket');
    });

    it('should handle multiple save operations', () => {
      const instance = new Settings();

      instance.deviceId = '111';
      instance.mode = 'detective';
      instance.save();

      instance.deviceId = '222';
      instance.mode = 'blackmarket';
      instance.save();

      expect(localStorage.getItem('deviceId')).toBe('222');
      expect(localStorage.getItem('mode')).toBe('blackmarket');
    });
  });

  describe('Event-Driven Integration', () => {
    it('should allow multiple listeners on same event', (done) => {
      const instance = new Settings();
      let listener1Called = false;
      let listener2Called = false;

      instance.addEventListener('settings:loaded', () => {
        listener1Called = true;
      });

      instance.addEventListener('settings:loaded', () => {
        listener2Called = true;
        expect(listener1Called).toBe(true);
        done();
      });

      instance.load();
    });

    it('should emit both settings:saved and settings:changed on value change', () => {
      const instance = new Settings();
      instance.deviceId = '001';
      instance.mode = 'detective';

      const savedHandler = jest.fn();
      const changedHandler = jest.fn();

      instance.addEventListener('settings:saved', savedHandler);
      instance.addEventListener('settings:changed', changedHandler);

      document.getElementById('settingsScreen').classList.add('active');
      document.getElementById('deviceId').value = '999';

      instance.save();

      expect(savedHandler).toHaveBeenCalledTimes(1);
      expect(changedHandler).toHaveBeenCalledTimes(1);
    });

    it('should provide access to old and new values in settings:changed event', (done) => {
      const instance = new Settings();
      instance.deviceId = 'old-id';
      instance.mode = 'detective';

      instance.addEventListener('settings:changed', (event) => {
        expect(event.detail.oldDeviceId).toBe('old-id');
        expect(event.detail.oldMode).toBe('detective');
        expect(event.detail.deviceId).toBe('new-id');
        expect(event.detail.mode).toBe('blackmarket');
        done();
      });

      document.getElementById('settingsScreen').classList.add('active');
      document.getElementById('deviceId').value = 'new-id';
      document.getElementById('modeToggle').checked = true;

      instance.save();
    });
  });

  describe('Edge cases', () => {
    it('should handle null localStorage values gracefully', () => {
      // localStorage returns null when key doesn't exist
      const instance = new Settings();
      instance.load();

      expect(instance.deviceId).toBe('001');
      expect(instance.mode).toBe('detective');
    });

    it('should handle settingsScreen without classList', () => {
      document.getElementById('settingsScreen').classList = undefined;

      const instance = new Settings();

      expect(() => instance.save()).not.toThrow();
    });

    it('should handle concurrent event listeners', () => {
      const instance = new Settings();
      const results = [];

      instance.addEventListener('settings:loaded', () => results.push('A'));
      instance.addEventListener('settings:loaded', () => results.push('B'));
      instance.addEventListener('settings:loaded', () => results.push('C'));

      instance.load();

      expect(results).toEqual(['A', 'B', 'C']);
    });
  });
});
