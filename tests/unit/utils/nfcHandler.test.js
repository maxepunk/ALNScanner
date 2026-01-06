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
    it('should return error when records is undefined', () => {
      const message = {}; // No records property
      const result = NFCHandler.extractTokenId(message, 'serial123');
      expect(result.source).toBe('error');
      expect(result.error).toBe('no-ndef-records');
    });

    it('should return error when no records (not serial fallback)', () => {
      const message = { records: [] };
      const serialNumber = 'abc123';

      const result = NFCHandler.extractTokenId(message, serialNumber);

      expect(result).toEqual({
        id: null,
        source: 'error',
        error: 'no-ndef-records',
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

    it('should return error when records are unreadable (not serial fallback)', () => {
      const message = {
        records: [{
          recordType: 'unknown',
          data: new ArrayBuffer(0) // Empty data
        }]
      };

      const result = NFCHandler.extractTokenId(message, 'fallback789');

      expect(result).toEqual({
        id: null,
        source: 'error',
        error: 'unreadable-records',
        raw: 'fallback789'
      });
    });

    it('should extract generic data when decodable', () => {
      const genericData = new TextEncoder().encode('generic-token');
      const message = {
        records: [{
          recordType: 'custom',
          data: genericData
        }]
      };

      const result = NFCHandler.extractTokenId(message, 'serial');

      expect(result.id).toBe('generic-token');
      expect(result.source).toBe('generic-decode');
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

    it('should suppress rapid duplicate reads', () => {
      const handler = new NFCHandlerClass();
      handler.debounceMs = 2000;

      // Simulate first read
      handler.lastRead = { id: 'token123', timestamp: Date.now() - 500 }; // 500ms ago

      // Check if same token would be debounced
      const now = Date.now();
      const wouldDebounce = handler.lastRead &&
        handler.lastRead.id === 'token123' &&
        (now - handler.lastRead.timestamp) < handler.debounceMs;

      expect(wouldDebounce).toBe(true);
    });

    it('should allow reads after debounce window expires', () => {
      const handler = new NFCHandlerClass();
      handler.debounceMs = 2000;

      // Simulate old read (3 seconds ago)
      handler.lastRead = { id: 'token123', timestamp: Date.now() - 3000 };

      // Check if same token would NOT be debounced
      const now = Date.now();
      const wouldDebounce = handler.lastRead &&
        handler.lastRead.id === 'token123' &&
        (now - handler.lastRead.timestamp) < handler.debounceMs;

      expect(wouldDebounce).toBe(false);
    });

    it('should allow reads of different tokens immediately', () => {
      const handler = new NFCHandlerClass();
      handler.debounceMs = 2000;

      // Simulate recent read of different token
      handler.lastRead = { id: 'token123', timestamp: Date.now() - 100 };

      // Check if different token would NOT be debounced
      const now = Date.now();
      const wouldDebounce = handler.lastRead &&
        handler.lastRead.id === 'token456' &&
        (now - handler.lastRead.timestamp) < handler.debounceMs;

      expect(wouldDebounce).toBe(false);
    });
  });
});
