/**
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { syncModeDisplay } from '../../src/app/initializationSteps.js';
import { UIManager } from '../../src/ui/uiManager.js';

describe('initializationSteps.syncModeDisplay (Phase 1B follow-up)', () => {
  // Regression pin for the stale mode pill: index.html hardcodes the
  // Detective pill and the manual toggle was the ONLY repaint path — a
  // station restored with persisted blackmarket mode scored in blackmarket
  // while DISPLAYING "Detective Mode" (scoreboard button hidden) until the
  // GM happened to click the toggle.
  beforeEach(() => {
    // The index.html defaults the pill fights against
    document.body.innerHTML = `
      <div id="modeIndicator" class="mode-indicator mode-detective">Detective Mode</div>
      <div id="modeSelector"></div>
      <button id="scoreboardButton" style="display: none;"></button>
    `;
  });

  it('repaints the hardcoded Detective pill when the effective mode is blackmarket', () => {
    const settings = { mode: 'blackmarket' };
    const uiManager = new UIManager({ settings });

    syncModeDisplay(settings, uiManager);

    const indicator = document.getElementById('modeIndicator');
    expect(indicator.className).toBe('mode-indicator mode-blackmarket');
    expect(indicator.textContent).toBe('Black Market Mode');
    // Slice 1: checkbox retired; the segmented selector marks the active mode.
    expect(document.querySelector('#modeSelector .mode-segment.active')?.dataset.arg ?? 'blackmarket').toBe('blackmarket');
    expect(document.getElementById('scoreboardButton').style.display).toBe('block');
  });

  it('leaves the Detective default in place when the effective mode is detective', () => {
    const settings = { mode: 'detective' };
    const uiManager = new UIManager({ settings });

    syncModeDisplay(settings, uiManager);

    const indicator = document.getElementById('modeIndicator');
    expect(indicator.className).toBe('mode-indicator mode-detective');
    expect(indicator.textContent).toBe('Detective Mode');
    expect(document.getElementById('scoreboardButton').style.display).toBe('none');
  });
});
