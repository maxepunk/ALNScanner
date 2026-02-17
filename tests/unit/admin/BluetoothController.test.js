/**
 * BluetoothController Tests - Bluetooth Device Control
 * ES6 Module Tests
 *
 * Tests the stateless controller that wraps sendCommand() calls
 * for Bluetooth operations (scan, pair, connect, disconnect).
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock CommandSender - must be before import
jest.mock('../../../src/admin/utils/CommandSender.js', () => ({
  sendCommand: jest.fn().mockResolvedValue({ success: true })
}));

import { BluetoothController } from '../../../src/admin/BluetoothController.js';
import { sendCommand } from '../../../src/admin/utils/CommandSender.js';

describe('BluetoothController - Bluetooth Device Control', () => {
  let controller;
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      send: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };

    controller = new BluetoothController(mockConnection);
  });

  describe('constructor', () => {
    it('should store connection reference', () => {
      expect(controller.connection).toBe(mockConnection);
    });
  });

  describe('startScan', () => {
    it('should call sendCommand with bluetooth:scan:start action', async () => {
      await controller.startScan();

      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'bluetooth:scan:start',
        {}
      );
    });

    it('should include timeout in payload when provided', async () => {
      await controller.startScan(30000);

      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'bluetooth:scan:start',
        { timeout: 30000 }
      );
    });

    it('should omit timeout from payload when not provided', async () => {
      await controller.startScan();

      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'bluetooth:scan:start',
        {}
      );
    });

    it('should return sendCommand result', async () => {
      sendCommand.mockResolvedValueOnce({ success: true, devices: [] });

      const result = await controller.startScan();

      expect(result).toEqual({ success: true, devices: [] });
    });
  });

  describe('stopScan', () => {
    it('should call sendCommand with bluetooth:scan:stop action', async () => {
      await controller.stopScan();

      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'bluetooth:scan:stop',
        {}
      );
    });

    it('should return sendCommand result', async () => {
      sendCommand.mockResolvedValueOnce({ success: true });

      const result = await controller.stopScan();

      expect(result).toEqual({ success: true });
    });
  });

  describe('pairDevice', () => {
    it('should call sendCommand with bluetooth:pair action and address', async () => {
      await controller.pairDevice('AA:BB:CC:DD:EE:FF');

      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'bluetooth:pair',
        { address: 'AA:BB:CC:DD:EE:FF' },
        45000
      );
    });

    it('should return sendCommand result', async () => {
      sendCommand.mockResolvedValueOnce({ success: true, paired: true });

      const result = await controller.pairDevice('AA:BB:CC:DD:EE:FF');

      expect(result).toEqual({ success: true, paired: true });
    });
  });

  describe('unpairDevice', () => {
    it('should call sendCommand with bluetooth:unpair action and address', async () => {
      await controller.unpairDevice('AA:BB:CC:DD:EE:FF');

      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'bluetooth:unpair',
        { address: 'AA:BB:CC:DD:EE:FF' },
        15000
      );
    });

    it('should return sendCommand result', async () => {
      sendCommand.mockResolvedValueOnce({ success: true });

      const result = await controller.unpairDevice('AA:BB:CC:DD:EE:FF');

      expect(result).toEqual({ success: true });
    });
  });

  describe('connectDevice', () => {
    it('should call sendCommand with bluetooth:connect action and address', async () => {
      await controller.connectDevice('AA:BB:CC:DD:EE:FF');

      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'bluetooth:connect',
        { address: 'AA:BB:CC:DD:EE:FF' },
        30000
      );
    });

    it('should return sendCommand result', async () => {
      sendCommand.mockResolvedValueOnce({ success: true, connected: true });

      const result = await controller.connectDevice('AA:BB:CC:DD:EE:FF');

      expect(result).toEqual({ success: true, connected: true });
    });
  });

  describe('disconnectDevice', () => {
    it('should call sendCommand with bluetooth:disconnect action and address', async () => {
      await controller.disconnectDevice('AA:BB:CC:DD:EE:FF');

      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'bluetooth:disconnect',
        { address: 'AA:BB:CC:DD:EE:FF' },
        15000
      );
    });

    it('should return sendCommand result', async () => {
      sendCommand.mockResolvedValueOnce({ success: true });

      const result = await controller.disconnectDevice('AA:BB:CC:DD:EE:FF');

      expect(result).toEqual({ success: true });
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
      sendCommand.mockRejectedValueOnce(new Error('bluetooth:scan:start timeout after 5000ms'));

      await expect(controller.startScan()).rejects.toThrow('bluetooth:scan:start timeout after 5000ms');
    });

    it('should propagate pair errors', async () => {
      sendCommand.mockRejectedValueOnce(new Error('Command failed: bluetooth:pair'));

      await expect(controller.pairDevice('AA:BB:CC:DD:EE:FF')).rejects.toThrow('Command failed: bluetooth:pair');
    });
  });
});
