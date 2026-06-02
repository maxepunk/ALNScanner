/**
 * app.adminResetAndCreateNew - system:reset ack action filtering (AC-3)
 *
 * The inline system:reset path must ignore gm:command:ack envelopes whose
 * action is not 'system:reset' (a racing ack must not resolve/reject the
 * reset promise on the wrong event).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
// app.js default-exports the singleton INSTANCE; the class is the NAMED export.
import { App } from '../../../src/app/app.js';

describe('app.adminResetAndCreateNew - ack action filter (AC-3)', () => {
  let app;
  let fakeSocket;
  let sessionManager;

  beforeEach(() => {
    // confirm() -> true, prompt() -> session name
    global.confirm = jest.fn(() => true);
    global.prompt = jest.fn(() => 'New Game');
    global.alert = jest.fn();

    // Fake socket modelling real socket.once one-shot semantics: only ONE
    // gm:command:ack handler is registered at a time, removed BEFORE it fires
    // (so the production re-arm via socket.once(...) inside the handler is
    // genuinely exercised, and an un-re-armed handler drops the next ack).
    fakeSocket = {
      _ackHandler: null,
      once: jest.fn((event, cb) => { if (event === 'gm:command:ack') fakeSocket._ackHandler = cb; }),
      emit: jest.fn(),
      _deliverAck(payload) {
        const cb = this._ackHandler;
        this._ackHandler = null; // one-shot removal before invoke (real socket.once)
        if (cb) cb(payload);
      },
    };

    sessionManager = {
      connection: { socket: fakeSocket },
      createSession: jest.fn().mockResolvedValue({}),
    };

    app = new App({
      debug: { log: jest.fn() },
      uiManager: { showToast: jest.fn(), showError: jest.fn() },
      dataManager: { getSessionData: jest.fn() },
    });
    app.viewController = { adminInstances: { sessionManager } };
  });

  it('ignores a foreign (failed) ack and resolves on the system:reset ack', async () => {
    const resetPromise = app.adminResetAndCreateNew();

    // Wait a microtask for socket.once to register.
    await Promise.resolve();
    expect(fakeSocket._ackHandler).toBeDefined();

    // A racing ack for a DIFFERENT action arrives first, and it FAILED — under
    // current (unfiltered) code this rejects the reset (the catch swallows it and
    // createSession is never called). With the action filter it must be ignored
    // and the listener re-armed.
    fakeSocket._deliverAck({ event: 'gm:command:ack', data: { action: 'session:create', success: false, message: 'nope' }, timestamp: '' });
    // The genuine reset ack arrives next — must resolve the wait.
    fakeSocket._deliverAck({ event: 'gm:command:ack', data: { action: 'system:reset', success: true }, timestamp: '' });

    await resetPromise;
    // The decisive assertion: createSession only runs if the reset wait resolved,
    // which only happens if the foreign ack was ignored (not rejected) and the
    // matching system:reset ack was observed.
    expect(sessionManager.createSession).toHaveBeenCalledWith('New Game');
  });
});
