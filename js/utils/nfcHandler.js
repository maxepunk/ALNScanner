/**
 * NFC Handler Module
 * Manages NFC scanning using Web NFC API
 * Extracted from monolith per Phase 4.1.2
 */

const NFCHandler = {
    reader: null,
    isScanning: false,

    /**
     * Initialize NFC and check for support
     * @returns {Promise<boolean>} Whether NFC is supported
     */
    async init() {
        return 'NDEFReader' in window;
    },

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
            await this.reader.scan();
            this.isScanning = true;

            this.reader.addEventListener("reading", ({ message, serialNumber }) => {
                const result = this.extractTokenId(message, serialNumber);
                onRead(result);
            });

            this.reader.addEventListener("readingerror", (event) => {
                Debug.log(`NFC Read Error: ${event}`, true);
                if (onError) onError(event);
            });

        } catch (error) {
            Debug.log(`Error starting NFC: ${error.message}`, true);
            throw error;
        }
    },

    /**
     * Extract token ID from NFC message
     * Uses Web NFC API's built-in NDEF parsing
     * @param {NDEFMessage} message - NFC message
     * @param {string} serialNumber - Tag serial number
     * @returns {Object} Token ID and metadata
     */
    extractTokenId(message, serialNumber) {
        Debug.log('═══ NFC TAG DETECTED ═══');
        Debug.log(`Serial: ${serialNumber}`);
        Debug.log(`Records: ${message.records?.length || 0}`);

        // No records? Use serial number as fallback
        if (!message.records || message.records.length === 0) {
            Debug.log('No NDEF records, using serial');
            return {
                id: serialNumber,
                source: 'serial-fallback',
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

        // Fallback to serial if no readable records
        Debug.log('No readable records, using serial');
        return {
            id: serialNumber,
            source: 'serial-fallback',
            raw: serialNumber
        };
    },

    /**
     * Stop NFC scanning
     * Note: Web NFC doesn't have explicit stop - scan continues until page closes
     */
    stopScan() {
        this.isScanning = false;
    },

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
};

// Export for Node.js testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NFCHandler;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.NFCHandler = NFCHandler;
}
