// ALNScanner/tests/unit/core/storage/IStorageStrategy.test.js
import { describe, it, expect } from '@jest/globals';
import { IStorageStrategy } from '../../../../src/core/storage/IStorageStrategy.js';

describe('IStorageStrategy Interface', () => {
  it('should throw on initialize() if not implemented', async () => {
    const strategy = new IStorageStrategy();
    await expect(strategy.initialize()).rejects.toThrow('must be implemented');
  });

  it('should throw on addTransaction() if not implemented', async () => {
    const strategy = new IStorageStrategy();
    await expect(strategy.addTransaction({})).rejects.toThrow('must be implemented');
  });

  it('should throw on removeTransaction() if not implemented', async () => {
    const strategy = new IStorageStrategy();
    await expect(strategy.removeTransaction('id')).rejects.toThrow('must be implemented');
  });

  it('should throw on getTransactions() if not implemented', () => {
    const strategy = new IStorageStrategy();
    expect(() => strategy.getTransactions()).toThrow('must be implemented');
  });

  it('should throw on getTeamScores() if not implemented', () => {
    const strategy = new IStorageStrategy();
    expect(() => strategy.getTeamScores()).toThrow('must be implemented');
  });

  it('should throw on getTeamCompletedGroups() if not implemented', () => {
    const strategy = new IStorageStrategy();
    expect(() => strategy.getTeamCompletedGroups('001')).toThrow('must be implemented');
  });

  it('_shapeCompletedGroups() produces the shape both UDM consumers destructure', () => {
    const strategy = new IStorageStrategy();
    strategy.tokenManager = {
      getGroupInventory: () => ({
        'server logs': { displayName: 'Server Logs', normalizedName: 'server logs', multiplier: 5 }
      })
    };

    expect(strategy._shapeCompletedGroups(['Server Logs', 'Other Group (x2)'])).toEqual([
      { name: 'Server Logs', normalizedName: 'server logs', multiplier: 5 },
      { name: 'Other Group', normalizedName: 'other group', multiplier: 2 }
    ]);
  });

  it('_shapeCompletedGroups() is null-safe and drops blank names', () => {
    const strategy = new IStorageStrategy();

    expect(strategy._shapeCompletedGroups(undefined)).toEqual([]);
    expect(strategy._shapeCompletedGroups(['', '  ', null])).toEqual([]);
  });

  it('should throw on adjustTeamScore() if not implemented', async () => {
    const strategy = new IStorageStrategy();
    await expect(strategy.adjustTeamScore('001', 100, 'test')).rejects.toThrow('must be implemented');
  });

  it('should throw on getGameActivity() if not implemented', () => {
    const strategy = new IStorageStrategy();
    expect(() => strategy.getGameActivity()).toThrow('must be implemented');
  });

  it('should throw on createSession() if not implemented', async () => {
    const strategy = new IStorageStrategy();
    await expect(strategy.createSession('Test', [])).rejects.toThrow('must be implemented');
  });

  it('should throw on endSession() if not implemented', async () => {
    const strategy = new IStorageStrategy();
    await expect(strategy.endSession()).rejects.toThrow('must be implemented');
  });

  it('should throw on getCurrentSession() if not implemented', () => {
    const strategy = new IStorageStrategy();
    expect(() => strategy.getCurrentSession()).toThrow('must be implemented');
  });

  it('should throw on isReady() if not implemented', () => {
    const strategy = new IStorageStrategy();
    expect(() => strategy.isReady()).toThrow('must be implemented');
  });

  it('should not throw on dispose() (optional)', () => {
    const strategy = new IStorageStrategy();
    expect(() => strategy.dispose()).not.toThrow();
  });
});
