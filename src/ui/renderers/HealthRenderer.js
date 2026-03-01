import { escapeHtml } from '../../utils/escapeHtml.js';

/**
 * HealthRenderer - Differential Service Health Dashboard
 *
 * Collapsed when all healthy, expanded grid when any service is down.
 * First render builds full DOM. Subsequent renders do targeted updates
 * when staying in the same layout mode (collapsed/expanded).
 * Layout mode changes trigger a full rebuild.
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
    this._mode = null; // 'collapsed' | 'expanded'
    this._serviceEls = null; // Map<serviceId, {card, statusEl, messageEl, btnSlot}>
    this._summaryEl = null;
    this._summaryTextEl = null;
  }

  /**
   * Render health dashboard (differential)
   * @param {Object} data - { serviceHealth: { serviceId: { status, message } } } or flat health map
   * @param {Object|null} prev - Previous state (null on first render)
   */
  render(data, prev = null) {
    if (!this.container) return;

    const health = data?.serviceHealth || data || {};
    const services = Object.keys(this.SERVICE_NAMES);
    const statuses = services.map(id => ({
      id,
      name: this.SERVICE_NAMES[id],
      status: health[id]?.status || 'unknown',
      message: health[id]?.message || ''
    }));

    const healthyCount = statuses.filter(s => s.status === 'healthy').length;
    const totalCount = services.length;
    const mode = healthyCount === totalCount ? 'collapsed' : 'expanded';

    if (!this._serviceEls || mode !== this._mode) {
      // First render or layout mode changed: full rebuild
      this._buildDOM(statuses, healthyCount, totalCount, mode);
      return;
    }

    if (mode === 'expanded') {
      this._updateDOM(statuses, healthyCount, totalCount);
    }
    // collapsed + same mode = no update needed (always 8/8)
  }

  _buildDOM(statuses, healthyCount, totalCount, mode) {
    this._mode = mode;

    if (mode === 'collapsed') {
      this.container.innerHTML = `
        <div class="health-dashboard health-dashboard--ok">
          <div class="health-dashboard__summary">
            <span class="health-indicator health-indicator--ok"></span>
            All Systems Operational (${healthyCount}/${totalCount})
          </div>
        </div>
      `;
      this._summaryEl = this.container.querySelector('.health-dashboard__summary');
      this._serviceEls = {};
      return;
    }

    // Expanded mode
    const serviceCards = statuses.map(s => {
      const isDown = s.status !== 'healthy';
      return `
        <div class="health-service ${isDown ? 'health-service--down' : 'health-service--ok'}" data-service="${s.id}">
          <div class="health-service__name">${escapeHtml(s.name)}</div>
          <div class="health-service__status">${s.status}</div>
          ${s.message ? `<div class="health-service__message">${escapeHtml(s.message)}</div>` : '<div class="health-service__message" style="display:none"></div>'}
          <div class="health-service__btn-slot">
            ${isDown ? `<button class="btn btn-sm" data-action="admin.serviceCheck" data-service-id="${s.id}">Check Now</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    this.container.innerHTML = `
      <div class="health-dashboard health-dashboard--degraded">
        <div class="health-dashboard__summary">
          <span class="health-indicator health-indicator--degraded"></span>
          <span class="health-dashboard__summary-text">Systems: ${healthyCount}/${totalCount} Operational</span>
        </div>
        <div class="health-dashboard__grid">
          ${serviceCards}
        </div>
      </div>
    `;

    // Cache element references
    this._summaryEl = this.container.querySelector('.health-dashboard__summary');
    this._summaryTextEl = this.container.querySelector('.health-dashboard__summary-text');
    this._serviceEls = {};
    for (const s of statuses) {
      const card = this.container.querySelector(`[data-service="${s.id}"]`);
      if (card) {
        this._serviceEls[s.id] = {
          card,
          statusEl: card.querySelector('.health-service__status'),
          messageEl: card.querySelector('.health-service__message'),
          btnSlot: card.querySelector('.health-service__btn-slot')
        };
      }
    }
  }

  _updateDOM(statuses, healthyCount, totalCount) {
    // Update summary count (targeted textContent, no innerHTML churn)
    if (this._summaryTextEl) {
      this._summaryTextEl.textContent = `Systems: ${healthyCount}/${totalCount} Operational`;
    }

    // Update individual service cards
    for (const s of statuses) {
      const els = this._serviceEls[s.id];
      if (!els) continue;

      const isDown = s.status !== 'healthy';

      // Status class
      els.card.className = `health-service ${isDown ? 'health-service--down' : 'health-service--ok'}`;

      // Status text
      els.statusEl.textContent = s.status;

      // Message
      if (s.message) {
        els.messageEl.textContent = s.message;
        els.messageEl.style.display = '';
      } else {
        els.messageEl.textContent = '';
        els.messageEl.style.display = 'none';
      }

      // Check Now button
      if (isDown) {
        if (!els.btnSlot.querySelector('button')) {
          els.btnSlot.innerHTML = `<button class="btn btn-sm" data-action="admin.serviceCheck" data-service-id="${s.id}">Check Now</button>`;
        }
      } else {
        els.btnSlot.innerHTML = '';
      }
    }
  }

}
