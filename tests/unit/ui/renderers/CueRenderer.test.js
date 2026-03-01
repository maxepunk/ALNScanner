/**
 * Unit Test: CueRenderer
 *
 * Verifies differential rendering for three zones: Quick Fire Grid, Standing Cues, Active Cues.
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import { CueRenderer } from '../../../../src/ui/renderers/CueRenderer.js';

describe('CueRenderer', () => {
  let renderer;
  let gridEl, standingListEl, activeListEl;

  // Test cue definitions
  const makeCuesMap = () => new Map([
    ['tension-hit', {
      id: 'tension-hit',
      label: 'Tension Hit',
      icon: 'lightning',
      triggerType: null,
      quickFire: true,
      enabled: true,
    }],
    ['ambiance-pulse', {
      id: 'ambiance-pulse',
      label: 'Ambiance Pulse',
      icon: 'wave',
      triggerType: null,
      quickFire: true,
      enabled: true,
    }],
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
  ]);

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="quick-fire-grid"></div>
      <div id="standing-cues-list"></div>
      <div id="active-cues-list"></div>
    `;

    gridEl = document.getElementById('quick-fire-grid');
    standingListEl = document.getElementById('standing-cues-list');
    activeListEl = document.getElementById('active-cues-list');

    renderer = new CueRenderer();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('render() basics', () => {
    it('should handle null state gracefully', () => {
      expect(() => renderer.render(null)).not.toThrow();
    });

    it('should handle state with no cues gracefully', () => {
      expect(() => renderer.render({})).not.toThrow();
    });

    it('should accept DI elements via constructor', () => {
      const customGrid = document.createElement('div');
      const customStanding = document.createElement('div');
      const customActive = document.createElement('div');

      const r = new CueRenderer({
        quickFireGrid: customGrid,
        standingCuesList: customStanding,
        activeCuesList: customActive,
      });

      r.render({ cues: makeCuesMap(), activeCues: new Map(), disabledCues: new Set() });
      expect(customGrid.querySelectorAll('.cue-tile').length).toBe(2);
    });
  });

  describe('Quick Fire Grid', () => {
    it('should render quick fire cue tiles', () => {
      renderer.render({ cues: makeCuesMap(), activeCues: new Map(), disabledCues: new Set() });

      const tiles = gridEl.querySelectorAll('.cue-tile');
      expect(tiles).toHaveLength(2);
    });

    it('should set correct data-action and data-cue-id on tiles', () => {
      renderer.render({ cues: makeCuesMap(), activeCues: new Map(), disabledCues: new Set() });

      const tile = gridEl.querySelector('[data-cue-id="tension-hit"]');
      expect(tile).toBeTruthy();
      expect(tile.dataset.action).toBe('admin.fireCue');
    });

    it('should show tile label and icon class', () => {
      renderer.render({ cues: makeCuesMap(), activeCues: new Map(), disabledCues: new Set() });

      const tile = gridEl.querySelector('[data-cue-id="tension-hit"]');
      expect(tile.querySelector('.cue-tile__label').textContent).toBe('Tension Hit');
      expect(tile.querySelector('.cue-icon--lightning')).toBeTruthy();
      expect(tile.classList.contains('cue-tile--lightning')).toBe(true);
    });

    it('should show empty state when no quick fire cues exist', () => {
      const cues = new Map([
        ['standing-only', { id: 'standing-only', label: 'Standing', triggerType: 'event', quickFire: false }],
      ]);
      renderer.render({ cues, activeCues: new Map(), disabledCues: new Set() });

      expect(gridEl.textContent).toContain('No Quick Fire cues available');
    });

    it('should build grid only once (not rebuild on re-render)', () => {
      const state = { cues: makeCuesMap(), activeCues: new Map(), disabledCues: new Set() };
      renderer.render(state);

      const firstTile = gridEl.querySelector('.cue-tile');

      // Re-render
      renderer.render(state, state);

      // Same DOM element preserved
      expect(gridEl.querySelector('.cue-tile')).toBe(firstTile);
    });

    it('should use cue.id as fallback label when label is missing', () => {
      const cues = new Map([
        ['no-label', { id: 'no-label', quickFire: true }],
      ]);
      renderer.render({ cues, activeCues: new Map(), disabledCues: new Set() });

      expect(gridEl.querySelector('.cue-tile__label').textContent).toBe('no-label');
    });

    it('should escape HTML in cue labels', () => {
      const cues = new Map([
        ['xss', { id: 'xss', label: '<script>alert("xss")</script>', quickFire: true }],
      ]);
      renderer.render({ cues, activeCues: new Map(), disabledCues: new Set() });

      // Label content must be escaped (innerHTML injection vector)
      const labelEl = gridEl.querySelector('.cue-tile__label');
      expect(labelEl.innerHTML).toContain('&lt;script&gt;');
      expect(labelEl.innerHTML).not.toContain('<script>');
    });
  });

  describe('Standing Cues', () => {
    it('should render standing cues (triggerType set, not quickFire)', () => {
      renderer.render({ cues: makeCuesMap(), activeCues: new Map(), disabledCues: new Set() });

      const items = standingListEl.querySelectorAll('.standing-cue-item');
      expect(items).toHaveLength(2);
    });

    it('should show trigger type labels', () => {
      renderer.render({ cues: makeCuesMap(), activeCues: new Map(), disabledCues: new Set() });

      const triggers = Array.from(standingListEl.querySelectorAll('.standing-cue-item__trigger'))
        .map(el => el.textContent);
      // One clock, one event
      expect(triggers).not.toContain('undefined');
      expect(triggers).not.toContain('');
    });

    it('should show Disable buttons for enabled cues', () => {
      renderer.render({ cues: makeCuesMap(), activeCues: new Map(), disabledCues: new Set() });

      const btns = standingListEl.querySelectorAll('[data-action="admin.disableCue"]');
      expect(btns).toHaveLength(2);
    });

    it('should show Enable button for disabled cues', () => {
      renderer.render({
        cues: makeCuesMap(),
        activeCues: new Map(),
        disabledCues: new Set(['attention-before-video']),
      });

      const item = standingListEl.querySelector('[data-cue-id="attention-before-video"]');
      expect(item.classList.contains('standing-cue-item--disabled')).toBe(true);
      const btn = item.querySelector('[data-action="admin.enableCue"]');
      expect(btn).toBeTruthy();
    });

    it('should show empty state when no standing cues exist', () => {
      const cues = new Map([
        ['qf-only', { id: 'qf-only', label: 'QF', quickFire: true }],
      ]);
      renderer.render({ cues, activeCues: new Map(), disabledCues: new Set() });

      expect(standingListEl.textContent).toContain('No standing cues configured');
    });

    it('should treat cue.enabled === false as disabled', () => {
      const cues = new Map([
        ['disabled-cue', { id: 'disabled-cue', label: 'Off', triggerType: 'event', quickFire: false, enabled: false }],
      ]);
      renderer.render({ cues, activeCues: new Map(), disabledCues: new Set() });

      const item = standingListEl.querySelector('[data-cue-id="disabled-cue"]');
      expect(item.classList.contains('standing-cue-item--disabled')).toBe(true);
    });
  });

  describe('Standing Cues - differential updates', () => {
    it('should toggle enable/disable without rebuilding DOM', () => {
      const state1 = { cues: makeCuesMap(), activeCues: new Map(), disabledCues: new Set() };
      renderer.render(state1);

      const itemBefore = standingListEl.querySelector('[data-cue-id="attention-before-video"]');
      expect(itemBefore.classList.contains('standing-cue-item--enabled')).toBe(true);

      // Disable one cue
      const state2 = { ...state1, disabledCues: new Set(['attention-before-video']) };
      renderer.render(state2, state1);

      // Same DOM element, toggled class
      const itemAfter = standingListEl.querySelector('[data-cue-id="attention-before-video"]');
      expect(itemAfter).toBe(itemBefore); // preserved
      expect(itemAfter.classList.contains('standing-cue-item--disabled')).toBe(true);
      expect(itemAfter.querySelector('[data-action="admin.enableCue"]')).toBeTruthy();
    });

    it('should toggle back from disabled to enabled', () => {
      const state1 = {
        cues: makeCuesMap(),
        activeCues: new Map(),
        disabledCues: new Set(['midgame-tension']),
      };
      renderer.render(state1);

      const item = standingListEl.querySelector('[data-cue-id="midgame-tension"]');
      expect(item.classList.contains('standing-cue-item--disabled')).toBe(true);

      const state2 = { ...state1, disabledCues: new Set() };
      renderer.render(state2, state1);

      expect(item.classList.contains('standing-cue-item--enabled')).toBe(true);
      expect(item.querySelector('[data-action="admin.disableCue"]')).toBeTruthy();
    });

    it('should not touch DOM if disabled state unchanged', () => {
      const state1 = { cues: makeCuesMap(), activeCues: new Map(), disabledCues: new Set() };
      renderer.render(state1);

      const actionsHTML = standingListEl.querySelector('.standing-cue-item__actions').innerHTML;

      // Re-render with same disabled set
      renderer.render(state1, state1);

      expect(standingListEl.querySelector('.standing-cue-item__actions').innerHTML).toBe(actionsHTML);
    });
  });

  describe('Active Cues', () => {
    it('should render active cues with progress', () => {
      const activeCues = new Map([
        ['tension-hit', { state: 'running', progress: 0.5, duration: 30 }],
      ]);
      renderer.render({ cues: makeCuesMap(), activeCues, disabledCues: new Set() });

      const items = activeListEl.querySelectorAll('.active-cue-item');
      expect(items).toHaveLength(1);

      const item = items[0];
      expect(item.dataset.cueId).toBe('tension-hit');
      expect(item.querySelector('.progress-bar__text').textContent).toBe('50%');
      expect(item.querySelector('.progress-bar__fill').style.width).toBe('50%');
    });

    it('should show Pause button for running cues', () => {
      const activeCues = new Map([
        ['tension-hit', { state: 'running', progress: 0.3 }],
      ]);
      renderer.render({ cues: makeCuesMap(), activeCues, disabledCues: new Set() });

      const pauseBtn = activeListEl.querySelector('[data-action="admin.pauseCue"]');
      expect(pauseBtn).toBeTruthy();
      expect(pauseBtn.dataset.cueId).toBe('tension-hit');
    });

    it('should show Resume button for paused cues', () => {
      const activeCues = new Map([
        ['tension-hit', { state: 'paused', progress: 0.3 }],
      ]);
      renderer.render({ cues: makeCuesMap(), activeCues, disabledCues: new Set() });

      const resumeBtn = activeListEl.querySelector('[data-action="admin.resumeCue"]');
      expect(resumeBtn).toBeTruthy();
    });

    it('should always show Stop button', () => {
      const activeCues = new Map([
        ['tension-hit', { state: 'running', progress: 0.3 }],
      ]);
      renderer.render({ cues: makeCuesMap(), activeCues, disabledCues: new Set() });

      const stopBtn = activeListEl.querySelector('[data-action="admin.stopCue"]');
      expect(stopBtn).toBeTruthy();
    });

    it('should show cue label from definition', () => {
      const activeCues = new Map([
        ['tension-hit', { state: 'running', progress: 0 }],
      ]);
      renderer.render({ cues: makeCuesMap(), activeCues, disabledCues: new Set() });

      expect(activeListEl.querySelector('.active-cue-item__label').textContent).toBe('Tension Hit');
    });

    it('should show cue ID as fallback when no definition found', () => {
      const activeCues = new Map([
        ['unknown-cue', { state: 'running', progress: 0 }],
      ]);
      renderer.render({ cues: makeCuesMap(), activeCues, disabledCues: new Set() });

      expect(activeListEl.querySelector('.active-cue-item__label').textContent).toBe('unknown-cue');
    });

    it('should show empty state when no active cues', () => {
      renderer.render({ cues: makeCuesMap(), activeCues: new Map(), disabledCues: new Set() });

      expect(activeListEl.textContent).toContain('No active cues');
    });

    it('should show Running/Paused state text', () => {
      const activeCues = new Map([
        ['tension-hit', { state: 'running', progress: 0.5 }],
        ['midgame-tension', { state: 'paused', progress: 0.2 }],
      ]);
      renderer.render({ cues: makeCuesMap(), activeCues, disabledCues: new Set() });

      const stateEls = activeListEl.querySelectorAll('.active-cue-item__state');
      const stateTexts = Array.from(stateEls).map(el => el.textContent.trim());
      expect(stateTexts).toContain('Running');
      expect(stateTexts).toContain('Paused');
    });

    it('should handle missing details gracefully', () => {
      const activeCues = new Map([
        ['tension-hit', null],
      ]);
      renderer.render({ cues: makeCuesMap(), activeCues, disabledCues: new Set() });

      const item = activeListEl.querySelector('.active-cue-item');
      expect(item).toBeTruthy();
      expect(item.querySelector('.progress-bar__text').textContent).toBe('0%');
    });
  });

  describe('Active Cues - differential updates', () => {
    it('should update progress in-place when same cue set', () => {
      const activeCues1 = new Map([
        ['tension-hit', { state: 'running', progress: 0.3 }],
      ]);
      const state1 = { cues: makeCuesMap(), activeCues: activeCues1, disabledCues: new Set() };
      renderer.render(state1);

      const itemBefore = activeListEl.querySelector('[data-cue-id="tension-hit"]');
      expect(itemBefore.querySelector('.progress-bar__text').textContent).toBe('30%');

      // Update progress only
      const activeCues2 = new Map([
        ['tension-hit', { state: 'running', progress: 0.7 }],
      ]);
      const state2 = { cues: makeCuesMap(), activeCues: activeCues2, disabledCues: new Set() };
      renderer.render(state2, state1);

      // Same DOM element preserved
      const itemAfter = activeListEl.querySelector('[data-cue-id="tension-hit"]');
      expect(itemAfter).toBe(itemBefore);
      expect(itemAfter.querySelector('.progress-bar__text').textContent).toBe('70%');
      expect(itemAfter.querySelector('.progress-bar__fill').style.width).toBe('70%');
    });

    it('should update state from running to paused in-place', () => {
      const activeCues1 = new Map([
        ['tension-hit', { state: 'running', progress: 0.5 }],
      ]);
      const state1 = { cues: makeCuesMap(), activeCues: activeCues1, disabledCues: new Set() };
      renderer.render(state1);

      expect(activeListEl.querySelector('.state-running')).toBeTruthy();
      expect(activeListEl.querySelector('[data-action="admin.pauseCue"]')).toBeTruthy();

      // Pause
      const activeCues2 = new Map([
        ['tension-hit', { state: 'paused', progress: 0.5 }],
      ]);
      const state2 = { cues: makeCuesMap(), activeCues: activeCues2, disabledCues: new Set() };
      renderer.render(state2, state1);

      expect(activeListEl.querySelector('.state-paused')).toBeTruthy();
      expect(activeListEl.querySelector('[data-action="admin.resumeCue"]')).toBeTruthy();
      expect(activeListEl.querySelector('[data-action="admin.pauseCue"]')).toBeNull();
    });

    it('should rebuild when active cue set changes (new cue added)', () => {
      const activeCues1 = new Map([
        ['tension-hit', { state: 'running', progress: 0.5 }],
      ]);
      const state1 = { cues: makeCuesMap(), activeCues: activeCues1, disabledCues: new Set() };
      renderer.render(state1);

      const items1 = activeListEl.querySelectorAll('.active-cue-item');
      expect(items1).toHaveLength(1);

      // Add second cue
      const activeCues2 = new Map([
        ['tension-hit', { state: 'running', progress: 0.6 }],
        ['midgame-tension', { state: 'running', progress: 0.1 }],
      ]);
      const state2 = { cues: makeCuesMap(), activeCues: activeCues2, disabledCues: new Set() };
      renderer.render(state2, state1);

      const items2 = activeListEl.querySelectorAll('.active-cue-item');
      expect(items2).toHaveLength(2);
    });

    it('should rebuild when active cue removed', () => {
      const activeCues1 = new Map([
        ['tension-hit', { state: 'running', progress: 0.5 }],
        ['midgame-tension', { state: 'running', progress: 0.3 }],
      ]);
      const state1 = { cues: makeCuesMap(), activeCues: activeCues1, disabledCues: new Set() };
      renderer.render(state1);

      expect(activeListEl.querySelectorAll('.active-cue-item')).toHaveLength(2);

      // Remove one
      const activeCues2 = new Map([
        ['midgame-tension', { state: 'running', progress: 0.4 }],
      ]);
      const state2 = { cues: makeCuesMap(), activeCues: activeCues2, disabledCues: new Set() };
      renderer.render(state2, state1);

      expect(activeListEl.querySelectorAll('.active-cue-item')).toHaveLength(1);
      expect(activeListEl.querySelector('[data-cue-id="midgame-tension"]')).toBeTruthy();
      expect(activeListEl.querySelector('[data-cue-id="tension-hit"]')).toBeNull();
    });

    it('should show empty state when all cues complete', () => {
      const activeCues1 = new Map([
        ['tension-hit', { state: 'running', progress: 0.5 }],
      ]);
      const state1 = { cues: makeCuesMap(), activeCues: activeCues1, disabledCues: new Set() };
      renderer.render(state1);

      // All cues complete
      const state2 = { cues: makeCuesMap(), activeCues: new Map(), disabledCues: new Set() };
      renderer.render(state2, state1);

      expect(activeListEl.textContent).toContain('No active cues');
    });

    it('should handle non-Map activeCues gracefully', () => {
      renderer.render({ cues: makeCuesMap(), activeCues: 'invalid', disabledCues: new Set() });

      expect(activeListEl.textContent).toContain('No active cues');
    });
  });

  describe('DOM isolation between zones', () => {
    it('should not render quick fire cues in standing list', () => {
      renderer.render({ cues: makeCuesMap(), activeCues: new Map(), disabledCues: new Set() });

      const standingIds = Array.from(standingListEl.querySelectorAll('[data-cue-id]'))
        .map(el => el.dataset.cueId);

      expect(standingIds).not.toContain('tension-hit');
      expect(standingIds).not.toContain('ambiance-pulse');
    });

    it('should not render standing cues in quick fire grid', () => {
      renderer.render({ cues: makeCuesMap(), activeCues: new Map(), disabledCues: new Set() });

      const gridIds = Array.from(gridEl.querySelectorAll('[data-cue-id]'))
        .map(el => el.dataset.cueId);

      expect(gridIds).not.toContain('attention-before-video');
      expect(gridIds).not.toContain('midgame-tension');
    });
  });
});
