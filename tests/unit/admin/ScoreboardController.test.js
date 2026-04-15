import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock CommandSender — must be before import of ScoreboardController
jest.mock('../../../src/admin/utils/CommandSender.js', () => ({
  sendCommand: jest.fn().mockResolvedValue({ success: true })
}));

import { ScoreboardController } from '../../../src/admin/ScoreboardController.js';
import { sendCommand } from '../../../src/admin/utils/CommandSender.js';

describe('ScoreboardController', () => {
  let controller;
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      send: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    controller = new ScoreboardController(mockConnection);
  });

  describe('scrollNext', () => {
    it('sends scoreboard:page:next command via CommandSender', async () => {
      await controller.scrollNext();
      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'scoreboard:page:next',
        expect.any(Object)
      );
    });

    it('returns the result from sendCommand', async () => {
      sendCommand.mockResolvedValue({ success: true });
      const result = await controller.scrollNext();
      expect(result.success).toBe(true);
    });
  });

  describe('scrollPrev', () => {
    it('sends scoreboard:page:prev command', async () => {
      await controller.scrollPrev();
      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'scoreboard:page:prev',
        expect.any(Object)
      );
    });
  });

  describe('jumpToOwner', () => {
    it('sends scoreboard:page:owner with trimmed owner', async () => {
      await controller.jumpToOwner('  Alex Reeves  ');
      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'scoreboard:page:owner',
        { owner: 'Alex Reeves' }
      );
    });

    it('rejects when owner is empty', async () => {
      await expect(controller.jumpToOwner('')).rejects.toThrow(/owner is required/);
      expect(sendCommand).not.toHaveBeenCalled();
    });

    it('rejects when owner is whitespace-only', async () => {
      await expect(controller.jumpToOwner('   ')).rejects.toThrow(/owner is required/);
      expect(sendCommand).not.toHaveBeenCalled();
    });

    it('rejects when owner is not a string', async () => {
      await expect(controller.jumpToOwner(null)).rejects.toThrow(/owner is required/);
      await expect(controller.jumpToOwner(undefined)).rejects.toThrow(/owner is required/);
      expect(sendCommand).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('does not throw', () => {
      expect(() => controller.destroy()).not.toThrow();
    });
  });
});
