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
    // The resultRfid element reflects which token the screen is currently
    // displaying; it must match the incoming tokenId for the repaint to occur.
    document.body.innerHTML = `
      <div id="resultScreen" class="screen active"></div>
      <div id="resultStatus"></div>
      <span id="resultRfid">dup</span>
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

  it('does NOT overwrite the result screen when the displayed token differs (offline-queue replay guard)', () => {
    // Scenario: operator scanned token A (offline), then while offline queued
    // they scanned token B and are now viewing B's result screen. When the
    // connection restores, the backend returns a duplicate verdict for A.
    // The stale verdict must NOT repaint token B's result screen.
    document.body.innerHTML = `
      <div id="resultScreen" class="screen active"></div>
      <div id="resultStatus"><h2>Transaction Complete!</h2></div>
      <span id="resultRfid">token-b</span>
      <span id="resultType">Technical</span>
      <span id="resultGroup"></span>
      <span id="resultValue">$750,000</span>
    `;

    // Stale duplicate verdict arrives for token-a while token-b is displayed.
    app.networkedSession.dispatchEvent(new CustomEvent('transaction:failed', {
      detail: { transaction: { tokenId: 'token-a' }, status: 'duplicate', message: 'Token already claimed by Team X' }
    }));

    // Toast/error is still shown (operator needs to know about the duplicate)
    expect(uiManager.showError).toHaveBeenCalledWith(expect.stringContaining('token-a'));

    // But the result screen must NOT have been repainted — token-b's content is intact.
    const statusEl = document.getElementById('resultStatus');
    expect(statusEl.textContent).toContain('Transaction Complete!');
    expect(statusEl.textContent).not.toContain('Token Already Scanned');
    expect(document.getElementById('resultRfid').textContent).toBe('token-b');
    expect(document.getElementById('resultValue').textContent).toBe('$750,000');
  });

  it('repaints when the verdict tokenId exactly matches the displayed RFID', () => {
    // Mirror of the offline-queue replay scenario but where the displayed token
    // IS the one that received the duplicate verdict — repaint must proceed.
    document.body.innerHTML = `
      <div id="resultScreen" class="screen active"></div>
      <div id="resultStatus"><h2>Transaction Complete!</h2></div>
      <span id="resultRfid">token-a</span>
      <span id="resultType">Personal</span>
      <span id="resultGroup"></span>
      <span id="resultValue">$10,000</span>
    `;

    app.networkedSession.dispatchEvent(new CustomEvent('transaction:failed', {
      detail: { transaction: { tokenId: 'token-a' }, status: 'duplicate', message: 'Token already claimed by Team X' }
    }));

    const statusEl = document.getElementById('resultStatus');
    expect(statusEl.textContent).toContain('Token Already Scanned');
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
