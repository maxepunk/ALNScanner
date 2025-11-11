/**
 * AdminController Tests - Admin Module Lifecycle
 *
 * Tests the admin module creation, initialization guard, and lifecycle management.
 * These tests SHOULD FAIL initially - that's the point of TDD!
 */

const AdminController = require('../../js/app/AdminController');

describe('AdminController - Admin Module Lifecycle', () => {
  let controller;
  let mockClient;
  let mockAdminModules;

  beforeEach(() => {
    mockClient = {
      send: jest.fn(),
      addEventListener: jest.fn()
    };

    // Mock AdminModule namespace (global in browser context)
    mockAdminModules = {
      SessionManager: jest.fn().mockImplementation(() => ({
        destroy: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn()
      })),
      VideoController: jest.fn().mockImplementation(() => ({
        destroy: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn()
      })),
      SystemMonitor: jest.fn().mockImplementation(() => ({
        destroy: jest.fn(),
        refresh: jest.fn()
      })),
      AdminOperations: jest.fn().mockImplementation(() => ({
        destroy: jest.fn()
      })),
      MonitoringDisplay: jest.fn().mockImplementation(() => ({
        destroy: jest.fn(),
        updateConnectionStatus: jest.fn()
      }))
    };

    global.AdminModule = mockAdminModules;

    controller = new AdminController(mockClient);
  });

  afterEach(() => {
    delete global.AdminModule;
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

      expect(mockAdminModules.SessionManager).toHaveBeenCalledWith(mockClient);
      expect(mockAdminModules.VideoController).toHaveBeenCalledWith(mockClient);
      expect(mockAdminModules.SystemMonitor).toHaveBeenCalled();
      expect(mockAdminModules.AdminOperations).toHaveBeenCalledWith(mockClient);
      expect(mockAdminModules.MonitoringDisplay).toHaveBeenCalledWith(mockClient);

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
    });

    it('should not re-initialize if already initialized', () => {
      controller.initialize();
      controller.initialize(); // Second call

      // Should only be called once
      expect(mockAdminModules.SessionManager).toHaveBeenCalledTimes(1);
      expect(mockAdminModules.VideoController).toHaveBeenCalledTimes(1);
      expect(mockAdminModules.SystemMonitor).toHaveBeenCalledTimes(1);
      expect(mockAdminModules.AdminOperations).toHaveBeenCalledTimes(1);
      expect(mockAdminModules.MonitoringDisplay).toHaveBeenCalledTimes(1);
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
        .toThrow();
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
  });
});
