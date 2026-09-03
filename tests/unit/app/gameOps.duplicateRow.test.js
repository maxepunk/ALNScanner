/**
 * @jest-environment jsdom
 */

// Theme unit ST.2 review (spec finding 2): showDuplicateError is a
// FOURTH writer of #resultValue outside showTokenResult's show/hide
// discipline. Under ALN's ruled display:'none', a duplicate rescan
// right after a themed render would write "No points awarded" into a
// row still hidden from the prior render — invisible GM feedback. The
// duplicate path must make the row visible before writing.

import { describe, it, expect, jest } from '@jest/globals';
import { GameOpsDomain } from '../../../src/app/domains/gameOps.js';

const RESULT_DOM = `
  <div id="resultStatus"></div>
  <span id="resultRfid"></span>
  <span id="resultType"></span>
  <span id="resultGroup"></span>
  <div class="transaction-detail" style="display: none;">
    <label>Value Rating:</label>
    <span class="value" id="resultValue"></span>
  </div>`;

describe('showDuplicateError vs the themed value row (theme unit ST.2 review)', () => {
  it('makes the value row VISIBLE before writing — a prior themed-none hide never swallows duplicate feedback', () => {
    document.body.innerHTML = RESULT_DOM;
    const app = { uiManager: { showScreen: jest.fn() } };
    new GameOpsDomain(app).showDuplicateError('tok1');

    const row = document.getElementById('resultValue').closest('.transaction-detail');
    expect(row.style.display).toBe('');
    expect(document.getElementById('resultValue').textContent).toBe('No points awarded');
    expect(app.uiManager.showScreen).toHaveBeenCalledWith('result');
  });
});
