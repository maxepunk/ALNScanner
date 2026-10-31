import { escapeHtml } from '../../utils/escapeHtml.js';
import { escapeCssAttrValue } from '../../utils/escapeCssAttrValue.js';
import { slugifyId } from '../../utils/slugify.js';
import { doorWording } from './dormancyWording.js';

/**
 * CueRenderer - Differential DOM Rendering for Cue System
 *
 * Three zones: Quick Fire Grid, Standing Cues List, Active Cues List.
 * Quick fire grid and standing cues are built once (cue definitions are static).
 * Standing cue enable/disable toggles differentially.
 * Active cues rebuild when the set of active IDs changes, update progress in-place.
 */

export class CueRenderer {
  /**
   * @param {Object} elements - DOM elements map
   * @param {HTMLElement} [elements.quickFireGrid]
   * @param {HTMLElement} [elements.standingCuesList]
   * @param {HTMLElement} [elements.activeCuesList]
   */
  constructor(elements = {}) {
    this.gridEl = elements.quickFireGrid || document.getElementById('quick-fire-grid');
    this.standingListEl = elements.standingCuesList || document.getElementById('standing-cues-list');
    this.activeListEl = elements.activeCuesList || document.getElementById('active-cues-list');

    // Was a boolean "built once": a cue disabled AFTER the first render
    // still rendered as a normal, tappable tile (T1a D13). The grid is now
    // keyed on the disabled/dormant picture and rebuilds when it changes.
    this._gridSignature = null;
    this._standingEls = null; // { cueId: { item, actionSlot } }
    this._activeEls = null;   // { cueId: { item, stateEl, progressFill, progressText, actionSlot } }
    this._lastActiveIds = null; // sorted comma-joined string for quick comparison
  }

  /**
   * Render all cue views based on state (differential)
   * @param {Object} state - { cues: Map, activeCues: Map, disabledCues: Set }
   * @param {Object|null} prev - Previous state (null on first render)
   */
  render(state, _prev = null) {
    if (!state || !state.cues) return;

    // Quick fire: rebuild when the disabled/dormant picture changes
    const signature = CueRenderer._gridSignatureOf(state.cues);
    if (signature !== this._gridSignature) {
      this._buildQuickFireGrid(state.cues);
      this._gridSignature = signature;
    }

    // Standing cues: build once, then toggle enable/disable
    if (!this._standingEls) {
      this._buildStandingCues(state.cues, state.disabledCues);
    } else {
      this._updateStandingCues(state.cues, state.disabledCues);
    }

    // Active cues: rebuild if set changes, update progress if same set
    this._renderActiveCues(state.cues, state.activeCues);
  }

  // ─── Quick Fire Grid (build once) ──────────────────────────────

  /**
   * Everything about a cue that changes how its TILE looks. The grid is
   * rebuilt when this changes and not otherwise.
   * @private
   */
  static _gridSignatureOf(cuesMap) {
    return Array.from(cuesMap.values())
      .filter(cue => cue.quickFire === true)
      .map(cue => {
        // The count alone is not enough (PR #17 review): a MIXED cue whose
        // absent service/door changes while the skipped-command COUNT holds
        // steady must still rebuild — the badge title and the disabled-tile
        // reason text are both built from the FIRST dormant command.
        const [first] = cue.dormantCommands || [];
        return `${cue.id}:${cue.enabled === false ? 1 : 0}:${cue.disabledBy || ''}:`
          + `${(cue.dormantCommands || []).length}:${first?.service || ''}:${first?.door || ''}`;
      })
      .join('|');
  }

  /**
   * Why this cue cannot fire right now, in the GM's words, or null.
   * @private
   */
  static _disabledReason(cue) {
    if (cue.enabled !== false) return null;
    if (cue.disabledBy === 'dormant') {
      const [first] = cue.dormantCommands || [];
      return first
        ? `${doorWording(first.door)} (${first.service})`
        : 'Dormant';
    }
    if (cue.disabledBy === 'once') return 'Already fired (once cue)';
    return 'Disabled';
  }

