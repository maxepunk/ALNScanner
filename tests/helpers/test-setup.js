/**
 * Test Setup - Mock browser APIs for Jest
 * Runs before all tests via jest.config.js setupFiles
 */

// Mock localStorage
global.localStorage = {
  store: {},
  getItem(key) {
    return this.store[key] || null;
  },
  setItem(key, value) {
    this.store[key] = String(value);
  },
  removeItem(key) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  },
  get length() {
    return Object.keys(this.store).length;
  },
  key(index) {
    const keys = Object.keys(this.store);
    return keys[index] || null;
  }
};

// Mock console to reduce noise (keep error/warn for debugging)
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  // Keep error and warn for test debugging
  error: originalConsole.error,
  warn: originalConsole.warn
};

// Mock fetch (used for health checks)
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('')
  })
);

// Mock CustomEvent (jsdom might not have full implementation)
if (typeof global.CustomEvent === 'undefined') {
  global.CustomEvent = class CustomEvent extends Event {
    constructor(event, params = { bubbles: false, cancelable: false, detail: undefined }) {
      super(event, params);
      this.detail = params.detail;
    }
  };
}

// Mock EventTarget if needed (modern browsers have it, but ensure it's available)
if (typeof global.EventTarget === 'undefined') {
  global.EventTarget = class EventTarget {
    constructor() {
      this._listeners = {};
    }

    addEventListener(type, callback) {
      if (!this._listeners[type]) {
        this._listeners[type] = [];
      }
      this._listeners[type].push(callback);
    }

    removeEventListener(type, callback) {
      if (!this._listeners[type]) return;
      this._listeners[type] = this._listeners[type].filter(cb => cb !== callback);
    }

    dispatchEvent(event) {
      if (!this._listeners[event.type]) return true;
      this._listeners[event.type].forEach(callback => {
        callback.call(this, event);
      });
      return !event.defaultPrevented;
    }
  };
}

// Mock TextEncoder/TextDecoder for NFC tests (not available in jsdom)
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Mock structuredClone. Node 17+ and all modern browsers expose it as a global
// (production has it), but Jest's sandboxed test environment does not.
// EQUIVALENCE CAVEAT: this JSON deep-clone matches native structuredClone ONLY
// while StateStore domains hold strictly JSON-serializable data (no Date / Map /
// Set / explicit `undefined` values). That holds today — every service domain is
// deserialized from JSON over the WebSocket. If a future domain ever carried a
// Date or an explicit `undefined`, native and JSON clone would diverge (native
// preserves them; JSON stringifies Dates and drops `undefined` keys), which could
// silently change replace()'s shallow-equality / notification behavior in prod
// while the test (running the JSON clone) wouldn't see it. Revisit this polyfill
// if a non-serializable domain is ever added.
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (value) =>
    (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
}

// Reset logic moved to test-hooks.js (uses setupFilesAfterEnv)
