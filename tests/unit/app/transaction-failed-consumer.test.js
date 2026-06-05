/**
 * app transaction:failed consumer (P3.4 — carry-over)
 *
 * On a PERMANENT transaction failure (backend status 'rejected', e.g. invalid
 * token), the app must surface a visible error AND unmark the token so the GM can
 * re-scan after correcting the cause. Duplicates must NOT be unmarked (the token
 * is genuinely claimed). Fixes the lost-scan-equivalent: token locked + no feedback.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { App } from '../../../src/app/app.js';

describe('app transaction:failed consumer (P3.4)', () => {
  let app;
  let uiManager;
  let dataManager;

  beforeEach(() => {
    uiManager = { showError: jest.fn(), showToast: jest.fn() };
    dataManager = { unmarkTokenAsScanned: jest.fn() };
    app = new App({ debug: { log: jest.fn() }, uiManager, dataManager });
    // _wireNetworkedSessionEvents early-returns if networkedSession is null; give
    // it a bare EventTarget to listen on, then wire.
    app.networkedSession = new EventTarget();
    app._wireNetworkedSessionEvents();
  });

  it('surfaces a toast and unmarks the token on a permanent (rejected) failure', () => {
    app.networkedSession.dispatchEvent(new CustomEvent('transaction:failed', {
      detail: { transaction: { tokenId: 'abc' }, status: 'rejected', message: 'Invalid token ID' }
    }));

    expect(uiManager.showError).toHaveBeenCalledWith(expect.stringContaining('abc'));
    expect(dataManager.unmarkTokenAsScanned).toHaveBeenCalledWith('abc');
  });

  it('does NOT unmark the token on a duplicate failure (genuinely claimed)', () => {
    app.networkedSession.dispatchEvent(new CustomEvent('transaction:failed', {
      detail: { transaction: { tokenId: 'dup' }, status: 'duplicate', message: 'Duplicate' }
    }));

    expect(dataManager.unmarkTokenAsScanned).not.toHaveBeenCalled();
  });
});
