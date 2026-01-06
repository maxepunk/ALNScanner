/**
 * ALN Tools - Shared JavaScript Module
 * Used by: tag-writer.html, token-checkin.html
 */

// ==================== Environment Configuration ====================
export const ENV_CONFIG = {
    local: {
        name: 'LOCAL',
        baseUrl: 'https://raspberrypi.local:3000/player-scanner/',
        tokensUrl: './tokens.json'
    },
    dev: {
        name: 'DEV',
        baseUrl: 'https://raspberrypi.local:3000/player-scanner/',
        tokensUrl: 'https://raspberrypi.local:3000/player-scanner/data/tokens.json'
    },
    prod: {
        name: 'PROD',
        baseUrl: 'https://aln-orchestrator.local:3000/player-scanner/',
        tokensUrl: 'https://aln-orchestrator.local:3000/player-scanner/data/tokens.json'
    }
};

/**
 * Get the current environment configuration based on UI state
 * @param {HTMLSelectElement} envSelect - The environment dropdown element
 * @param {HTMLInputElement} customUrlInput - The custom URL input element
 * @returns {Object} Environment config with name, baseUrl, tokensUrl
 */
export function getEnvironment(envSelect, customUrlInput) {
    const customUrl = customUrlInput?.value?.trim();
    if (customUrl) {
        const base = customUrl.endsWith('/') ? customUrl : customUrl + '/';
        return {
            name: 'CUSTOM',
            baseUrl: base,
            tokensUrl: base + 'data/tokens.json'
        };
    }
    return ENV_CONFIG[envSelect?.value || 'local'];
}

// ==================== Token Loading ====================

/**
 * Load tokens from the configured environment
 * @param {Object} env - Environment config with tokensUrl
 * @param {number} timeoutMs - Timeout in milliseconds (default 10000)
 * @returns {Promise<Object>} Token data object
 */
export async function loadTokens(env, timeoutMs = 10000) {
    const res = await fetch(env.tokensUrl, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

// ==================== NFC Helpers ====================

/**
 * Check if Web NFC is supported
 * @returns {boolean}
 */
export function checkNFCSupport() {
    return 'NDEFReader' in window;
}

/**
 * Read an NFC tag (single read with timeout)
 * @param {number} timeoutMs - Timeout in milliseconds (default 5000)
 * @returns {Promise<Array>} Array of record objects with type and data
 */
export async function readNFCTag(timeoutMs = 5000) {
    return new Promise(async (resolve, reject) => {
        const reader = new NDEFReader();
        const ctrl = new AbortController();
        const timeout = setTimeout(() => {
            ctrl.abort();
            reject(new Error('Read timeout'));
        }, timeoutMs);

        reader.addEventListener('reading', ({ message }) => {
            clearTimeout(timeout);
            ctrl.abort();
            const records = [...message.records].map(r => {
                let data;
                if (r.recordType === 'url') {
                    data = new TextDecoder().decode(r.data);
                } else {
                    data = new TextDecoder(r.encoding || 'utf-8').decode(r.data);
                }
                return { type: r.recordType, data };
            });
            resolve(records);
        }, { signal: ctrl.signal });

        reader.addEventListener('readingerror', () => {
            clearTimeout(timeout);
            ctrl.abort();
            reject(new Error('Read failed'));
        }, { signal: ctrl.signal });

        await reader.scan({ signal: ctrl.signal });
    });
}

/**
 * Start continuous NFC scanning (returns reader for caller to manage)
 * @param {Function} onRead - Callback with (records) array
 * @param {Function} onError - Callback with (error)
 * @returns {Promise<{reader: NDEFReader, abort: Function}>}
 */
export async function startContinuousScan(onRead, onError) {
    const reader = new NDEFReader();
    const ctrl = new AbortController();

    reader.addEventListener('reading', ({ message }) => {
        const records = [...message.records].map(r => {
            let data;
            if (r.recordType === 'url') {
                data = new TextDecoder().decode(r.data);
            } else {
                data = new TextDecoder(r.encoding || 'utf-8').decode(r.data);
            }
            return { type: r.recordType, data };
        });
        onRead(records);
    }, { signal: ctrl.signal });

    reader.addEventListener('readingerror', () => {
        onError(new Error('Read failed'));
    }, { signal: ctrl.signal });

    await reader.scan({ signal: ctrl.signal });

    return {
        reader,
        abort: () => ctrl.abort()
    };
}

/**
 * Write data to an NFC tag
 * CRITICAL: Text record MUST be first for ESP32/MFRC522 compatibility.
 * Hardware scanners extract first text record only; URL record is for Android auto-open.
 * @param {string} tokenId - Token ID to write as text record
 * @param {string} url - URL to write as URL record
 */
export async function writeNFCTag(tokenId, url) {
    const writer = new NDEFReader();
    await writer.write({
        records: [
            { recordType: "text", data: tokenId },
            { recordType: "url", data: url }
        ]
    });
}

// ==================== UI Helpers ====================

/**
 * Update a status bar element
 * @param {HTMLElement} statusBar - The status bar element
 * @param {string} text - Status text to display
 * @param {string} type - Status type: '', 'loading', 'success', 'error'
 */
export function setStatusBar(statusBar, text, type = '') {
    const dot = statusBar.querySelector('.status-dot');
    const span = statusBar.querySelector('span:last-child');
    if (dot) dot.className = `status-dot ${type}`;
    if (span) span.textContent = text;
}

/**
 * Shorthand for getElementById
 */
export const $ = id => document.getElementById(id);

// ==================== URL Parameter Helpers ====================

/**
 * Get a URL parameter value
 * @param {string} name - Parameter name
 * @returns {string|null}
 */
export function getURLParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

/**
 * Build a URL with query parameters
 * @param {string} base - Base URL
 * @param {Object} params - Key-value pairs for query string
 * @returns {string}
 */
export function buildURLWithParams(base, params) {
    const url = new URL(base, window.location.href);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
            url.searchParams.set(key, value);
        }
    });
    return url.toString();
}

// ==================== Utility Functions ====================

/**
 * Sleep for specified milliseconds
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/**
 * Format a relative time string (e.g., "2 hours ago")
 * @param {string|Date} dateInput - ISO string or Date object
 * @returns {string}
 */
export function formatRelativeTime(dateInput) {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}
