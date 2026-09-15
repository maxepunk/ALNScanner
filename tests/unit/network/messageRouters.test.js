// ALNScanner/tests/unit/network/messageRouters.test.js
//
// Router-level tests for the scanned-token guard (A-3, A-4). These drive a REAL
// UnifiedDataManager + NetworkedStorage rather than a jest mock: the bug these
// cover is that the guard is only ever added to, and a mock would happily record
// the call while the guard stayed stale.
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { gameOpsRouter } from '../../../src/network/messageRouters.js';
import { UnifiedDataManager } from '../../../src/core/unifiedDataManager.js';

describe('gameOpsRouter — scanned-token guard reconciliation', () => {
  let manager;
  let session;
  const mockSocket = { on: jest.fn(), off: jest.fn(), emit: jest.fn(), connected: true };

  const persisted = () =>
    JSON.parse(localStorage.getItem('networkedScannedTokens:sess-1') || '[]');

  beforeEach(async () => {
    // jsdom localStorage persists per-file; isolate each test to prevent bleed.
    localStorage.clear();
    localStorage.setItem('networkedSessionId', 'sess-1');

    manager = new UnifiedDataManager({
      tokenManager: {
        getAllTokens: jest.fn(() => []),
        findToken: jest.fn(() => null),
        getGroupInventory: jest.fn(() => ({}))
      },
      sessionModeManager: {
        isStandalone: jest.fn(() => false),
        isNetworked: jest.fn(() => true)
      }
    });
    await manager.initializeNetworkedMode(mockSocket);

    session = new EventTarget();
  });

  describe('transaction:deleted (A-3)', () => {
    it('frees the token so it can be re-scanned, and persists the removal', () => {
      manager.addTransactionFromBroadcast({ id: 'tx-1', tokenId: 'X', teamId: '001' });
      expect(manager.isTokenScanned('X')).toBe(true);

      gameOpsRouter('transaction:deleted', { transactionId: 'tx-1', tokenId: 'X' }, manager, session);

      expect(manager.isTokenScanned('X')).toBe(false);
      expect(persisted()).not.toContain('X');
      expect(manager.getTransactions()).toEqual([]);
    });

    it('keeps the token marked while another cached transaction still claims it', () => {
      manager.addTransactionFromBroadcast({ id: 'tx-1', tokenId: 'X', teamId: '001' });
      manager.addTransactionFromBroadcast({ id: 'tx-2', tokenId: 'X', teamId: '002' });

      gameOpsRouter('transaction:deleted', { transactionId: 'tx-1', tokenId: 'X' }, manager, session);

      expect(manager.isTokenScanned('X')).toBe(true);
      expect(persisted()).toContain('X');
    });

    it('leaves the guard alone when the broadcast carries no tokenId', () => {
      manager.addTransactionFromBroadcast({ id: 'tx-1', tokenId: 'X', teamId: '001' });

      gameOpsRouter('transaction:deleted', { transactionId: 'tx-1' }, manager, session);

      expect(manager.isTokenScanned('X')).toBe(true);
    });
  });

  describe('scores:reset (A-4)', () => {
    it('empties the guard in place and persists it, so every token is scannable again', () => {
      manager.addTransactionFromBroadcast({ id: 'tx-1', tokenId: 'X', teamId: '001' });
      manager.addTransactionFromBroadcast({ id: 'tx-2', tokenId: 'Y', teamId: '002' });
      const ref = manager.scannedTokens;

      gameOpsRouter('scores:reset', {}, manager, session);

      expect(manager.isTokenScanned('X')).toBe(false);
      expect(manager.isTokenScanned('Y')).toBe(false);
      expect(manager.scannedTokens).toBe(ref);                      // shared reference intact
      expect(manager._networkedStrategy.scannedTokens).toBe(ref);
      expect(persisted()).toEqual([]);
    });
  });
});
