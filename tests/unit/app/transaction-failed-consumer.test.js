/**
 * app transaction:failed consumer (P3.4 — carry-over; A7/F-GMS-05/F-SCAN-07)
 *
 * On a PERMANENT transaction failure (backend status 'rejected', e.g. invalid
 * token), the app must surface a visible error AND unmark the token so the GM can
 * re-scan after correcting the cause. Duplicates must NOT be unmarked (the token
 * is genuinely claimed) but MUST be surfaced as the claimed-by message,
 * correcting the optimistic "Transaction Complete!" result screen (A7).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { App } from '../../../src/app/app.js';

describe('app transaction:failed consumer (P3.4)', () => {
  let app;
  let uiManager;
  let dataManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    uiManager = { showError: jest.fn(), showToast: jest.fn(), showScreen: jest.fn() };
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
      detail: { transaction: { tokenId: 'dup' }, status: 'duplicate', message: 'Token already claimed by Team X' }
    }));

    expect(dataManager.unmarkTokenAsScanned).not.toHaveBeenCalled();
  });

  it('surfaces the claimed-by message on a duplicate (A7 — no more silent swallow)', () => {
    app.networkedSession.dispatchEvent(new CustomEvent('transaction:failed', {
      detail: { transaction: { tokenId: 'dup' }, status: 'duplicate', message: 'Token already claimed by Team X' }
    }));

    expect(uiManager.showError).toHaveBeenCalledWith(
      expect.stringContaining('Token already claimed by Team X')
    );
  });

  it('corrects the optimistic result screen when it is still showing (A7)', () => {
    // The optimistic "Transaction Complete!" screen is active when the
    // backend's duplicate verdict lands — repaint it as a duplicate.
    document.body.innerHTML = `
      <div id="resultScreen" class="screen active"></div>
      <div id="resultStatus"></div>
      <span id="resultRfid"></span>
      <span id="resultType"></span>
      <span id="resultGroup"></span>
      <span id="resultValue"></span>
    `;

    app.networkedSession.dispatchEvent(new CustomEvent('transaction:failed', {
      detail: { transaction: { tokenId: 'dup' }, status: 'duplicate', message: 'Token already claimed by Team X' }
    }));

    const statusEl = document.getElementById('resultStatus');
    expect(statusEl.textContent).toContain('Token Already Scanned');
    expect(statusEl.textContent).toContain('Token already claimed by Team X');
    expect(document.getElementById('resultValue').textContent).toContain('No points awarded');
  });

  it('does NOT yank the GM back to the result screen if they have moved on', () => {
    // GM already scanning the next token — toast only, no forced navigation
    document.body.innerHTML = `
      <div id="resultScreen" class="screen"></div>
      <div id="scanScreen" class="screen active"></div>
      <div id="resultStatus"></div>
    `;

    app.networkedSession.dispatchEvent(new CustomEvent('transaction:failed', {
      detail: { transaction: { tokenId: 'dup' }, status: 'duplicate', message: 'Token already claimed by Team X' }
    }));

    expect(uiManager.showError).toHaveBeenCalled();
    expect(uiManager.showScreen).not.toHaveBeenCalled();
    expect(document.getElementById('resultStatus').textContent).toBe('');
  });
});
