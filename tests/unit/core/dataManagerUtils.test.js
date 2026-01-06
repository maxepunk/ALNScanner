// ALNScanner/tests/unit/core/dataManagerUtils.test.js
import { describe, it, expect, beforeEach } from '@jest/globals';
import { DataManagerUtils } from '../../../src/core/dataManagerUtils.js';

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
});
