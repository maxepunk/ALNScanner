/**
 * Unit Test: CueRenderer
 *
 * Verifies differential rendering for three zones: Quick Fire Grid, Standing Cues, Active Cues.
 * @jest-environment jsdom
 */

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

    it('a markup-bearing pack icon can NEVER escape the class attribute (train-review MAJOR 7 / LC-1)', () => {
      // The review's live exploit: cues are PACK CONTENT (the lowest
      // trust tier) and `icon` was interpolated raw into two class
      // attributes — a gate-passing icon value broke out of the
      // attribute and ran script in the origin holding the operator
      // JWT. Every class-name interpolation of pack data goes through
      // slugifyId (the 3c convention modeSemantics already uses).
      const cues = new Map([
        ['hostile', {
          id: 'hostile',
          label: 'Hostile',
          icon: 'x" onmouseover="window.__pwned=1" data-y="',
          triggerType: null,
          quickFire: true,
          enabled: true,
        }],
      ]);
      renderer.render({ cues, activeCues: new Map(), disabledCues: new Set() });

      const tile = gridEl.querySelector('[data-cue-id="hostile"]');
      expect(tile).toBeTruthy();
      expect(tile.hasAttribute('onmouseover')).toBe(false);
      expect(window.__pwned).toBeUndefined();
      // The hostile value survives only as one collapsed class token
      expect(tile.className).not.toContain('"');
      // The honest happy path is untouched (pinned above): plain icons
      // like 'lightning' slug to themselves.
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
      expect(item.querySelector('.progress-text').textContent).toBe('50%');
      expect(item.querySelector('.progress-fill').style.width).toBe('50%');
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
      expect(item.querySelector('.progress-text').textContent).toBe('0%');
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
      expect(itemBefore.querySelector('.progress-text').textContent).toBe('30%');

      // Update progress only
      const activeCues2 = new Map([
        ['tension-hit', { state: 'running', progress: 0.7 }],
      ]);
      const state2 = { cues: makeCuesMap(), activeCues: activeCues2, disabledCues: new Set() };
      renderer.render(state2, state1);

      // Same DOM element preserved
      const itemAfter = activeListEl.querySelector('[data-cue-id="tension-hit"]');
      expect(itemAfter).toBe(itemBefore);
      expect(itemAfter.querySelector('.progress-text').textContent).toBe('70%');
      expect(itemAfter.querySelector('.progress-fill').style.width).toBe('70%');
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
  // ══════════════════════════════════════════════════════════════════
  // Block 2 T1a D13 — dormancy in the cue panel (pins P3/P4).
  //
  // A cue silenced because the equipment it needs is not in the room must
  // LOOK silenced before a GM taps it. And a MIXED cue — one command on
  // absent equipment, the rest live — must say which half will be skipped,
  // because it still fires and the GM should not be surprised by the
  // silence where the lighting hit should have been.
  // ══════════════════════════════════════════════════════════════════
  describe('dormancy (T1a D13)', () => {
    const dormantCues = () => new Map([
      ['vault-alarm-hit', {
        id: 'vault-alarm-hit', label: 'Vault Alarm', icon: 'alert',
        triggerType: null, quickFire: true,
        enabled: false, disabledBy: 'dormant',
        dormantCommands: [{ action: 'lighting:scene:activate', service: 'lighting', door: 'profile' }],
      }],
      ['all-clear-chime', {
        id: 'all-clear-chime', label: 'All Clear Chime', icon: 'sound',
        triggerType: null, quickFire: true,
        enabled: true, disabledBy: null,
        dormantCommands: [{ action: 'lighting:scene:activate', service: 'lighting', door: 'profile' }],
      }],
      ['heist-sting', {
        id: 'heist-sting', label: 'Heist Sting', icon: 'sound',
        triggerType: null, quickFire: true,
        enabled: true, disabledBy: null, dormantCommands: [],
      }],
      ['standing-lights', {
        id: 'standing-lights', label: 'Standing Lights',
        triggerType: 'event', quickFire: false,
        enabled: false, disabledBy: 'dormant',
        dormantCommands: [{ action: 'lighting:scene:activate', service: 'lighting', door: 'operator' }],
      }],
      ['standing-gm-off', {
        id: 'standing-gm-off', label: 'Standing GM Off',
        triggerType: 'clock', quickFire: false,
        enabled: false, disabledBy: 'gm', dormantCommands: [],
      }],
    ]);

    const renderDormant = () => renderer.render({
      cues: dormantCues(), activeCues: new Map(), disabledCues: new Set(),
    });

    describe('standing cue list', () => {
      it('a dormancy-disabled row is grey and says its door', () => {
        renderDormant();
        const row = standingListEl.querySelector('[data-cue-id="standing-lights"]');
        expect(row.classList.contains('standing-cue-item--dormant')).toBe(true);
        expect(row.textContent).toContain('Out of service');
      });

      it('offers NO Enable button for a dormancy-disabled row', () => {
        // The backend refuses cue:enable on a dormant cue. A button that
        // exists only to be refused is worse than no button.
        renderDormant();
        const row = standingListEl.querySelector('[data-cue-id="standing-lights"]');
        expect(row.querySelector('[data-action="admin.enableCue"]')).toBeNull();
        expect(row.querySelector('[data-action="admin.disableCue"]')).toBeNull();
      });

      it('a GM-disabled row keeps its Enable button', () => {
        renderDormant();
        const row = standingListEl.querySelector('[data-cue-id="standing-gm-off"]');
        expect(row.classList.contains('standing-cue-item--dormant')).toBe(false);
        expect(row.querySelector('[data-action="admin.enableCue"]')).toBeTruthy();
      });

      it('the differential path keeps the dormant row dormant', () => {
        renderDormant();
        renderDormant();
        const row = standingListEl.querySelector('[data-cue-id="standing-lights"]');
        expect(row.classList.contains('standing-cue-item--dormant')).toBe(true);
        expect(row.querySelector('[data-action="admin.enableCue"]')).toBeNull();
      });

      it('re-renders the dormant note when the door flips profile → operator while disabledBy stays "dormant" (PR #17 review)', () => {
        // _updateStandingCues()'s guard (isDisabled !== wasDisabled ||
        // isDormant !== wasDormant) skips the update whenever a row stays
        // dormant across renders, so the door's wording went stale.
        const cues = dormantCues();
        cues.set('standing-lights', {
          ...cues.get('standing-lights'),
          dormantCommands: [{ action: 'lighting:scene:activate', service: 'lighting', door: 'profile' }],
        });
        renderer.render({ cues, activeCues: new Map(), disabledCues: new Set() });
        let row = standingListEl.querySelector('[data-cue-id="standing-lights"]');
        expect(row.textContent).toContain('Not installed tonight');

        const flipped = dormantCues();
        flipped.set('standing-lights', {
          ...flipped.get('standing-lights'),
          dormantCommands: [{ action: 'lighting:scene:activate', service: 'lighting', door: 'operator' }],
        });
        renderer.render({ cues: flipped, activeCues: new Map(), disabledCues: new Set() });

        row = standingListEl.querySelector('[data-cue-id="standing-lights"]');
        expect(row.textContent).toContain('Out of service');
        expect(row.textContent).not.toContain('Not installed tonight');
      });

      it('a row that LEAVES the dormancy set gets its buttons back', () => {
        renderDormant();
        const revived = dormantCues();
        revived.set('standing-lights', {
          ...revived.get('standing-lights'),
          enabled: true, disabledBy: null, dormantCommands: [],
        });
        renderer.render({ cues: revived, activeCues: new Map(), disabledCues: new Set() });

        const row = standingListEl.querySelector('[data-cue-id="standing-lights"]');
        expect(row.classList.contains('standing-cue-item--dormant')).toBe(false);
        expect(row.querySelector('[data-action="admin.disableCue"]')).toBeTruthy();
      });
    });

    describe('quick fire grid', () => {
      it('a disabled tile is really disabled, with the reason in its title', () => {
        renderDormant();
        const tile = gridEl.querySelector('[data-cue-id="vault-alarm-hit"]');
        expect(tile.disabled).toBe(true);
        expect(tile.classList.contains('cue-tile--disabled')).toBe(true);
        expect(tile.getAttribute('title')).toContain('Not installed tonight');
      });

      it('a tile disabled by the GM is also disabled, with its own reason', () => {
        const cues = dormantCues();
        cues.set('heist-sting', {
          ...cues.get('heist-sting'), enabled: false, disabledBy: 'gm',
        });
        renderer.render({ cues, activeCues: new Map(), disabledCues: new Set() });

        const tile = gridEl.querySelector('[data-cue-id="heist-sting"]');
        expect(tile.disabled).toBe(true);
        expect(tile.getAttribute('title')).toContain('Disabled');
      });

      it('a MIXED cue stays enabled and shows a badge counting its skipped commands', () => {
        renderDormant();
        const tile = gridEl.querySelector('[data-cue-id="all-clear-chime"]');
        expect(tile.disabled).toBe(false);
        const badge = tile.querySelector('.cue-tile__badge');
        expect(badge).toBeTruthy();
        expect(badge.textContent.trim()).toBe('1');
        expect(badge.getAttribute('title'))
          .toBe('lighting:scene:activate → lighting (Not installed tonight)');
      });

      it('a wholly live cue gets no badge', () => {
        renderDormant();
        const tile = gridEl.querySelector('[data-cue-id="heist-sting"]');
        expect(tile.querySelector('.cue-tile__badge')).toBeNull();
        expect(tile.disabled).toBe(false);
      });

      it('the grid REBUILDS when the disabled/dormant picture changes', () => {
        // The grid used to be built exactly once, so a cue disabled after
        // the first render still looked tappable.
        renderer.render({
          cues: dormantCues(), activeCues: new Map(), disabledCues: new Set(),
        });
        expect(gridEl.querySelector('[data-cue-id="heist-sting"]').disabled).toBe(false);

        const cues = dormantCues();
        cues.set('heist-sting', { ...cues.get('heist-sting'), enabled: false, disabledBy: 'gm' });
        renderer.render({ cues, activeCues: new Map(), disabledCues: new Set() });

        expect(gridEl.querySelector('[data-cue-id="heist-sting"]').disabled).toBe(true);
      });

      it('the grid REBUILDS when the dormant service/door changes but the skipped-command COUNT stays the same (PR #17 review)', () => {
        // _gridSignatureOf() used to fold only dormantCommands.length, so a
        // MIXED cue whose absent SERVICE changed while the count held
        // steady left the stale service in the badge title.
        renderDormant();
        let tile = gridEl.querySelector('[data-cue-id="all-clear-chime"]');
        expect(tile.querySelector('.cue-tile__badge').getAttribute('title'))
          .toBe('lighting:scene:activate → lighting (Not installed tonight)');

        const changed = dormantCues();
        changed.set('all-clear-chime', {
          ...changed.get('all-clear-chime'),
          dormantCommands: [{ action: 'lighting:scene:activate', service: 'audio', door: 'profile' }],
        });
        renderer.render({ cues: changed, activeCues: new Map(), disabledCues: new Set() });

        tile = gridEl.querySelector('[data-cue-id="all-clear-chime"]');
        expect(tile.querySelector('.cue-tile__badge').getAttribute('title'))
          .toBe('lighting:scene:activate → audio (Not installed tonight)');
      });

      it('the grid REBUILDS when the dormant DOOR changes but the skipped-command COUNT stays the same (PR #17 review)', () => {
        // Same bug, on the door half of the pair: a disabled tile's title
        // text is built from the first dormant command's door, and the
        // count alone does not change when only the door does.
        renderDormant();
        let tile = gridEl.querySelector('[data-cue-id="vault-alarm-hit"]');
        expect(tile.getAttribute('title')).toContain('Not installed tonight');

        const changed = dormantCues();
        changed.set('vault-alarm-hit', {
          ...changed.get('vault-alarm-hit'),
          dormantCommands: [{ action: 'lighting:scene:activate', service: 'lighting', door: 'operator' }],
        });
        renderer.render({ cues: changed, activeCues: new Map(), disabledCues: new Set() });

        tile = gridEl.querySelector('[data-cue-id="vault-alarm-hit"]');
        expect(tile.getAttribute('title')).toContain('Out of service');
        expect(tile.getAttribute('title')).not.toContain('Not installed tonight');
      });

      it('a markup-bearing action name stays INSIDE the badge title attribute', () => {
        // Cue commands are PACK CONTENT (lowest trust tier). The badge
        // title is built from the action name, so a quote in it must not
        // close the attribute. (Asserted on the live DOM, not on
        // innerHTML: the HTML serializer legitimately leaves < and > raw
        // inside an attribute VALUE, so a substring check there would
        // pass on a real escape and fail on a fake one.)
        const cues = dormantCues();
        cues.set('all-clear-chime', {
          ...cues.get('all-clear-chime'),
          dormantCommands: [{ action: '"><img src=x onerror=alert(1)>', service: 'lighting', door: 'profile' }],
        });
        renderer.render({ cues, activeCues: new Map(), disabledCues: new Set() });

        expect(gridEl.querySelector('img')).toBeNull();
        const badge = gridEl.querySelector('[data-cue-id="all-clear-chime"] .cue-tile__badge');
        expect(badge.getAttribute('title'))
          .toBe('"><img src=x onerror=alert(1)> → lighting (Not installed tonight)');
      });
    });
  });
});
