/**
 * Unit Test: App backend:error consumer (F-GMS-10 / F-GMCMD-03)
 *
 * AsyncAPI Decision #10: clients MUST display backend error events.
 * networkedSession dispatches backend:error for every backend 'error'
 * broadcast; the app must surface it to the operator (e.g. QUEUE_FULL /
 * VALIDATION_ERROR outside the replay path was previously dropped).
 */
import { App } from '../../../src/app/app.js';

describe('App - backend:error consumer (F-GMS-10)', () => {
  let app;
  let uiManager;

  beforeEach(() => {
    uiManager = { showError: jest.fn(), showToast: jest.fn(), showScreen: jest.fn() };
    app = new App({
      debug: { log: jest.fn() },
      uiManager,
      dataManager: {}
    });
    app.networkedSession = new EventTarget();
    app._wireNetworkedSessionEvents();
  });

  afterEach(() => jest.clearAllMocks());

  it('surfaces a backend error with code and message', () => {
    app.networkedSession.dispatchEvent(new CustomEvent('backend:error', {
      detail: { code: 'QUEUE_FULL', message: 'Offline queue is full' }
    }));

    expect(uiManager.showError).toHaveBeenCalledTimes(1);
    const msg = uiManager.showError.mock.calls[0][0];
    expect(msg).toContain('QUEUE_FULL');
    expect(msg).toContain('Offline queue is full');
  });

  it('surfaces a backend error with a missing code gracefully', () => {
    app.networkedSession.dispatchEvent(new CustomEvent('backend:error', {
      detail: { message: 'Something failed' }
    }));

    expect(uiManager.showError).toHaveBeenCalledTimes(1);
    expect(uiManager.showError.mock.calls[0][0]).toContain('Something failed');
  });
});
