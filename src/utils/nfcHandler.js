/**
 * NFC Handler Module
 * Manages NFC scanning using Web NFC API
 * ES6 Module Export
 */

import Debug from './debug.js';

class NFCHandlerClass {
  constructor() {
    this.reader = null;
    this.abortController = null;
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
      // Idempotent re-arm: tear down any prior scan before starting a new one
      // (called on every team confirmation + lifecycle resume — prevents leaked
      //  readers/listeners and a single tap processed by more than one listener).
      if (this.abortController) {
        this.stopScan();
      }

      this.reader = new NDEFReader();
      this.abortController = new AbortController();

      // CRITICAL: Attach event listeners BEFORE calling scan()
      // Otherwise events may fire before listeners are registered
      this.reader.addEventListener("reading", ({ message, serialNumber }) => {
        try {
          const result = this.extractTokenId(message, serialNumber);
          const now = Date.now();

          // Debounce check - use tokenId for success, serialNumber for errors
          const debounceKey = result.id || serialNumber;
          if (debounceKey) {
            if (this.lastRead &&
                this.lastRead.id === debounceKey &&
                (now - this.lastRead.timestamp) < this.debounceMs) {
              Debug.log(`Debounced duplicate ${result.id ? 'read' : 'error'}: ${debounceKey}`);
              return; // Silently ignore
            }

            // Update last read
            this.lastRead = { id: debounceKey, timestamp: now };
          }

          onRead(result);
        } catch (error) {
          console.error('Exception in NFC reading handler:', error);
          Debug.log(`Exception in NFC reading handler: ${error.message}`, true);
        }
      });

      this.reader.addEventListener("readingerror", (event) => {
        // readingerror events carry no `message`; log the event type (the only
        // meaningful field) instead of stringifying the raw Event to [object Event].
        Debug.log(`NFC Read Error (event type: ${event?.type || 'unknown'})`, true);
        if (onError) onError(event);
      });

      // NOW start scanning - listeners are ready to catch events.
      // Pass the abort signal so stopScan() can truly stop the radio.
      await this.reader.scan({ signal: this.abortController.signal });
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

    // Production tags often carry BOTH a text record (the token id) AND a url
    // record for purposes UNRELATED to the orchestrator. Always PREFER the text
    // record regardless of record order — a url (or any other) record must never
    // be treated as the token. Scan all records for the first usable text record.
    for (const record of message.records) {
      Debug.log(`Record type: ${record.recordType}`);

      if (record.recordType === "text") {
        const decoder = new TextDecoder(record.encoding || "utf-8");
        const text = decoder.decode(record.data);
        const id = text.trim();
        if (id) {
          Debug.log(`✅ Text record: ${text}`);
          return {
            id,
            source: 'text-record',
            raw: text
          };
        }
        Debug.log('Text record present but empty — continuing');
      }
    }

    // No usable text record. url/other records are NOT token sources (NFC-5):
    // do NOT best-effort-decode them (that queued junk Unknown transactions
    // because findToken never matches a URL/foreign string). Hard-fail so the
    // operator re-taps (or uses the Manual Entry button).
    Debug.log('No usable text record found - returning error');
    return {
      id: null,
      source: 'error',
      error: 'no-text-record',
      raw: serialNumber
    };
  }

  /**
   * Stop NFC scanning by aborting the active scan.
   * Web NFC DOES support stopping via AbortController (NDEFReader.scan({signal})).
   */
  stopScan() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = null;
    this.reader = null;
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
