/**
 * SessionRenderer
 * Handles rendering of session status, team lists, and game clock.
 *
 * @module ui/renderers/SessionRenderer
 */

export class SessionRenderer {
    constructor() {
        this.container = document.getElementById('session-status-container');
        this.lastStatus = null;
    }

    /**
     * Render session state
     * @param {Object} sessionState - { name, status, startTime, endTime, teams }
     */
    render(sessionState) {
        if (!this.container) return;

        // Determine generalized state for template selection
        // 'no-session' | 'setup' | 'active' | 'paused' | 'ended'
        let viewState = 'no-session';
        if (sessionState) {
            viewState = sessionState.status || 'setup';
        }

        // Only re-render DOM structure if state type changed
        if (this.lastStatus !== viewState) {
            this.container.innerHTML = this._getTemplate(viewState, sessionState);
            this.lastStatus = viewState;
        }

        // Update dynamic values (Name, Time, etc.)
        // We query strictly here to ensure we get the fresh elements
        const nameEl = document.getElementById('session-name');
        const statusEl = document.getElementById('session-status-badge');

        if (sessionState) {
            if (nameEl) nameEl.textContent = sessionState.name || 'Untitled Session';

            if (statusEl) {
                if (sessionState.status === 'active') {
                    statusEl.textContent = 'Active';
                    statusEl.className = 'badge badge-success';
                } else if (sessionState.status === 'paused') {
                    statusEl.textContent = 'Paused';
                    statusEl.className = 'badge badge-warning';
                } else if (sessionState.status === 'ended') {
                    statusEl.textContent = 'Ended';
                    statusEl.className = 'badge badge-danger';
                } else {
                    statusEl.textContent = sessionState.status || 'Offline';
                    statusEl.className = 'badge';
                }
            }
        }
    }

    /**
     * Render Game Clock
     * @param {Object} clockState - { state, elapsed }
     */
    renderGameClock(clockState) {
        const display = document.getElementById('game-clock-display');
        if (!display) return;

        const { state, elapsed } = clockState;
        const formattedTime = this._formatClockTime(elapsed);

        display.textContent = formattedTime;

        // Update styling
        display.classList.remove('clock-running', 'clock-paused', 'clock-stopped');
        display.classList.add(`clock-${state}`);
    }

    /**
     * Render Overtime Warning
     * @param {Object} overtimeData - { actualDuration, expectedDuration }
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

    _formatClockTime(seconds) {
        if (seconds === undefined || seconds === null) return '--:--';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    /**
     * Get HTML Template based on state
     */
    _getTemplate(viewState, session) {
        const sessionName = session?.name || 'New Session';

        // 1. No Session
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

        // 2. Setup (Created but not started)
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

        // 3. Active / Running
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

        // 4. Paused
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

        // 5. Ended
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
}
