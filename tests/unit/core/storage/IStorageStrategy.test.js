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
