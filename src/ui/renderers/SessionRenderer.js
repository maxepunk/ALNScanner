/**
 * SessionRenderer - Differential DOM Rendering for Session State
 *
 * Renders session status, controls, and game clock.
 * Template swap on viewState change (no-session/setup/active/paused/ended).
 * Within same viewState: targeted updates to name, badge, clock.
 * Game clock uses client-side setInterval ticking between server broadcasts.
 *
 * @module ui/renderers/SessionRenderer
 */

export class SessionRenderer {
  /**
   * @param {Object} elements - DOM elements map (for DI/testing)
   * @param {HTMLElement} [elements.container]
   */
  constructor(elements = {}) {
    this.container = elements.container || document.getElementById('session-status-container');
    this._viewState = null;    // 'no-session' | 'setup' | 'active' | 'paused' | 'ended'
    this._els = null;          // { nameEl, statusEl }
    this._clockTimer = null;
    this._lastElapsed = null;
    this._clockState = null;
  }

  /**
   * Render session state (differential)
   * @param {Object} sessionState - { name, status, startTime, endTime, teams }
   * @param {Object|null} prev - Previous session state
   */
  render(sessionState, prev = null) {
    if (!this.container) return;

    const viewState = sessionState?.status || 'no-session';

    // Template swap on viewState change
    if (viewState !== this._viewState) {
      this.container.innerHTML = this._getTemplate(viewState, sessionState);
      this._viewState = viewState;
      this._cacheElements();

      // Restore cached clock state after template swap.
      // gameclock:status may arrive before session:update, so the clock
      // display gets wiped by the template swap. Re-apply cached value.
      if (this._lastElapsed !== null && this._clockState !== null) {
        this.renderGameClock({ state: this._clockState, elapsed: this._lastElapsed });
      }
      return;
    }

    // Same viewState — differential updates
    this._updateDynamic(sessionState, prev);
  }

  _cacheElements() {
    this._els = {
      nameEl: this.container.querySelector('#session-name'),
      statusEl: this.container.querySelector('#session-status-badge'),
    };
  }

  _updateDynamic(sessionState, prev) {
    if (!sessionState?.status || !this._els) return;

    // Session name
    if (sessionState.name !== prev?.name && this._els.nameEl) {
      this._els.nameEl.textContent = sessionState.name || 'Untitled Session';
    }

    // Status badge
    if (sessionState.status !== prev?.status && this._els.statusEl) {
      this._updateStatusBadge(sessionState.status);
    }
  }

  _updateStatusBadge(status) {
    const el = this._els.statusEl;
    if (!el) return;

    switch (status) {
      case 'active':
        el.textContent = 'Active';
        el.className = 'badge badge-success';
        break;
      case 'paused':
        el.textContent = 'Paused';
        el.className = 'badge badge-warning';
        break;
      case 'ended':
        el.textContent = 'Ended';
        el.className = 'badge badge-danger';
        break;
      case 'setup':
        el.textContent = 'Setup';
        el.className = 'badge';
        break;
      default:
        el.textContent = status || 'Offline';
        el.className = 'badge';
    }
  }

  /**
   * Render Game Clock with client-side ticking (differential).
   * Backend broadcasts gameclock:status on start/pause/resume (not every tick).
   * A local setInterval increments the display each second while running.
   * @param {Object} clockState - { state, elapsed }
   * @param {Object|null} prev - Previous clock state
   */
  renderGameClock(clockState, prev = null) {
    const { state, elapsed } = clockState;

    // Skip if nothing changed
    if (prev && state === prev.state && elapsed === prev.elapsed) return;

    // Always clear existing timer first (prevents duplicates)
    this._stopClockTimer();

    // Cache state for template swap restoration (may be called before DOM is ready,
    // e.g. store subscription fires before session template renders on sync:full)
    this._lastElapsed = elapsed;
    this._clockState = state;

    // Always use getElementById — clock element may exist outside the cached container
    // scope (e.g., created by template swap or present as standalone element)
    const display = document.getElementById('game-clock-display');
    if (!display) return;

    // Update display immediately with received value (syncs to backend)
    display.textContent = this._formatClockTime(this._lastElapsed);

    // Update styling
    display.classList.remove('clock-running', 'clock-paused', 'clock-stopped');
    display.classList.add(`clock-${state}`);

    // If running, start client-side timer to increment every second
    if (state === 'running') {
      this._clockTimer = setInterval(() => {
        this._lastElapsed++;
        const el = document.getElementById('game-clock-display');
        if (el) {
          el.textContent = this._formatClockTime(this._lastElapsed);
        }
      }, 1000);
    }
  }

