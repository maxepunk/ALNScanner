import { escapeHtml } from '../../utils/escapeHtml.js';

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

    this._gridBuilt = false;
    this._standingEls = null; // { cueId: { item, actionSlot } }
    this._activeEls = null;   // { cueId: { item, stateEl, progressFill, progressText, actionSlot } }
    this._lastActiveIds = null; // sorted comma-joined string for quick comparison
  }

  /**
   * Render all cue views based on state (differential)
   * @param {Object} state - { cues: Map, activeCues: Map, disabledCues: Set }
   * @param {Object|null} prev - Previous state (null on first render)
   */
  render(state, prev = null) {
    if (!state || !state.cues) return;

    // Quick fire: build once (cue definitions don't change during session)
    if (!this._gridBuilt) {
      this._buildQuickFireGrid(state.cues);
      this._gridBuilt = true;
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

  _buildQuickFireGrid(cuesMap) {
    if (!this.gridEl) return;

    const quickFireCues = Array.from(cuesMap.values()).filter(cue => cue.quickFire === true);

    if (quickFireCues.length === 0) {
      this.gridEl.innerHTML = '<p class="empty-state">No Quick Fire cues available</p>';
      return;
    }

    this.gridEl.innerHTML = quickFireCues.map(cue => {
      const icon = cue.icon || 'default';
      const label = cue.label || cue.id;
      return `
        <button
          class="cue-tile cue-tile--${icon}"
          data-action="admin.fireCue"
          data-cue-id="${escapeHtml(cue.id)}"
          title="${escapeHtml(label)}"
        >
          <span class="cue-tile__icon cue-icon--${icon}"></span>
          <span class="cue-tile__label">${escapeHtml(label)}</span>
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
      const isDisabled = disabledCuesSet?.has(cue.id) || cue.enabled === false;
      const statusClass = isDisabled ? 'standing-cue-item--disabled' : 'standing-cue-item--enabled';
      const triggerLabel = cue.triggerType === 'clock' ? '\u23F1 clock' : '\u26A1 event';

      return `
        <div class="standing-cue-item ${statusClass}" data-cue-id="${escapeHtml(cue.id)}">
          <div class="standing-cue-item__info">
            <span class="standing-cue-item__label">${escapeHtml(cue.label || cue.id)}</span>
            <span class="standing-cue-item__trigger">${escapeHtml(triggerLabel)}</span>
          </div>
          <div class="standing-cue-item__actions">
            ${isDisabled ?
          `<button class="btn btn-sm btn-success" data-action="admin.enableCue" data-cue-id="${escapeHtml(cue.id)}">Enable</button>` :
          `<button class="btn btn-sm btn-secondary" data-action="admin.disableCue" data-cue-id="${escapeHtml(cue.id)}">Disable</button>`
        }
          </div>
        </div>
      `;
    }).join('');

    // Cache element references
    this._standingEls = {};
    for (const cue of standingCues) {
      const item = this.standingListEl.querySelector(`[data-cue-id="${cue.id}"]`);
      if (item) {
        this._standingEls[cue.id] = {
          item,
          actionSlot: item.querySelector('.standing-cue-item__actions')
        };
      }
    }
  }

  _updateStandingCues(cuesMap, disabledCuesSet) {
    if (!this._standingEls) return;

    for (const [cueId, els] of Object.entries(this._standingEls)) {
      const cue = cuesMap.get(cueId);
      if (!cue) continue;

      const isDisabled = disabledCuesSet?.has(cueId) || cue.enabled === false;
      const wasDisabled = els.item.classList.contains('standing-cue-item--disabled');

      if (isDisabled !== wasDisabled) {
        els.item.classList.toggle('standing-cue-item--disabled', isDisabled);
        els.item.classList.toggle('standing-cue-item--enabled', !isDisabled);
        els.actionSlot.innerHTML = isDisabled
          ? `<button class="btn btn-sm btn-success" data-action="admin.enableCue" data-cue-id="${escapeHtml(cueId)}">Enable</button>`
          : `<button class="btn btn-sm btn-secondary" data-action="admin.disableCue" data-cue-id="${escapeHtml(cueId)}">Disable</button>`;
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
      const { state, progress, duration } = details || { state: 'running', progress: 0, duration: 0 };
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
              <div class="progress-bar__fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="progress-bar__text">${progressPercent}%</span>
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
      const item = this.activeListEl.querySelector(`[data-cue-id="${cueId}"]`);
      if (item) {
        this._activeEls[cueId] = {
          item,
          stateEl: item.querySelector('.active-cue-item__state'),
          progressFill: item.querySelector('.progress-bar__fill'),
          progressText: item.querySelector('.progress-bar__text'),
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
