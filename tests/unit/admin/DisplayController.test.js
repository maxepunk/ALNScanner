import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock CommandSender - must be before import
jest.mock('../../../src/admin/utils/CommandSender.js', () => ({
  sendCommand: jest.fn().mockResolvedValue({ success: true })
}));

import { DisplayController } from '../../../src/admin/DisplayController.js';
import { sendCommand } from '../../../src/admin/utils/CommandSender.js';

describe('DisplayController', () => {
  let controller;
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      send: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    controller = new DisplayController(mockConnection);
  });

  describe('setIdleLoop', () => {
    it('sends display:idle-loop command via CommandSender', async () => {
      await controller.setIdleLoop();
      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'display:idle-loop',
        expect.any(Object)
      );
    });

    it('returns result from sendCommand', async () => {
      sendCommand.mockResolvedValue({ success: true, mode: 'IDLE_LOOP' });
      const result = await controller.setIdleLoop();
      expect(result.success).toBe(true);
    });
  });

  describe('setScoreboard', () => {
    it('sends display:scoreboard command', async () => {
      await controller.setScoreboard();
      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'display:scoreboard',
        expect.any(Object)
      );
    });
  });

  describe('returnToVideo', () => {
    it('sends display:return-to-video command', async () => {
      await controller.returnToVideo();
      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'display:return-to-video',
        expect.any(Object)
      );
    });
  });

  describe('getDisplayStatus', () => {
    it('sends display:status command', async () => {
      await controller.getDisplayStatus();
      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'display:status',
        expect.any(Object)
      );
    });
  });

  describe('destroy', () => {
    it('does not throw', () => {
      expect(() => controller.destroy()).not.toThrow();
    });
  });
});