  _buildQuickFireGrid(cuesMap) {
    if (!this.gridEl) return;

    const quickFireCues = Array.from(cuesMap.values()).filter(cue => cue.quickFire === true);

    if (quickFireCues.length === 0) {
      this.gridEl.innerHTML = '<p class="empty-state">No Quick Fire cues available</p>';
      return;
    }

    this.gridEl.innerHTML = quickFireCues.map(cue => {
      // Cues are PACK CONTENT (lowest trust tier) — every class-name
      // interpolation of pack data goes through slugifyId, never raw
      // (train-review MAJOR 7 / LC-1: a markup-bearing icon broke out
      // of the class attribute and ran in the operator-JWT origin).
      const icon = slugifyId(cue.icon) || 'default';
      const label = cue.label || cue.id;
      const reason = CueRenderer._disabledReason(cue);
      // T1a D13 (P3): a MIXED cue still fires — the badge is the warning
      // that part of it will be silent, so the GM is not left wondering
      // why the lighting hit did not land.
      const dormantCmds = cue.dormantCommands || [];
      const badgeTitle = dormantCmds
        .map(c => `${c.action} → ${c.service} (${doorWording(c.door)})`)
        .join('; ');
      return `
        <button
          class="cue-tile cue-tile--${icon}${reason ? ' cue-tile--disabled' : ''}"
          data-action="admin.fireCue"
          data-cue-id="${escapeHtml(cue.id)}"
          title="${escapeHtml(reason ? `${label} — ${reason}` : label)}"
          ${reason ? 'disabled' : ''}
        >
          <span class="cue-tile__icon cue-icon--${icon}"></span>
          <span class="cue-tile__label">${escapeHtml(label)}</span>
          ${dormantCmds.length > 0
    ? `<span class="cue-tile__badge" title="${escapeHtml(badgeTitle)}">${dormantCmds.length}</span>`
    : ''}
        </button>
      `;
    }).join('');
  }

  // ─── Standing Cues (build once, toggle enable/disable) ─────────

  _buildStandingCues(cuesMap, disabledCuesSet) {
    if (!this.standingListEl) return;

    const standingCues = Array.from(cuesMap.values()).filter(cue => cue.triggerType && !cue.quickFire);

    if (standingCues.length === 0) {
      this.standingListEl.innerHTML = '<p class="empty-state">No standing cues configured</p>';
      this._standingEls = {};
      return;
    }

    this.standingListEl.innerHTML = standingCues.map(cue => {
      const isDormant = cue.disabledBy === 'dormant';
      const isDisabled = isDormant
        || disabledCuesSet?.has(cue.id) || cue.enabled === false;
      const statusClass = isDormant
        ? 'standing-cue-item--dormant'
        : (isDisabled ? 'standing-cue-item--disabled' : 'standing-cue-item--enabled');
      const triggerLabel = cue.triggerType === 'clock' ? '\u23F1 clock' : '\u26A1 event';

      return `
        <div class="standing-cue-item ${statusClass}" data-cue-id="${escapeHtml(cue.id)}">
          <div class="standing-cue-item__info">
            <span class="standing-cue-item__label">${escapeHtml(cue.label || cue.id)}</span>
            <span class="standing-cue-item__trigger">${escapeHtml(triggerLabel)}</span>
          </div>
          <div class="standing-cue-item__actions">
            ${CueRenderer._standingActions(cue, isDormant, isDisabled)}
          </div>
        </div>
      `;
    }).join('');

    // Cache element references
    this._standingEls = {};
    for (const cue of standingCues) {
      const item = this.standingListEl.querySelector(`[data-cue-id="${escapeCssAttrValue(cue.id)}"]`);
      if (item) {
        this._standingEls[cue.id] = {
          item,
          actionSlot: item.querySelector('.standing-cue-item__actions'),
          dormantSig: CueRenderer._dormantNoteSignature(cue)
        };
      }
    }
  }

  /**
   * Everything the DORMANT-NOTE half of `_standingActions()` reads: which
   * door disabled it and (for completeness) which service. Folded into
   * `_updateStandingCues()`'s rebuild guard so a door change (e.g.
   * `profile` → `operator`) re-renders the note even though `disabledBy`
   * stays `'dormant'` across both renders (PR #17 review).
   * @private
   */
  static _dormantNoteSignature(cue) {
    const [first] = cue.dormantCommands || [];
    return `${cue.disabledBy || ''}:${first?.door || ''}:${first?.service || ''}`;
  }

  /**
   * The buttons a standing row offers. A DORMANCY-disabled row offers none:
   * the backend refuses cue:enable on it (T1a D5/P4), and a button whose
   * only outcome is a refusal is worse than no button. It shows the door's
   * wording instead, so the GM knows why and that it is not theirs to fix.
   * @private
   */
  static _standingActions(cue, isDormant, isDisabled) {
    if (isDormant) {
      const [first] = cue.dormantCommands || [];
      return `<span class="standing-cue-item__dormant-note">${escapeHtml(doorWording(first?.door))}</span>`;
    }
    const id = escapeHtml(cue.id);
    return isDisabled
      ? `<button class="btn btn-sm btn-success" data-action="admin.enableCue" data-cue-id="${id}">Enable</button>`
      : `<button class="btn btn-sm btn-secondary" data-action="admin.disableCue" data-cue-id="${id}">Disable</button>`;
  }

