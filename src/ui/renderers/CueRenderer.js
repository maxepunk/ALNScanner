/**
 * CueRenderer - DOM Rendering for Cue System
 * Handles Quick Fire Grid, Standing Cues List, and Active Cues List
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
  }

  /**
   * Render all cue views based on state
   * @param {Object} state - { cues: Map, activeCues: Set, disabledCues: Set }
   */
  render(state) {
    if (!state || !state.cues) return;

    this._renderQuickFireGrid(state.cues);
    this._renderStandingCuesList(state.cues, state.disabledCues);
    this._renderActiveCues(state.cues, state.activeCues);
  }

  /**
   * Render Quick Fire grid
   * @param {Map} cuesMap
   * @private
   */
  _renderQuickFireGrid(cuesMap) {
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
          data-cue-id="${this._escapeHtml(cue.id)}"
          title="${this._escapeHtml(label)}"
        >
          <span class="cue-tile__icon cue-icon--${icon}"></span>
          <span class="cue-tile__label">${this._escapeHtml(label)}</span>
        </button>
      `;
    }).join('');
  }

  /**
   * Render Standing Cues list
   * @param {Map} cuesMap
   * @param {Set} disabledCuesSet
   * @private
   */
  _renderStandingCuesList(cuesMap, disabledCuesSet) {
    if (!this.standingListEl) return;

    const standingCues = Array.from(cuesMap.values()).filter(cue => cue.triggerType && !cue.quickFire);

    if (standingCues.length === 0) {
      this.standingListEl.innerHTML = '<p class="empty-state">No standing cues configured</p>';
      return;
    }

    this.standingListEl.innerHTML = standingCues.map(cue => {
      const isDisabled = disabledCuesSet.has(cue.id) || cue.enabled === false;
      const statusClass = isDisabled ? 'standing-cue-item--disabled' : 'standing-cue-item--enabled';
      const triggerLabel = cue.triggerType === 'clock' ? '\u23F1 clock' : '\u26A1 event';

      return `
        <div class="standing-cue-item ${statusClass}">
          <div class="standing-cue-item__info">
            <span class="standing-cue-item__label">${this._escapeHtml(cue.label || cue.id)}</span>
            <span class="standing-cue-item__trigger">${this._escapeHtml(triggerLabel)}</span>
          </div>
          <div class="standing-cue-item__actions">
            ${isDisabled ?
          `<button class="btn btn-sm btn-success" data-action="admin.enableCue" data-cue-id="${this._escapeHtml(cue.id)}">Enable</button>` :
          `<button class="btn btn-sm btn-secondary" data-action="admin.disableCue" data-cue-id="${this._escapeHtml(cue.id)}">Disable</button>`
        }
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render Active Cues list
   * @param {Map} cuesMap
   * @param {Map} activeCuesMap
   */
  _renderActiveCues(cuesMap, activeCuesMap) {
    if (!this.activeListEl) return;

    const entries = activeCuesMap instanceof Map ? Array.from(activeCuesMap.entries()) : [];

    if (entries.length === 0) {
      this.activeListEl.innerHTML = '<p class="empty-state">No active cues</p>';
      return;
    }

    this.activeListEl.innerHTML = entries.map(([cueId, details]) => {
      const { state, progress, duration } = details || { state: 'running', progress: 0, duration: 0 };
      const progressPercent = Math.round(progress * 100); // Assuming progress 0-1
      const isPaused = state === 'paused';

      const cueDef = cuesMap.get(cueId);
      const cueLabel = cueDef ? (cueDef.label || cueDef.name || cueId) : cueId;

      return `
        <div class="active-cue-item" data-cue-id="${this._escapeHtml(cueId)}">
          <div class="active-cue-item__header">
            <span class="active-cue-item__label">${this._escapeHtml(cueLabel)}</span>
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
          `<button class="btn btn-sm btn-primary" data-action="admin.resumeCue" data-cue-id="${this._escapeHtml(cueId)}">Resume</button>` :
          `<button class="btn btn-sm btn-secondary" data-action="admin.pauseCue" data-cue-id="${this._escapeHtml(cueId)}">Pause</button>`
        }
            <button class="btn btn-sm btn-danger" data-action="admin.stopCue" data-cue-id="${this._escapeHtml(cueId)}">Stop</button>
          </div>
        </div>
      `;
    }).join('');
  }

  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Render conflict banner (Phase 2)
   * @param {Object} payload - {cueId, reason, currentVideo, autoCancelMs}
   */
  renderConflict(payload) {
    const { cueId, reason, currentVideo, autoCancelMs = 10000 } = payload;

    // Use a dedicated container, or fall back to body/toast if needed
    let container = document.getElementById('cue-conflict-container');
    if (!container) {
      console.warn('[CueRenderer] No conflict container found');
      return;
    }

    container.innerHTML = `
          <div class="cue-conflict-banner" data-cue-id="${this._escapeHtml(cueId)}">
            <div class="cue-conflict-banner__info">
              <span class="cue-conflict-banner__icon">⚠️</span>
              <div class="cue-conflict-banner__text">
                <strong>Video Conflict</strong>
                <p>Cue wants to play video, but "${this._escapeHtml(currentVideo || 'a video')}" is playing.</p>
              </div>
            </div>
            <div class="cue-conflict-banner__actions">
              <button class="btn btn-sm btn-warning" data-action="admin.resolveConflictCue" data-decision="override" data-cue-id="${this._escapeHtml(cueId)}">Override</button>
              <button class="btn btn-sm btn-secondary" data-action="admin.resolveConflictCue" data-decision="cancel" data-cue-id="${this._escapeHtml(cueId)}">Cancel</button>
            </div>
            <div class="cue-conflict-banner__timer" style="animation-duration: ${autoCancelMs}ms"></div>
          </div>
        `;

    // Auto-dismiss logic should technically be handled by the component or controller, 
    // but for a simple renderer, we can leave it to the CSS animation or the backend auto-cancel event.
    // However, if we want to remove the element from DOM after timeout, we need logic.
    // Backend sends 'cue:conflict:resolved' maybe? 
    // Phase 2 plan kept it simple. We'll assume the banner stays until resolved or replaced.

    // Actually, MonitoringDisplay had: auto-dismisses after autoCancelMs.
    // I should replicate that if possible, or rely on next update.
    setTimeout(() => {
      const banner = container.querySelector(`.cue-conflict-banner[data-cue-id="${cueId}"]`);
      if (banner) banner.remove();
    }, autoCancelMs);
  }
}

export default CueRenderer;
