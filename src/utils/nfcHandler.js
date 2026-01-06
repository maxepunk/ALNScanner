/**
 * NFC Handler Module
 * Manages NFC scanning using Web NFC API
 * ES6 Module Export
 */

import Debug from './debug.js';

class NFCHandlerClass {
  constructor() {
    this.reader = null;
    this.isScanning = false;
    this.lastRead = null;       // { id: string, timestamp: number }
    this.debounceMs = 2000;     // Ignore same tag within 2 seconds
  }

  /**
   * Initialize NFC and check for support
   * @returns {Promise<boolean>} Whether NFC is supported
   */
  async init() {
    return 'NDEFReader' in window;
  }

  /**
   * Start NFC scanning
   * @param {Function} onRead - Callback for successful reads
   * @param {Function} onError - Callback for errors
   */
  async startScan(onRead, onError) {
    if (!('NDEFReader' in window)) {
      throw new Error('NFC not supported');
    }

    try {
      this.reader = new NDEFReader();

      // CRITICAL: Attach event listeners BEFORE calling scan()
      // Otherwise events may fire before listeners are registered
      this.reader.addEventListener("reading", ({ message, serialNumber }) => {
        try {
          const result = this.extractTokenId(message, serialNumber);

          // Debounce check (only for successful reads with an ID)
          if (result.id) {
            const now = Date.now();
            if (this.lastRead &&
                this.lastRead.id === result.id &&
                (now - this.lastRead.timestamp) < this.debounceMs) {
              Debug.log(`Debounced duplicate read: ${result.id}`);
              return; // Silently ignore
            }

            // Update last read
            this.lastRead = { id: result.id, timestamp: now };
          }

          onRead(result);
        } catch (error) {
          console.error('Exception in NFC reading handler:', error);
          Debug.log(`Exception in NFC reading handler: ${error.message}`, true);
        }
      });

      this.reader.addEventListener("readingerror", (event) => {
        Debug.log(`NFC Read Error: ${event}`, true);
        if (onError) onError(event);
      });

      // NOW start scanning - listeners are ready to catch events
      await this.reader.scan();
      this.isScanning = true;

    } catch (error) {
      Debug.log(`Error starting NFC: ${error.message}`, true);
      throw error;
    }
  }

  /**
   * Extract token ID from NFC message
   * Uses Web NFC API's built-in NDEF parsing
   * @param {NDEFMessage} message - NFC message
   * @param {string} serialNumber - Tag serial number
   * @returns {Object} Token ID and metadata, or error object
   */
  extractTokenId(message, serialNumber) {
    Debug.log('═══ NFC TAG DETECTED ═══');
    Debug.log(`Serial: ${serialNumber}`);
    Debug.log(`Records: ${message.records?.length || 0}`);

    // No records? Return error instead of serial fallback
    if (!message.records || message.records.length === 0) {
      Debug.log('No NDEF records found - returning error');
      return {
        id: null,
        source: 'error',
        error: 'no-ndef-records',
        raw: serialNumber
      };
    }

    // Process records using the Web NFC API
    for (const record of message.records) {
      Debug.log(`Record type: ${record.recordType}`);

      if (record.recordType === "text") {
        const decoder = new TextDecoder(record.encoding || "utf-8");
        const text = decoder.decode(record.data);
        Debug.log(`✅ Text record: ${text}`);
        return {
          id: text.trim(),
          source: 'text-record',
          raw: text
        };
      }

      if (record.recordType === "url") {
        const decoder = new TextDecoder();
        const url = decoder.decode(record.data);
        Debug.log(`✅ URL record: ${url}`);
        return {
          id: url,
          source: 'url-record',
          raw: url
        };
      }

      // Try generic text decoding for other types
      if (record.data) {
        try {
          const text = new TextDecoder().decode(record.data);
          if (text && text.trim()) {
            Debug.log(`✅ Generic decode: ${text}`);
            return {
              id: text.trim(),
              source: 'generic-decode',
              raw: text
            };
          }
        } catch (e) {
          Debug.log(`Decode failed: ${e.message}`);
        }
      }
    }

    // No readable records? Return error instead of serial fallback
    Debug.log('No readable records found - returning error');
    return {
      id: null,
      source: 'error',
      error: 'unreadable-records',
      raw: serialNumber
    };
  }

  /**
   * Stop NFC scanning
   * Note: Web NFC doesn't have explicit stop - scan continues until page closes
   */
  stopScan() {
    this.isScanning = false;
  }

  /**
   * Simulate NFC scan for testing
   * @returns {Object} Simulated token data
   */
  simulateScan() {
    const testIds = [
      'a1b2c3d4',
      'deadbeef',
      'cafe1234',
      'babe2468',
      'feed5678',
      'unknown_' + Math.random().toString(36).substr(2, 9)
    ];
    const randomId = testIds[Math.floor(Math.random() * testIds.length)];

    return {
      id: randomId,
      source: 'simulated',
      raw: randomId
    };
  }
}

// Create singleton instance
const NFCHandler = new NFCHandlerClass();

export default NFCHandler;
export { NFCHandlerClass };
