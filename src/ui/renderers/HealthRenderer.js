import { escapeHtml } from '../../utils/escapeHtml.js';
import { escapeCssAttrValue } from '../../utils/escapeCssAttrValue.js';

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
      music: 'Music (MPD)',
      lighting: 'Lighting (HA)',
      bluetooth: 'Bluetooth',
      audio: 'Audio Routing',
      sound: 'Sound Effects',
      gameclock: 'Game Clock',
      cueengine: 'Cue Engine'
    };
    this._mode = null; // 'collapsed' | 'expanded'
    this._serviceEls = null; // Map<serviceId, {card, statusEl, messageEl, checkedEl, btnSlot}>
    this._summaryEl = null;
    this._summaryTextEl = null;
    this._serviceData = {}; // Map<serviceId, {status, message, checkedText}> — last-written values, for diffing
    this._lastSummaryText = null;
  }

  /**
   * Format a health-check timestamp as "checked HH:MM:SS" in the viewer's
   * local time. Absolute (no relative/ago timer) — see W4/B-5.
   * @param {string|Date|null} lastChecked
   * @returns {string} '' if missing/invalid
   */
  _formatChecked(lastChecked) {
    if (!lastChecked) return '';
    const d = new Date(lastChecked);
    if (isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `checked ${hh}:${mm}:${ss}`;
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
      message: health[id]?.message || '',
      lastChecked: health[id]?.lastChecked || null
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
    // collapsed + same mode = no update needed (all services healthy)
  }

  _buildDOM(statuses, healthyCount, totalCount, mode) {
    this._mode = mode;
    this._serviceData = {};

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
      this._summaryTextEl = null;
      this._lastSummaryText = null;
      this._serviceEls = {};
      return;
    }

    // Expanded mode
    const serviceCards = statuses.map(s => {
      const isDown = s.status !== 'healthy';
      const checkedText = this._formatChecked(s.lastChecked);
      return `
        <div class="health-service ${isDown ? 'health-service--down' : 'health-service--ok'}" data-service="${escapeHtml(s.id)}">
          <div class="health-service__name">${escapeHtml(s.name)}</div>
          <div class="health-service__status">${escapeHtml(s.status)}</div>
          ${s.message ? `<div class="health-service__message">${escapeHtml(s.message)}</div>` : '<div class="health-service__message" style="display:none"></div>'}
          <div class="health-service__checked">${escapeHtml(checkedText)}</div>
          <div class="health-service__btn-slot">
            ${isDown ? `<button class="btn btn-sm" data-action="admin.serviceCheck" data-service-id="${escapeHtml(s.id)}">Check Now</button>` : ''}
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
    this._lastSummaryText = `Systems: ${healthyCount}/${totalCount} Operational`;
    this._serviceEls = {};
    for (const s of statuses) {
      const card = this.container.querySelector(`[data-service="${escapeCssAttrValue(s.id)}"]`);
      if (card) {
        this._serviceEls[s.id] = {
          card,
          statusEl: card.querySelector('.health-service__status'),
          messageEl: card.querySelector('.health-service__message'),
          checkedEl: card.querySelector('.health-service__checked'),
          btnSlot: card.querySelector('.health-service__btn-slot')
        };
        this._serviceData[s.id] = {
          status: s.status,
          message: s.message,
          checkedText: this._formatChecked(s.lastChecked)
        };
      }
    }
  }

  _updateDOM(statuses, healthyCount, totalCount) {
    // Update summary count (targeted textContent, no innerHTML churn; gated
    // so an unrelated push — e.g. only one service's lastChecked advancing —
    // doesn't touch the summary line).
    if (this._summaryTextEl) {
      const summaryText = `Systems: ${healthyCount}/${totalCount} Operational`;
      if (summaryText !== this._lastSummaryText) {
        this._summaryTextEl.textContent = summaryText;
        this._lastSummaryText = summaryText;
      }
    }

    // Update individual service cards — every field is diffed against the
    // last-written value so an unchanged push (or a push that only bumps a
    // DIFFERENT service's lastChecked) makes zero DOM writes for this one.
    for (const s of statuses) {
      const els = this._serviceEls[s.id];
      if (!els) continue;

      const cached = this._serviceData[s.id] || { status: null, message: null, checkedText: null };
      const isDown = s.status !== 'healthy';

      if (cached.status !== s.status) {
        els.card.className = `health-service ${isDown ? 'health-service--down' : 'health-service--ok'}`;
        els.statusEl.textContent = s.status;

        // Check Now button visibility tracks status
        if (isDown) {
          if (!els.btnSlot.querySelector('button')) {
            els.btnSlot.innerHTML = `<button class="btn btn-sm" data-action="admin.serviceCheck" data-service-id="${escapeHtml(s.id)}">Check Now</button>`;
          }
        } else {
          els.btnSlot.innerHTML = '';
        }

        cached.status = s.status;
      }

      if (cached.message !== s.message) {
        if (s.message) {
          els.messageEl.textContent = s.message;
          els.messageEl.style.display = '';
        } else {
          els.messageEl.textContent = '';
          els.messageEl.style.display = 'none';
        }
        cached.message = s.message;
      }

      const checkedText = this._formatChecked(s.lastChecked);
      if (cached.checkedText !== checkedText) {
        if (els.checkedEl) els.checkedEl.textContent = checkedText;
        cached.checkedText = checkedText;
      }

      this._serviceData[s.id] = cached;
    }
  }

}
