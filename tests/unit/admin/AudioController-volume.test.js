/**
 * AudioController Tests - Volume Control
 * ES6 Module Tests
 *
 * Tests the setVolume method that sends audio:volume:set commands
 * for per-stream PipeWire volume control.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock CommandSender - must be before import
jest.mock('../../../src/admin/utils/CommandSender.js', () => ({
  sendCommand: jest.fn().mockResolvedValue({ success: true })
}));

import { AudioController } from '../../../src/admin/AudioController.js';
import { sendCommand } from '../../../src/admin/utils/CommandSender.js';

describe('AudioController - Volume Control', () => {
  let controller;
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      send: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };

    controller = new AudioController(mockConnection);
  });

  describe('setVolume', () => {
    it('should exist as a function', () => {
      expect(typeof controller.setVolume).toBe('function');
    });

    it('should send audio:volume:set command with stream and volume', async () => {
      await controller.setVolume('video', 75);

      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'audio:volume:set',
        { stream: 'video', volume: 75 }
      );
    });

    it('should accept spotify stream', async () => {
      await controller.setVolume('spotify', 50);

      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'audio:volume:set',
        { stream: 'spotify', volume: 50 }
      );
    });

    it('should accept sound stream', async () => {
      await controller.setVolume('sound', 100);

      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'audio:volume:set',
        { stream: 'sound', volume: 100 }
      );
    });

    it('should accept volume of 0', async () => {
      await controller.setVolume('video', 0);

      const payload = sendCommand.mock.calls[0][2];
      expect(payload.volume).toBe(0);
    });

    it('should return sendCommand result', async () => {
      sendCommand.mockResolvedValueOnce({ success: true, stream: 'video', volume: 80 });

      const result = await controller.setVolume('video', 80);

      expect(result).toEqual({ success: true, stream: 'video', volume: 80 });
    });

    it('should propagate sendCommand errors', async () => {
      sendCommand.mockRejectedValueOnce(new Error('audio:volume:set timeout after 5000ms'));

      await expect(controller.setVolume('video', 50)).rejects.toThrow('audio:volume:set timeout after 5000ms');
    });
  });
});
