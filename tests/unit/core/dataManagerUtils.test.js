// ALNScanner/tests/unit/core/dataManagerUtils.test.js
import { describe, it, expect, beforeEach } from '@jest/globals';
import { DataManagerUtils } from '../../../src/core/dataManagerUtils.js';
import { calculateTokenValue } from '../../../src/core/scoring.js';

describe('DataManagerUtils', () => {
  describe('isTokenScanned', () => {
    it('should return true if token is in Set', () => {
      const scannedTokens = new Set(['token1', 'token2']);
      expect(DataManagerUtils.isTokenScanned(scannedTokens, 'token1')).toBe(true);
    });

    it('should return false if token is not in Set', () => {
      const scannedTokens = new Set(['token1']);
      expect(DataManagerUtils.isTokenScanned(scannedTokens, 'token2')).toBe(false);
    });

    it('should return false for empty Set', () => {
      const scannedTokens = new Set();
      expect(DataManagerUtils.isTokenScanned(scannedTokens, 'token1')).toBe(false);
    });
  });

  describe('markTokenAsScanned', () => {
    it('should add token to Set', () => {
      const scannedTokens = new Set();
      DataManagerUtils.markTokenAsScanned(scannedTokens, 'token1');
      expect(scannedTokens.has('token1')).toBe(true);
    });

    it('should not duplicate if already present', () => {
      const scannedTokens = new Set(['token1']);
      DataManagerUtils.markTokenAsScanned(scannedTokens, 'token1');
      expect(scannedTokens.size).toBe(1);
    });
  });

  describe('unmarkTokenAsScanned', () => {
    it('should remove token from Set', () => {
      const scannedTokens = new Set(['token1', 'token2']);
      const result = DataManagerUtils.unmarkTokenAsScanned(scannedTokens, 'token1');
      expect(result).toBe(true);
      expect(scannedTokens.has('token1')).toBe(false);
      expect(scannedTokens.has('token2')).toBe(true);
    });

    it('should return false if token not present', () => {
      const scannedTokens = new Set(['token1']);
      const result = DataManagerUtils.unmarkTokenAsScanned(scannedTokens, 'token2');
      expect(result).toBe(false);
    });
  });

  describe('calculateGlobalStats', () => {
    const mockCalculateTokenValue = (tx) => calculateTokenValue(tx);

    it('should calculate stats for empty transactions', () => {
      const result = DataManagerUtils.calculateGlobalStats([], mockCalculateTokenValue);
      expect(result).toEqual({
        total: 0,
        teams: 0,
        totalValue: 0,
        avgValue: 0,
        blackMarketScore: 0
      });
    });

    it('should count unique teams', () => {
      const transactions = [
        { teamId: '001', mode: 'blackmarket', isUnknown: false, valueRating: 1, memoryType: 'Personal' },
        { teamId: '001', mode: 'blackmarket', isUnknown: false, valueRating: 2, memoryType: 'Personal' },
        { teamId: '002', mode: 'blackmarket', isUnknown: false, valueRating: 3, memoryType: 'Personal' }
      ];
      const result = DataManagerUtils.calculateGlobalStats(transactions, mockCalculateTokenValue);
      expect(result.teams).toBe(2);
      expect(result.total).toBe(3);
    });

    it('should exclude unknown tokens from scoring', () => {
      const transactions = [
        { teamId: '001', mode: 'blackmarket', isUnknown: true, valueRating: 5, memoryType: 'Technical' },
        { teamId: '001', mode: 'blackmarket', isUnknown: false, valueRating: 1, memoryType: 'Personal' }
      ];
      const result = DataManagerUtils.calculateGlobalStats(transactions, mockCalculateTokenValue);
      expect(result.blackMarketScore).toBe(10000); // Only the 1-star Personal
    });

    it('should only score blackmarket mode transactions', () => {
      const transactions = [
        { teamId: '001', mode: 'detective', isUnknown: false, valueRating: 5, memoryType: 'Technical' },
        { teamId: '001', mode: 'blackmarket', isUnknown: false, valueRating: 1, memoryType: 'Personal' }
      ];
      const result = DataManagerUtils.calculateGlobalStats(transactions, mockCalculateTokenValue);
      expect(result.blackMarketScore).toBe(10000); // Only blackmarket counts
    });
  });
});
