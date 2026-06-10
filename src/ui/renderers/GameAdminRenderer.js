/**
 * GameAdminRenderer - Game Admin Domain Renderer
 *
 * Owns: session status display for standalone admin panel.
 *
 * Extracted from UIManager as part of the Phase-2 four-domain structural
 * split (decision C1). UIManager delegates to this renderer; all existing
 * UIManager callers continue to work unchanged.
 *
 * @module ui/renderers/GameAdminRenderer
 */

import { escapeHtml } from '../../utils/escapeHtml.js';
import { formatDuration } from '../../utils/formatDuration.js';

export class GameAdminRenderer {
  /**
   * @param {Object} deps - Injected dependencies
   * @param {Object} deps.dataManager - UnifiedDataManager instance
   */
  constructor({ dataManager } = {}) {
    this.dataManager = dataManager;
  }

  /**
   * Render session status display (mode-agnostic).
   * Used by standalone mode admin panel.
   * @param {HTMLElement} container - Container element
   */
  renderSessionStatus(container) {
    if (!container) return;

    const session = this.dataManager?.getCurrentSession?.();

    if (!session) {
      container.innerHTML = `
        <div class="session-status session-status--empty">
          <p class="session-status__message">No Active Session</p>
          <p class="session-status__hint">Create a new session to begin tracking gameplay</p>
          <button class="btn btn-primary" data-action="app.adminCreateSession">
            Create New Session
          </button>
        </div>
      `;
      return;
    }

    const startTime = session.startTime ? new Date(session.startTime) : null;
    const duration = startTime ? formatDuration(Date.now() - startTime.getTime(), { fallback: '0m' }) : '—';

    if (session.status === 'paused') {
      container.innerHTML = `
        <div class="session-status session-status--paused">
          <h4 class="session-status__header">
            <span class="session-status__icon">⏸️</span>
            <span>${escapeHtml(session.name || 'Session')}</span>
            <span class="session-status__badge session-status__badge--paused">Paused</span>
          </h4>
          <div class="session-status__details">
            <span>Started: ${startTime ? startTime.toLocaleTimeString() : '—'}</span>
            <span>Duration: ${duration}</span>
          </div>
          <div class="session-status__actions">
            <button class="btn btn-primary" data-action="app.adminResumeSession">
              Resume Session
            </button>
            <button class="btn btn-danger" data-action="app.adminEndSession">
              End Session
            </button>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="session-status session-status--active">
        <h4 class="session-status__header">
          <span class="session-status__icon">🎮</span>
          <span>${escapeHtml(session.name || 'Session')}</span>
          <span class="session-status__badge session-status__badge--active">Active</span>
        </h4>
        <div class="session-status__details">
          <span>Started: ${startTime ? startTime.toLocaleTimeString() : '—'}</span>
          <span>Duration: ${duration}</span>
        </div>
        <div class="session-status__actions">
          <button class="btn btn-secondary" data-action="app.adminPauseSession">
            Pause Session
          </button>
          <button class="btn btn-danger" data-action="app.adminEndSession">
            End Session
          </button>
        </div>
      </div>
    `;
  }
}
