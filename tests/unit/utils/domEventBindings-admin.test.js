/**
 * domEventBindings - Admin Action Tests
 *
 * Tests the admin.* data-action routing to AdminController modules
 * for Phase 0 Environment Control buttons.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import { bindDOMEvents } from '../../../src/utils/domEventBindings.js';

describe('domEventBindings - admin actions', () => {
  // Shared mock references — bind once, reset between tests
  const mockBluetoothController = {
    startScan: jest.fn(),
    stopScan: jest.fn()
  };

  const mockAudioController = {
    setVideoOutput: jest.fn()
  };

  const mockLightingController = {
    refreshScenes: jest.fn(),
    activateScene: jest.fn()
  };

  const mockAdminController = {
    initialized: true,
    getModule: jest.fn((name) => {
      switch (name) {
        case 'bluetoothController': return mockBluetoothController;
        case 'audioController': return mockAudioController;
        case 'lightingController': return mockLightingController;
        default: throw new Error(`Unknown module: ${name}`);
      }
    })
  };

  const mockApp = {
    networkedSession: {
      getService: jest.fn(() => mockAdminController)
    }
  };

  const mockDebug = {
    log: jest.fn()
  };

  // Bind listeners once (document-level listeners persist across tests)
  beforeAll(() => {
    bindDOMEvents(mockApp, {}, {}, mockDebug, {}, {}, {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset admin controller state
    mockAdminController.initialized = true;
    // Reset networkedSession (may be nulled in guard tests)
    mockApp.networkedSession = {
      getService: jest.fn(() => mockAdminController)
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function clickAction(element) {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  function changeAction(element) {
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  describe('admin.startBtScan', () => {
    it('should call bluetoothController.startScan()', () => {
      const btn = document.createElement('button');
      btn.dataset.action = 'admin.startBtScan';
      document.body.appendChild(btn);

      clickAction(btn);

      expect(mockAdminController.getModule).toHaveBeenCalledWith('bluetoothController');
      expect(mockBluetoothController.startScan).toHaveBeenCalled();
    });
  });

  describe('admin.stopBtScan', () => {
    it('should call bluetoothController.stopScan()', () => {
      const btn = document.createElement('button');
      btn.dataset.action = 'admin.stopBtScan';
      document.body.appendChild(btn);

      clickAction(btn);

      expect(mockBluetoothController.stopScan).toHaveBeenCalled();
    });
  });

  describe('admin.setAudioRoute', () => {
    it('should call audioController.setVideoOutput with radio value and data-stream', () => {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.dataset.action = 'admin.setAudioRoute';
      radio.dataset.stream = 'video';
      radio.value = 'bluetooth';
      document.body.appendChild(radio);

      changeAction(radio);

      expect(mockAudioController.setVideoOutput).toHaveBeenCalledWith('bluetooth', 'video');
    });

    it('should default stream to "video" when data-stream not set', () => {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.dataset.action = 'admin.setAudioRoute';
      radio.value = 'hdmi';
      document.body.appendChild(radio);

      changeAction(radio);

      expect(mockAudioController.setVideoOutput).toHaveBeenCalledWith('hdmi', 'video');
    });

    it('should also work via click event on the radio input directly', () => {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.dataset.action = 'admin.setAudioRoute';
      radio.dataset.stream = 'video';
      radio.value = 'hdmi';
      document.body.appendChild(radio);

      clickAction(radio);

      expect(mockAudioController.setVideoOutput).toHaveBeenCalledWith('hdmi', 'video');
    });
  });

  describe('admin.lightingRetry', () => {
    it('should call lightingController.refreshScenes()', () => {
      const btn = document.createElement('button');
      btn.dataset.action = 'admin.lightingRetry';
      document.body.appendChild(btn);

      clickAction(btn);

      expect(mockLightingController.refreshScenes).toHaveBeenCalled();
    });
  });

  describe('admin.activateScene', () => {
    it('should call lightingController.activateScene with data-scene-id', () => {
      const btn = document.createElement('button');
      btn.dataset.action = 'admin.activateScene';
      btn.dataset.sceneId = 'scene_pregame';
      document.body.appendChild(btn);

      clickAction(btn);

      expect(mockLightingController.activateScene).toHaveBeenCalledWith('scene_pregame');
    });

    it('should not call activateScene when data-scene-id is missing', () => {
      const btn = document.createElement('button');
      btn.dataset.action = 'admin.activateScene';
      document.body.appendChild(btn);

      clickAction(btn);

      expect(mockLightingController.activateScene).not.toHaveBeenCalled();
    });
  });

  describe('guard: admin not initialized', () => {
    it('should ignore action and log warning when adminController not initialized', () => {
      mockAdminController.initialized = false;

      const btn = document.createElement('button');
      btn.dataset.action = 'admin.startBtScan';
      document.body.appendChild(btn);

      clickAction(btn);

      expect(mockDebug.log).toHaveBeenCalledWith('Admin action ignored: admin not initialized', true);
      expect(mockBluetoothController.startScan).not.toHaveBeenCalled();
    });
  });

  describe('guard: networkedSession not available', () => {
    it('should ignore action when networkedSession is null', () => {
      mockApp.networkedSession = null;

      const btn = document.createElement('button');
      btn.dataset.action = 'admin.startBtScan';
      document.body.appendChild(btn);

      clickAction(btn);

      expect(mockDebug.log).toHaveBeenCalledWith('Admin action ignored: admin not initialized', true);
      expect(mockBluetoothController.startScan).not.toHaveBeenCalled();
    });
  });

  describe('unknown admin method', () => {
    it('should log error for unknown admin action', () => {
      const btn = document.createElement('button');
      btn.dataset.action = 'admin.nonExistentMethod';
      document.body.appendChild(btn);

      clickAction(btn);

      expect(mockDebug.log).toHaveBeenCalledWith('Unknown admin action: nonExistentMethod', true);
    });
  });
});
