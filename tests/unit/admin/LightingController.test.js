/**
 * LightingController Tests - Home Assistant Lighting/Scene Control
 * ES6 Module Tests
 *
 * Tests the stateless controller that wraps sendCommand() calls
 * for Home Assistant lighting operations (scene activation, refresh).
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock CommandSender - must be before import
jest.mock('../../../src/admin/utils/CommandSender.js', () => ({
  sendCommand: jest.fn().mockResolvedValue({ success: true })
}));

import { LightingController } from '../../../src/admin/LightingController.js';
import { sendCommand } from '../../../src/admin/utils/CommandSender.js';

describe('LightingController - Home Assistant Lighting/Scene Control', () => {
  let controller;
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      send: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };

    controller = new LightingController(mockConnection);
  });

  describe('constructor', () => {
    it('should store connection reference', () => {
      expect(controller.connection).toBe(mockConnection);
    });
  });

  describe('activateScene', () => {
    it('should call sendCommand with lighting:scene:activate action and sceneId', async () => {
      await controller.activateScene('scene.dramatic_red');

      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'lighting:scene:activate',
        { sceneId: 'scene.dramatic_red' }
      );
    });

    it('should return sendCommand result', async () => {
      sendCommand.mockResolvedValueOnce({ success: true, sceneId: 'scene.dramatic_red' });

      const result = await controller.activateScene('scene.dramatic_red');

      expect(result).toEqual({ success: true, sceneId: 'scene.dramatic_red' });
    });

    it('should handle different scene IDs', async () => {
      await controller.activateScene('scene.blackout');

      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'lighting:scene:activate',
        { sceneId: 'scene.blackout' }
      );
    });
  });

  describe('refreshScenes', () => {
    it('should call sendCommand with lighting:scenes:refresh action and empty payload', async () => {
      await controller.refreshScenes();

      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'lighting:scenes:refresh',
        {}
      );
    });

    it('should return sendCommand result', async () => {
      sendCommand.mockResolvedValueOnce({
        success: true,
        scenes: ['scene.dramatic_red', 'scene.blackout', 'scene.warm_glow']
      });

      const result = await controller.refreshScenes();

      expect(result).toEqual({
        success: true,
        scenes: ['scene.dramatic_red', 'scene.blackout', 'scene.warm_glow']
      });
    });
  });

  describe('destroy', () => {
    it('should exist and not throw', () => {
      expect(() => controller.destroy()).not.toThrow();
    });

    it('should be callable multiple times without error', () => {
      expect(() => {
        controller.destroy();
        controller.destroy();
      }).not.toThrow();
    });
  });

  describe('error propagation', () => {
    it('should propagate sendCommand errors for activateScene', async () => {
      sendCommand.mockRejectedValueOnce(new Error('lighting:scene:activate timeout after 5000ms'));

      await expect(controller.activateScene('scene.dramatic_red'))
        .rejects.toThrow('lighting:scene:activate timeout after 5000ms');
    });

    it('should propagate sendCommand errors for refreshScenes', async () => {
      sendCommand.mockRejectedValueOnce(new Error('Command failed: lighting:scenes:refresh'));

      await expect(controller.refreshScenes())
        .rejects.toThrow('Command failed: lighting:scenes:refresh');
    });
  });
});
