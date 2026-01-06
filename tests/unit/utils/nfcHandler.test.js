import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import NFCHandler, { NFCHandlerClass } from '../../../src/utils/nfcHandler.js';

describe('NFCHandler - ES6 Module', () => {
  beforeEach(() => {
    NFCHandler.reader = null;
    NFCHandler.isScanning = false;
  });

  it('should export NFCHandler singleton', () => {
    expect(NFCHandler).toBeDefined();
    expect(NFCHandler).toBeInstanceOf(NFCHandlerClass);
  });

  describe('init', () => {
    it('should return false when NDEFReader is not available', async () => {
      // jsdom doesn't have NDEFReader
      const supported = await NFCHandler.init();
      expect(supported).toBe(false);
    });

    it('should return true when NDEFReader is available', async () => {
      // Mock NDEFReader
      global.window.NDEFReader = class {};

      const supported = await NFCHandler.init();
      expect(supported).toBe(true);

      // Cleanup
      delete global.window.NDEFReader;
    });
  });

  describe('extractTokenId', () => {
    it('should use serial number when no records', () => {
      const message = { records: [] };
      const serialNumber = 'abc123';

      const result = NFCHandler.extractTokenId(message, serialNumber);

      expect(result).toEqual({
        id: 'abc123',
        source: 'serial-fallback',
        raw: 'abc123'
      });
    });

    it('should extract text record', () => {
      const textData = new TextEncoder().encode('token123');
      const message = {
        records: [{
          recordType: 'text',
          encoding: 'utf-8',
          data: textData
        }]
      };

      const result = NFCHandler.extractTokenId(message, 'serial123');

      expect(result.id).toBe('token123');
      expect(result.source).toBe('text-record');
    });

    it('should extract URL record', () => {
      const urlData = new TextEncoder().encode('https://example.com/token456');
      const message = {
        records: [{
          recordType: 'url',
          data: urlData
        }]
      };

      const result = NFCHandler.extractTokenId(message, 'serial123');

      expect(result.id).toBe('https://example.com/token456');
      expect(result.source).toBe('url-record');
    });

    it('should fallback to serial when records are unreadable', () => {
      const message = {
        records: [{
          recordType: 'unknown',
          data: new ArrayBuffer(0) // Empty data
        }]
      };

      const result = NFCHandler.extractTokenId(message, 'fallback789');

      expect(result.id).toBe('fallback789');
      expect(result.source).toBe('serial-fallback');
    });
  });

  describe('simulateScan', () => {
    it('should return simulated token data', () => {
      const result = NFCHandler.simulateScan();

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('source', 'simulated');
      expect(result).toHaveProperty('raw');
      expect(typeof result.id).toBe('string');
    });

    it('should return different IDs on multiple calls', () => {
      const results = new Set();

      // Run multiple times to check randomness
      for (let i = 0; i < 10; i++) {
        results.add(NFCHandler.simulateScan().id);
      }

      // Should get at least 2 different IDs in 10 tries
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('stopScan', () => {
    it('should set isScanning to false', () => {
      NFCHandler.isScanning = true;
      NFCHandler.stopScan();
      expect(NFCHandler.isScanning).toBe(false);
    });
  });

  describe('debouncing', () => {
    beforeEach(() => {
      NFCHandler.lastRead = null;
      NFCHandler.debounceMs = 2000;
    });

    it('should have debouncing state initialized', () => {
      const handler = new NFCHandlerClass();
      expect(handler.lastRead).toBe(null);
      expect(handler.debounceMs).toBe(2000);
    });
  });
});
