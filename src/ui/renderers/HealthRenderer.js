import { escapeHtml } from '../../utils/escapeHtml.js';

/**
 * HealthRenderer - Centralized Service Health Dashboard
 * Phase 4: Replaces SystemMonitor + scattered health indicators
 *
 * Collapsed when all healthy, expanded grid when any service is down.
 */
export class HealthRenderer {
  constructor(elements = {}) {
    this.container = elements.container || document.getElementById('health-dashboard');
    this.SERVICE_NAMES = {
      vlc: 'VLC Player',
      spotify: 'Spotify',
      lighting: 'Lighting (HA)',
      bluetooth: 'Bluetooth',
      audio: 'Audio Routing',
      sound: 'Sound Effects',
      gameclock: 'Game Clock',
      cueengine: 'Cue Engine'
    };
  }

  /**
   * Render health dashboard
   * @param {Object} data - { serviceHealth: { serviceId: { status, message } } }
   */
  render(data) {
    if (!this.container) return;

    const health = data?.serviceHealth || {};
    const services = Object.keys(this.SERVICE_NAMES);
    const statuses = services.map(id => ({
      id,
      name: this.SERVICE_NAMES[id],
      status: health[id]?.status || 'unknown',
      message: health[id]?.message || ''
    }));

    const healthyCount = statuses.filter(s => s.status === 'healthy').length;
    const totalCount = services.length;
    const allHealthy = healthyCount === totalCount;

    if (allHealthy) {
      this._renderCollapsed(healthyCount, totalCount);
    } else {
      this._renderExpanded(statuses, healthyCount, totalCount);
    }
  }

  _renderCollapsed(healthy, total) {
    this.container.innerHTML = `
      <div class="health-dashboard health-dashboard--ok">
        <div class="health-dashboard__summary">
          <span class="health-indicator health-indicator--ok"></span>
          All Systems Operational (${healthy}/${total})
        </div>
      </div>
    `;
  }

  _renderExpanded(statuses, healthy, total) {
    const serviceCards = statuses.map(s => {
      const isDown = s.status !== 'healthy';
      return `
        <div class="health-service ${isDown ? 'health-service--down' : 'health-service--ok'}">
          <div class="health-service__name">${escapeHtml(s.name)}</div>
          <div class="health-service__status">${s.status}</div>
          ${s.message ? `<div class="health-service__message">${escapeHtml(s.message)}</div>` : ''}
          ${isDown ? `<button class="btn btn-sm" data-action="admin.serviceCheck" data-service-id="${s.id}">Check Now</button>` : ''}
        </div>
      `;
    }).join('');

    this.container.innerHTML = `
      <div class="health-dashboard health-dashboard--degraded">
        <div class="health-dashboard__summary">
          <span class="health-indicator health-indicator--degraded"></span>
          Systems: ${healthy}/${total} Operational
        </div>
        <div class="health-dashboard__grid">
          ${serviceCards}
        </div>
      </div>
    `;
  }

}
