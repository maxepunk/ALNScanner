/**
 * Block 2 T1a D13 — SessionManager.startGame carries the typed override.
 *
 * The payload shape IS the contract with the require gate: `{}` asks for a
 * plain start (and may be refused), `{startAnyway, reason}` is the typed
 * way past a NO-GO. Getting the shape wrong here would make the gate look
 * broken from the scanner side.
 */

import { SessionManager } from '../../../src/admin/SessionManager.js';

describe('SessionManager.startGame payload (T1a D13)', () => {
  let connection, sent;

  beforeEach(() => {
    sent = [];
    connection = new EventTarget();
    connection.send = jest.fn((event, envelope) => {
      sent.push({ event, envelope });
      // Ack immediately so the promise settles
      queueMicrotask(() => connection.dispatchEvent(new CustomEvent('message:received', {
        detail: { type: 'gm:command:ack', payload: { action: 'session:start', success: true, message: 'Game started' } },
      })));
    });
  });

  // connection.send('gm:command', {action, payload}) — the envelope
  // wrapping happens inside OrchestratorClient, below this seam.
  const payloadOf = () => sent[0].envelope.payload;

  it('sends an EMPTY payload when neither argument is given', async () => {
    await new SessionManager(connection).startGame();
    expect(sent[0].envelope.action).toBe('session:start');
    expect(payloadOf()).toEqual({});
  });

  it('sends an EMPTY payload for an explicit no-override call', async () => {
    await new SessionManager(connection).startGame({ startAnyway: false });
    expect(payloadOf()).toEqual({});
  });

  it('sends the override and the reason when asked to start anyway', async () => {
    await new SessionManager(connection).startGame({
      startAnyway: true, reason: 'the rig is in the van',
    });
    expect(payloadOf()).toEqual({ startAnyway: true, reason: 'the rig is in the van' });
  });
});
