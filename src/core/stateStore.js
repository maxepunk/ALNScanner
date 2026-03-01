/**
 * StateStore — domain-keyed state container for service state.
 *
 * Handles service domains only (spotify, video, health, etc.) with
 * snapshot/shallow-merge semantics. Session/transaction data stays
 * in UDM + storage strategies (different data pattern).
 *
 * Populated in Networked mode only. In Standalone mode, created but empty
 * (admin panel requires Networked mode; scanning UI uses UDM).
 */
export class StateStore {
  constructor() {
    this._state = {};
    this._prev = {};
    this._listeners = {};  // domain → Set<callback>
  }

  update(domain, state) {
    this._prev[domain] = this._state[domain] || null;
    this._state[domain] = { ...this._state[domain], ...state };  // shallow merge
    const listeners = this._listeners[domain];
    if (listeners) {
      for (const cb of listeners) {
        try {
          cb(this._state[domain], this._prev[domain]);
        } catch (e) {
          console.error(`StateStore listener error [${domain}]:`, e);
        }
      }
    }
  }

  get(domain) {
    const state = this._state[domain];
    return state ? { ...state } : null;
  }

  getAll() { return { ...this._state }; }

  on(domain, callback) {
    if (!this._listeners[domain]) this._listeners[domain] = new Set();
    this._listeners[domain].add(callback);
  }

  off(domain, callback) {
    this._listeners[domain]?.delete(callback);
  }
}
