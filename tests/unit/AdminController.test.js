/**
 * AdminController Tests - Admin Module Lifecycle
 * ES6 Module Tests
 *
 * Tests the admin module creation, initialization guard, and lifecycle management.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock each admin module individually - define factories INSIDE jest.mock()
// to avoid hoisting issues (jest.mock is hoisted above all imports/const)
jest.mock('../../src/admin/SessionManager.js', () => ({
  SessionManager: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn()
  }))
}));

jest.mock('../../src/admin/VideoController.js', () => ({
  VideoController: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn()
  }))
}));

jest.mock('../../src/admin/SystemMonitor.js', () => ({
  SystemMonitor: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    refresh: jest.fn()
  }))
}));

jest.mock('../../src/admin/AdminOperations.js', () => ({
  AdminOperations: jest.fn().mockImplementation(() => ({
    destroy: jest.fn()
  }))
}));

jest.mock('../../src/admin/MonitoringDisplay.js', () => ({
  MonitoringDisplay: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    updateConnectionStatus: jest.fn()
  }))
}));

jest.mock('../../src/admin/BluetoothController.js', () => ({
  BluetoothController: jest.fn().mockImplementation(() => ({
    destroy: jest.fn()
  }))
}));

jest.mock('../../src/admin/AudioController.js', () => ({
  AudioController: jest.fn().mockImplementation(() => ({
    destroy: jest.fn()
  }))
}));

jest.mock('../../src/admin/LightingController.js', () => ({
  LightingController: jest.fn().mockImplementation(() => ({
    destroy: jest.fn()
  }))
}));

// Import AFTER mocks are set up
import AdminController from '../../src/app/adminController.js';
import { SessionManager } from '../../src/admin/SessionManager.js';
import { VideoController } from '../../src/admin/VideoController.js';
import { SystemMonitor } from '../../src/admin/SystemMonitor.js';
import { AdminOperations } from '../../src/admin/AdminOperations.js';
import { MonitoringDisplay } from '../../src/admin/MonitoringDisplay.js';
import { BluetoothController } from '../../src/admin/BluetoothController.js';
import { AudioController } from '../../src/admin/AudioController.js';
import { LightingController } from '../../src/admin/LightingController.js';

describe('AdminController - Admin Module Lifecycle', () => {
  let controller;
  let mockClient;

  beforeEach(() => {
    // Clear all mock calls before each test
    jest.clearAllMocks();

    mockClient = {
      send: jest.fn(),
      addEventListener: jest.fn(),
      socket: {
        emit: jest.fn(),
        on: jest.fn(),
        once: jest.fn()
      }
    };

    controller = new AdminController(mockClient);
  });

  describe('constructor', () => {
    it('should initialize with not-initialized state', () => {
      expect(controller.initialized).toBe(false);
      expect(controller.modules).toBeNull();
    });

    it('should store client reference', () => {
      expect(controller.client).toBe(mockClient);
    });

    it('should extend EventTarget for event emission', () => {
      expect(controller).toBeInstanceOf(EventTarget);
    });
  });

  describe('initialize', () => {
    it('should create all admin modules once', () => {
      controller.initialize();

      expect(SessionManager).toHaveBeenCalledWith(mockClient);
      expect(VideoController).toHaveBeenCalledWith(mockClient);
      expect(SystemMonitor).toHaveBeenCalledWith(mockClient);
      expect(AdminOperations).toHaveBeenCalledWith(mockClient);
      expect(MonitoringDisplay).toHaveBeenCalled();
      expect(BluetoothController).toHaveBeenCalledWith(mockClient);
      expect(AudioController).toHaveBeenCalledWith(mockClient);
      expect(LightingController).toHaveBeenCalledWith(mockClient);

      expect(controller.initialized).toBe(true);
    });

    it('should store module references', () => {
      controller.initialize();

      expect(controller.modules).toBeDefined();
      expect(controller.modules.sessionManager).toBeDefined();
      expect(controller.modules.videoController).toBeDefined();
      expect(controller.modules.systemMonitor).toBeDefined();
      expect(controller.modules.adminOperations).toBeDefined();
      expect(controller.modules.monitoringDisplay).toBeDefined();
      expect(controller.modules.bluetoothController).toBeDefined();
      expect(controller.modules.audioController).toBeDefined();
      expect(controller.modules.lightingController).toBeDefined();
    });

    it('should not re-initialize if already initialized', () => {
      controller.initialize();
      controller.initialize(); // Second call

      // Should only be called once
      expect(SessionManager).toHaveBeenCalledTimes(1);
      expect(VideoController).toHaveBeenCalledTimes(1);
      expect(SystemMonitor).toHaveBeenCalledTimes(1);
      expect(AdminOperations).toHaveBeenCalledTimes(1);
      expect(MonitoringDisplay).toHaveBeenCalledTimes(1);
      expect(BluetoothController).toHaveBeenCalledTimes(1);
      expect(AudioController).toHaveBeenCalledTimes(1);
      expect(LightingController).toHaveBeenCalledTimes(1);
    });

    it('should emit initialized event', () => {
      const handler = jest.fn();
      controller.addEventListener('initialized', handler);

      controller.initialize();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('getModule', () => {
    it('should return specific admin module', () => {
      controller.initialize();

      const sessionManager = controller.getModule('sessionManager');

      expect(sessionManager).toBeDefined();
      expect(sessionManager.destroy).toBeDefined();
    });

    it('should throw if not initialized', () => {
      expect(() => controller.getModule('sessionManager'))
        .toThrow('Admin modules not initialized');
    });

    it('should throw if module name invalid', () => {
      controller.initialize();

      expect(() => controller.getModule('invalidModule'))
        .toThrow('Unknown module: invalidModule');
    });
  });

  describe('pause', () => {
    it('should pause all pausable modules', () => {
      controller.initialize();

      controller.pause();

      expect(controller.modules.sessionManager.pause).toHaveBeenCalled();
      expect(controller.modules.videoController.pause).toHaveBeenCalled();
    });

    it('should not throw if not initialized', () => {
      expect(() => controller.pause()).not.toThrow();
    });

    it('should handle modules without pause method gracefully', () => {
      controller.initialize();
      controller.modules.sessionManager.pause = undefined;

      expect(() => controller.pause()).not.toThrow();
    });
  });

  describe('resume', () => {
    it('should resume all pausable modules', () => {
      controller.initialize();

      controller.resume();

      expect(controller.modules.sessionManager.resume).toHaveBeenCalled();
      expect(controller.modules.videoController.resume).toHaveBeenCalled();
    });

    it('should not throw if not initialized', () => {
      expect(() => controller.resume()).not.toThrow();
    });

    it('should handle modules without resume method gracefully', () => {
      controller.initialize();
      controller.modules.sessionManager.resume = undefined;

      expect(() => controller.resume()).not.toThrow();
    });
  });

  describe('destroy', () => {
    it('should cleanup all modules', () => {
      controller.initialize();
      const modules = { ...controller.modules };

      controller.destroy();

      expect(modules.sessionManager.destroy).toHaveBeenCalled();
      expect(modules.videoController.destroy).toHaveBeenCalled();
      expect(modules.systemMonitor.destroy).toHaveBeenCalled();
      expect(modules.adminOperations.destroy).toHaveBeenCalled();
      expect(modules.monitoringDisplay.destroy).toHaveBeenCalled();
      expect(modules.bluetoothController.destroy).toHaveBeenCalled();
      expect(modules.audioController.destroy).toHaveBeenCalled();
      expect(modules.lightingController.destroy).toHaveBeenCalled();
    });

    it('should reset state after destroy', () => {
      controller.initialize();

      controller.destroy();

      expect(controller.modules).toBeNull();
      expect(controller.initialized).toBe(false);
    });

    it('should not throw if not initialized', () => {
      expect(() => controller.destroy()).not.toThrow();
    });

    it('should handle modules without destroy method gracefully', () => {
      controller.initialize();
      controller.modules.sessionManager.destroy = undefined;

      expect(() => controller.destroy()).not.toThrow();
    });
  });

  describe('event-driven coordination', () => {
    it('should allow external listeners on initialized event', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      controller.addEventListener('initialized', listener1);
      controller.addEventListener('initialized', listener2);

      controller.initialize();

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should not emit initialized event on re-initialization attempt', () => {
      const handler = jest.fn();
      controller.addEventListener('initialized', handler);

      controller.initialize();
      handler.mockClear();
      controller.initialize(); // Second attempt

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('module lifecycle coordination', () => {
    it('should initialize all modules before setting initialized flag', () => {
      let flagValue;
      SessionManager.mockImplementationOnce(() => {
        flagValue = controller.initialized;
        return { destroy: jest.fn(), pause: jest.fn(), resume: jest.fn() };
      });

      controller.initialize();

      expect(flagValue).toBe(false); // Flag should still be false during construction
      expect(controller.initialized).toBe(true); // But true after
    });

    it('should allow access to modules immediately after initialize', () => {
      controller.initialize();

      expect(() => controller.getModule('sessionManager')).not.toThrow();
      expect(() => controller.getModule('videoController')).not.toThrow();
      expect(() => controller.getModule('systemMonitor')).not.toThrow();
      expect(() => controller.getModule('adminOperations')).not.toThrow();
      expect(() => controller.getModule('monitoringDisplay')).not.toThrow();
      expect(() => controller.getModule('bluetoothController')).not.toThrow();
      expect(() => controller.getModule('audioController')).not.toThrow();
      expect(() => controller.getModule('lightingController')).not.toThrow();
    });

    it('should allow pause/resume immediately after initialize', () => {
      controller.initialize();

      expect(() => controller.pause()).not.toThrow();
      expect(() => controller.resume()).not.toThrow();
    });
  });
});