  _updateStandingCues(cuesMap, disabledCuesSet) {
    if (!this._standingEls) return;

    for (const [cueId, els] of Object.entries(this._standingEls)) {
      const cue = cuesMap.get(cueId);
      if (!cue) continue;

      const isDormant = cue.disabledBy === 'dormant';
      const isDisabled = isDormant
        || disabledCuesSet?.has(cueId) || cue.enabled === false;
      const wasDormant = els.item.classList.contains('standing-cue-item--dormant');
      const wasDisabled = wasDormant
        || els.item.classList.contains('standing-cue-item--disabled');
      const dormantSig = CueRenderer._dormantNoteSignature(cue);
      const dormantSigChanged = dormantSig !== els.dormantSig;

      if (isDisabled !== wasDisabled || isDormant !== wasDormant || dormantSigChanged) {
        els.item.classList.toggle('standing-cue-item--dormant', isDormant);
        els.item.classList.toggle('standing-cue-item--disabled', isDisabled && !isDormant);
        els.item.classList.toggle('standing-cue-item--enabled', !isDisabled);
        els.actionSlot.innerHTML = CueRenderer._standingActions(cue, isDormant, isDisabled);
        els.dormantSig = dormantSig;
      }
    }
  }

  // ─── Active Cues (rebuild on set change, update progress in-place) ──

  _renderActiveCues(cuesMap, activeCuesMap) {
    if (!this.activeListEl) return;

    const entries = activeCuesMap instanceof Map ? Array.from(activeCuesMap.entries()) : [];
    const activeIds = entries.map(([id]) => id).sort().join(',');

    if (entries.length === 0) {
      if (this._lastActiveIds !== '') {
        this.activeListEl.innerHTML = '<p class="empty-state">No active cues</p>';
        this._activeEls = {};
        this._lastActiveIds = '';
      }
      return;
    }

    // If the set of active cue IDs changed, rebuild entire list
    if (activeIds !== this._lastActiveIds) {
      this._buildActiveCues(cuesMap, entries);
      this._lastActiveIds = activeIds;
      return;
    }

    // Same cue IDs — update progress and state in-place
    this._updateActiveCues(entries);
  }

  _buildActiveCues(cuesMap, entries) {
    this.activeListEl.innerHTML = entries.map(([cueId, details]) => {
      const { state, progress } = details || { state: 'running', progress: 0 };
      const progressPercent = Math.round((progress || 0) * 100);
      const isPaused = state === 'paused';
      const cueDef = cuesMap.get(cueId);
      const cueLabel = cueDef ? (cueDef.label || cueDef.name || cueId) : cueId;

      return `
        <div class="active-cue-item" data-cue-id="${escapeHtml(cueId)}">
          <div class="active-cue-item__header">
            <span class="active-cue-item__label">${escapeHtml(cueLabel)}</span>
            <span class="active-cue-item__state ${isPaused ? 'state-paused' : 'state-running'}">
              ${isPaused ? 'Paused' : 'Running'}
            </span>
          </div>
          <div class="active-cue-item__progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="progress-text">${progressPercent}%</span>
          </div>
          <div class="active-cue-item__actions">
            ${isPaused ?
          `<button class="btn btn-sm btn-primary" data-action="admin.resumeCue" data-cue-id="${escapeHtml(cueId)}">Resume</button>` :
          `<button class="btn btn-sm btn-secondary" data-action="admin.pauseCue" data-cue-id="${escapeHtml(cueId)}">Pause</button>`
        }
            <button class="btn btn-sm btn-danger" data-action="admin.stopCue" data-cue-id="${escapeHtml(cueId)}">Stop</button>
          </div>
        </div>
      `;
    }).join('');

    // Cache element references
    this._activeEls = {};
    for (const [cueId] of entries) {
      const item = this.activeListEl.querySelector(`[data-cue-id="${escapeCssAttrValue(cueId)}"]`);
      if (item) {
        this._activeEls[cueId] = {
          item,
          stateEl: item.querySelector('.active-cue-item__state'),
          progressFill: item.querySelector('.progress-fill'),
          progressText: item.querySelector('.progress-text'),
          actionSlot: item.querySelector('.active-cue-item__actions')
        };
      }
    }
  }

  _updateActiveCues(entries) {
    for (const [cueId, details] of entries) {
      const els = this._activeEls?.[cueId];
      if (!els) continue;

      const { state, progress } = details || {};
      const progressPercent = Math.round((progress || 0) * 100);
      const isPaused = state === 'paused';

      // Update progress
      els.progressFill.style.width = `${progressPercent}%`;
      els.progressText.textContent = `${progressPercent}%`;

      // Update state if changed
      const wasPaused = els.stateEl.classList.contains('state-paused');
      if (isPaused !== wasPaused) {
        els.stateEl.className = `active-cue-item__state ${isPaused ? 'state-paused' : 'state-running'}`;
        els.stateEl.textContent = isPaused ? 'Paused' : 'Running';
        els.actionSlot.innerHTML = `
          ${isPaused
            ? `<button class="btn btn-sm btn-primary" data-action="admin.resumeCue" data-cue-id="${escapeHtml(cueId)}">Resume</button>`
            : `<button class="btn btn-sm btn-secondary" data-action="admin.pauseCue" data-cue-id="${escapeHtml(cueId)}">Pause</button>`
          }
          <button class="btn btn-sm btn-danger" data-action="admin.stopCue" data-cue-id="${escapeHtml(cueId)}">Stop</button>
        `;
      }
    }
  }

}
