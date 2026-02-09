/**
 * AudioController Tests - Audio Routing Control
 * ES6 Module Tests
 *
 * Tests the stateless controller that wraps sendCommand() calls
 * for audio routing operations (route video audio to PipeWire sinks).
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock CommandSender - must be before import
jest.mock('../../../src/admin/utils/CommandSender.js', () => ({
  sendCommand: jest.fn().mockResolvedValue({ success: true })
}));

import { AudioController } from '../../../src/admin/AudioController.js';
import { sendCommand } from '../../../src/admin/utils/CommandSender.js';

describe('AudioController - Audio Routing Control', () => {
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

  describe('constructor', () => {
    it('should store connection reference', () => {
      expect(controller.connection).toBe(mockConnection);
    });
  });

  describe('setVideoOutput', () => {
    it('should call sendCommand with audio:route:set action and default stream', async () => {
      await controller.setVideoOutput('bluez_sink.AA_BB_CC_DD_EE_FF.a2dp_sink');

      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'audio:route:set',
        { stream: 'video', sink: 'bluez_sink.AA_BB_CC_DD_EE_FF.a2dp_sink' }
      );
    });

    it('should use default stream parameter of "video"', async () => {
      await controller.setVideoOutput('some_sink');

      const payload = sendCommand.mock.calls[0][2];
      expect(payload.stream).toBe('video');
    });

    it('should accept explicit stream parameter', async () => {
      await controller.setVideoOutput('some_sink', 'ambient');

      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'audio:route:set',
        { stream: 'ambient', sink: 'some_sink' }
      );
    });

    it('should pass sink name through unchanged', async () => {
      const sinkName = 'bluez_sink.11_22_33_44_55_66.a2dp_sink';
      await controller.setVideoOutput(sinkName);

      const payload = sendCommand.mock.calls[0][2];
      expect(payload.sink).toBe(sinkName);
    });

    it('should return sendCommand result', async () => {
      sendCommand.mockResolvedValueOnce({ success: true, route: { stream: 'video', sink: 'test_sink' } });

      const result = await controller.setVideoOutput('test_sink');

      expect(result).toEqual({ success: true, route: { stream: 'video', sink: 'test_sink' } });
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
    it('should propagate sendCommand errors', async () => {
      sendCommand.mockRejectedValueOnce(new Error('audio:route:set timeout after 5000ms'));

      await expect(controller.setVideoOutput('bad_sink')).rejects.toThrow('audio:route:set timeout after 5000ms');
    });

    it('should propagate command failure errors', async () => {
      sendCommand.mockRejectedValueOnce(new Error('Command failed: audio:route:set'));

      await expect(controller.setVideoOutput('bad_sink')).rejects.toThrow('Command failed: audio:route:set');
    });
  });
});
