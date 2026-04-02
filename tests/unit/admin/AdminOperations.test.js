import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock CommandSender - must be before import
jest.mock('../../../src/admin/utils/CommandSender.js', () => ({
  sendCommand: jest.fn().mockResolvedValue({ success: true, message: 'OK' })
}));

import { AdminOperations } from '../../../src/admin/AdminOperations.js';
import { sendCommand } from '../../../src/admin/utils/CommandSender.js';

describe('AdminOperations', () => {
  let ops;
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      send: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    ops = new AdminOperations(mockConnection);
  });

  describe('restartSystem', () => {
    it('sends system:restart command', async () => {
      await ops.restartSystem();
      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'system:restart',
        expect.any(Object)
      );
    });
  });

  describe('clearData', () => {
    it('sends system:clear command', async () => {
      await ops.clearData();
      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'system:clear',
        expect.any(Object)
      );
    });
  });

  describe('resetScores', () => {
    it('sends score:reset command', async () => {
      await ops.resetScores();
      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'score:reset',
        expect.any(Object)
      );
    });
  });

  describe('adjustScore', () => {
    it('sends score:adjust with teamId, delta, reason', async () => {
      await ops.adjustScore('Team1', -50000, 'Penalty');
      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'score:adjust',
        expect.objectContaining({
          teamId: 'Team1',
          delta: -50000,
          reason: 'Penalty'
        })
      );
    });

    it('uses default reason when not provided', async () => {
      await ops.adjustScore('Team1', 10000);
      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'score:adjust',
        expect.objectContaining({
          reason: expect.any(String)
        })
      );
    });
  });

  describe('deleteTransaction', () => {
    it('sends transaction:delete with transactionId', async () => {
      await ops.deleteTransaction('tx-123');
      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'transaction:delete',
        expect.objectContaining({ transactionId: 'tx-123' })
      );
    });
  });

  describe('checkService', () => {
    it('sends service:check with serviceId', async () => {
      await ops.checkService('vlc');
      expect(sendCommand).toHaveBeenCalledWith(
        mockConnection,
        'service:check',
        expect.objectContaining({ serviceId: 'vlc' }),
        5000
      );
    });
  });

  describe('destroy', () => {
    it('does not throw', () => {
      expect(() => ops.destroy()).not.toThrow();
    });
  });
});