  /**
   * Render Overtime Warning
   * @param {Object} overtimeData - { overtimeDuration }
   */
  renderOvertime(overtimeData) {
    const container = document.getElementById('session-overtime-container');
    const text = document.getElementById('session-overtime-text');

    if (!container || !text) return;

    if (overtimeData && overtimeData.overtimeDuration > 0) {
      container.style.display = 'block';
      text.textContent = `+${Math.round(overtimeData.overtimeDuration)}m`;
    } else {
      container.style.display = 'none';
    }
  }

  _stopClockTimer() {
    if (this._clockTimer) {
      clearInterval(this._clockTimer);
      this._clockTimer = null;
    }
  }

  _formatClockTime(seconds) {
    if (seconds === undefined || seconds === null) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  _getTemplate(viewState, session) {
    const sessionName = session?.name || 'New Session';

    if (viewState === 'no-session') {
      return `
        <div class="session-status session-status--empty">
          <div class="session-info">
            <h4>No Active Session</h4>
            <p>Create a session to start tracking games.</p>
          </div>
          <div class="session-controls">
            <button class="btn btn-primary" data-action="app.adminCreateSession">
              Create New Session
            </button>
          </div>
        </div>
      `;
    }

    if (viewState === 'setup') {
      return `
        <div class="session-status session-status--setup">
          <div class="session-header">
            <h4 id="session-name">${sessionName}</h4>
            <span id="session-status-badge" class="badge">Setup</span>
          </div>
          <div class="session-body">
            <div id="game-clock-container" class="clock-container">
              <span id="game-clock-display" class="clock-display">00:00</span>
            </div>
          </div>
          <div class="session-controls">
            <button class="btn btn-success" data-action="admin.startGame">Start Game</button>
            <button class="btn btn-danger" data-action="app.adminEndSession">End Session</button>
          </div>
        </div>
      `;
    }

    if (viewState === 'active') {
      return `
        <div class="session-status session-status--active">
          <div class="session-header">
            <h4 id="session-name">${sessionName}</h4>
            <span id="session-status-badge" class="badge badge-success">Active</span>
          </div>
          <div class="session-body">
            <div id="game-clock-container" class="clock-container">
              <span id="game-clock-display" class="clock-display">--:--</span>
            </div>
            <div id="session-overtime-container" style="display:none; color: #ffc107; font-weight: bold; margin-top: 5px;">
              Overtime: <span id="session-overtime-text"></span>
            </div>
          </div>
          <div class="session-controls">
            <button class="btn btn-warning" data-action="app.adminPauseSession">Pause</button>
            <button class="btn btn-danger" data-action="app.adminEndSession">End Session</button>
          </div>
        </div>
      `;
    }

    if (viewState === 'paused') {
      return `
        <div class="session-status session-status--paused">
          <div class="session-header">
            <h4 id="session-name">${sessionName}</h4>
            <span id="session-status-badge" class="badge badge-warning">Paused</span>
          </div>
          <div class="session-body">
            <div id="game-clock-container" class="clock-container">
              <span id="game-clock-display" class="clock-display">--:--</span>
            </div>
          </div>
          <div class="session-controls">
            <button class="btn btn-success" data-action="app.adminResumeSession">Resume</button>
            <button class="btn btn-danger" data-action="app.adminEndSession">End Session</button>
          </div>
        </div>
      `;
    }

    if (viewState === 'ended') {
      return `
        <div class="session-status session-status--ended">
          <div class="session-header">
            <h4 id="session-name">${sessionName}</h4>
            <span id="session-status-badge" class="badge badge-danger">Ended</span>
          </div>
          <div class="session-body">
            <p>Session completed.</p>
          </div>
          <div class="session-controls">
            <button class="btn btn-secondary" data-action="app.downloadSessionReport">
              Download Report
            </button>
            <button class="btn btn-primary" data-action="app.adminResetAndCreateNew">
              Reset & New Session
            </button>
          </div>
        </div>
      `;
    }

    return `<div>Unknown State: ${viewState}</div>`;
  }

  destroy() {
    this._stopClockTimer();
  }
}
