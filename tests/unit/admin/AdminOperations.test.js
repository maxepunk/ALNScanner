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

  // AC-4: these methods emit action strings that are NOT in the AsyncAPI
  // GmCommand enum (system:restart / system:clear). They have zero callers.
  // We must NOT assert the exact bad string (that cements the contract
  // violation). Instead, assert they are not silently wired to a contract
  // action. Real validity of every controller action is enforced by the
  // action-enum conformance test (gmCommandActionConformance.test.js).
  describe('non-contract emergency methods (AC-4)', () => {
    const CONTRACT_ACTIONS = new Set([
      'session:create', 'session:start', 'session:pause', 'session:resume', 'session:end',
      'score:adjust', 'score:reset', 'transaction:delete', 'system:reset', 'service:check'
    ]);

    it('restartSystem does NOT emit a contract-defined action (it is dead/non-conformant)', async () => {
      await ops.restartSystem();
      const action = sendCommand.mock.calls[0][1];
      expect(CONTRACT_ACTIONS.has(action)).toBe(false);
    });

    it('clearData does NOT emit a contract-defined action (it is dead/non-conformant)', async () => {
      await ops.clearData();
      const action = sendCommand.mock.calls[0][1];
      expect(CONTRACT_ACTIONS.has(action)).toBe(false);
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
