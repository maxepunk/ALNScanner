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

    it('prefers the text record even when a url record precedes it (NFC-5)', () => {
      // Production tags carry BOTH a text record (the token) and a url record
      // for unrelated purposes; record ORDER must not let the url win.
      const message = {
        records: [
          { recordType: 'url', data: new TextEncoder().encode('https://example.com/unrelated') },
          { recordType: 'text', encoding: 'utf-8', data: new TextEncoder().encode('token456') },
        ]
      };

      const result = NFCHandler.extractTokenId(message, 'serial123');

      expect(result.source).toBe('text-record');
      expect(result.id).toBe('token456');
    });

    it('uses the text record when it precedes the url record', () => {
      const message = {
        records: [
          { recordType: 'text', encoding: 'utf-8', data: new TextEncoder().encode('token789') },
          { recordType: 'url', data: new TextEncoder().encode('https://example.com/unrelated') },
        ]
      };

      const result = NFCHandler.extractTokenId(message, 'serial123');

      expect(result.source).toBe('text-record');
      expect(result.id).toBe('token789');
    });

    it('hard-fails (re-tap) for a url-only tag — url records are NOT tokens (NFC-5)', () => {
      // A url record must never become a token id; doing so queued a junk
      // Unknown transaction. With no text record present, return an error so the
      // operator re-taps rather than the backend recording a bogus scan.
      const message = {
        records: [{ recordType: 'url', data: new TextEncoder().encode('https://example.com/token456') }]
      };

      const result = NFCHandler.extractTokenId(message, 'serial123');

      expect(result.source).toBe('error');
      expect(result.error).toBe('no-text-record');
      expect(result.id).toBeNull();
    });

    it('hard-fails when records are present but none is a usable text record', () => {
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
        error: 'no-text-record',
        raw: 'fallback789'
      });
    });

    it('does NOT decode a non-text record into a token (no generic-decode source, NFC-5)', () => {
      // Previously a 'custom' decodable record became a 'generic-decode' token;
      // that path queued junk Unknown transactions. Only text records are tokens.
      const message = {
        records: [{ recordType: 'custom', data: new TextEncoder().encode('generic-token') }]
      };

      const result = NFCHandler.extractTokenId(message, 'serial');

      expect(result.source).toBe('error');
      expect(result.error).toBe('no-text-record');
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

  describe('startScan AbortController', () => {
    let scanSpy;

    beforeEach(() => {
      scanSpy = jest.fn().mockResolvedValue(undefined);
      // Minimal NDEFReader mock that records the options passed to scan()
      global.window.NDEFReader = class {
        constructor() { this.addEventListener = jest.fn(); }
        scan(opts) { return scanSpy(opts); }
      };
    });

    afterEach(() => {
      delete global.window.NDEFReader;
    });

    it('passes an AbortSignal to reader.scan()', async () => {
      const handler = new NFCHandlerClass();
      await handler.startScan(() => {}, () => {});

      expect(scanSpy).toHaveBeenCalledTimes(1);
      const opts = scanSpy.mock.calls[0][0];
      expect(opts).toBeDefined();
      expect(opts.signal).toBeInstanceOf(AbortSignal);
      expect(opts.signal.aborted).toBe(false);
    });

    it('aborts a prior scan before re-arming (idempotent re-entry)', async () => {
      const handler = new NFCHandlerClass();

      await handler.startScan(() => {}, () => {});
      const firstSignal = handler.abortController.signal;
      expect(firstSignal.aborted).toBe(false);

      // Re-enter (simulates a second team confirmation / lifecycle re-arm) WITHOUT stopScan
      await handler.startScan(() => {}, () => {});

      // The first scan's signal must have been aborted by the re-arm
      expect(firstSignal.aborted).toBe(true);
      // A fresh controller is now in place and not aborted
      expect(handler.abortController.signal).not.toBe(firstSignal);
      expect(handler.abortController.signal.aborted).toBe(false);
    });
  });

  describe('stopScan', () => {
    beforeEach(() => {
      global.window.NDEFReader = class {
        constructor() { this.addEventListener = jest.fn(); }
        scan() { return Promise.resolve(); }
      };
    });

    afterEach(() => {
      delete global.window.NDEFReader;
    });

    it('should set isScanning to false', () => {
      NFCHandler.isScanning = true;
      NFCHandler.stopScan();
      expect(NFCHandler.isScanning).toBe(false);
    });

    it('aborts the active scan and clears reader/controller', async () => {
      const handler = new NFCHandlerClass();
      await handler.startScan(() => {}, () => {});
      const signal = handler.abortController.signal;

      handler.stopScan();

      expect(signal.aborted).toBe(true);
      expect(handler.reader).toBe(null);
      expect(handler.abortController).toBe(null);
      expect(handler.isScanning).toBe(false);
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
