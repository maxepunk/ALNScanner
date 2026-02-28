/**
 * Unit Test: CueRenderer
 *
 * Verifies that the CueRenderer correctly renders cue UI elements with proper data-action attributes.
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import { CueRenderer } from '../../../../src/ui/renderers/CueRenderer.js';

describe('CueRenderer', () => {
  let renderer;

  beforeEach(() => {
    // Setup Mock DOM
    document.body.innerHTML = `
      <div id="quick-fire-grid"></div>
      <div id="standing-cues-list"></div>
      <div id="active-cues-list"></div>
    `;

    renderer = new CueRenderer();
  });

  describe('standing cues', () => {
    it('should render standing cues with triggerType field from backend summaries', () => {
      const cuesMap = new Map([
        ['attention-before-video', {
          id: 'attention-before-video',
          label: 'Pre-Video Alert',
          triggerType: 'event',
          quickFire: false,
          enabled: true,
        }],
        ['midgame-tension', {
          id: 'midgame-tension',
          label: 'Midgame Tension',
          triggerType: 'clock',
          quickFire: false,
          enabled: true,
        }],
        ['tension-hit', {
          id: 'tension-hit',
          label: 'Tension Hit',
          triggerType: null,
          quickFire: true,
          enabled: true,
        }],
      ]);

      renderer.render({ cues: cuesMap, activeCues: new Map(), disabledCues: new Set() });

      const standingListEl = document.getElementById('standing-cues-list');
      // Standing cues = has triggerType, not quickFire
      const standingItems = standingListEl.querySelectorAll('.standing-cue-item');
      expect(standingItems.length).toBe(2);

      // Verify trigger type is displayed as readable text (not undefined or [object Object])
      const triggerTexts = Array.from(standingItems).map(el =>
        el.querySelector('.standing-cue-item__trigger').textContent
      );
      expect(triggerTexts).not.toContain('undefined');
      expect(triggerTexts).not.toContain('[object Object]');
      expect(triggerTexts).not.toContain('');
    });

    it('should show empty state when no standing cues exist', () => {
      const cuesMap = new Map([
        ['tension-hit', {
          id: 'tension-hit',
          label: 'Tension Hit',
          triggerType: null,
          quickFire: true,
          enabled: true,
        }],
      ]);

      renderer.render({ cues: cuesMap, activeCues: new Map(), disabledCues: new Set() });

      const standingListEl = document.getElementById('standing-cues-list');
      expect(standingListEl.innerHTML).toContain('No standing cues configured');
    });
  });

  // renderHeldItem tests removed — Phase 4 replaced by HeldItemsRenderer
});
