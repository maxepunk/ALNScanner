import { escapeHtml } from '../../utils/escapeHtml.js';
import { escapeCssAttrValue } from '../../utils/escapeCssAttrValue.js';
import { doorWording } from './dormancyWording.js';

/**
 * HealthRenderer - Differential Service Health Dashboard
 *
 * Collapsed when nothing needs attention, expanded grid otherwise.
 * First render builds full DOM. Subsequent renders do targeted updates
 * when staying in the same layout mode (collapsed/expanded).
 * Layout mode changes trigger a full rebuild.
 *
 * THE THREE WORDS (Block 2 T1a D13; pins P5/P16). A service is
 * `healthy`, `down`, or `dormant`, and the third is not a shade of the
 * second. Dormant means nobody expected it tonight — the profile did not
 * install its equipment, or an operator latched it out — so it renders
 * GREY and names its door. Red is reserved for things that are broken.
 * That reservation is the whole point: a red that is always red trains GMs
 * to ignore red, and then the night VLC really dies nobody looks.
 *
 * The collapse rule follows from the same idea. Dormant by the PROFILE's
 * door is a venue fact, settled before the doors opened; it does not force
 * the dashboard open, it just gets counted in the summary. Dormant by the
 * OPERATOR's door does force it open — a human latched that during the
 * show, and somebody should be able to see what and why.
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
      cueengine: 'Cue Engine',
      // P16: the scoreboard kiosk is a piece of venue equipment like any
      // other, and until T1a nothing on this dashboard said if it was alive.
      display: 'Display (kiosk)'
    };
    this._mode = null; // 'collapsed' | 'expanded'
    this._serviceEls = null; // Map<serviceId, {card, statusEl, messageEl, btnSlot}>
    this._summaryEl = null;
    this._summaryTextEl = null;
    /** The GM clicked the collapsed summary open; survives re-renders. */
    this._forceExpanded = false;
    /** Last data, so toggleDetail() can re-render without new state. */
    this._lastData = null;
  }

  /**
   * Render health dashboard (differential)
   * @param {Object} data - { serviceHealth: { serviceId: { status, message, door } } }
   *   or flat health map
   * @param {Object|null} prev - Previous state (null on first render)
   */
  render(data, _prev = null) {
    if (!this.container) return;
    this._lastData = data;

    const health = data?.serviceHealth || data || {};
    const services = Object.keys(this.SERVICE_NAMES);
    const statuses = services.map(id => ({
      id,
      name: this.SERVICE_NAMES[id],
      status: health[id]?.status || 'unknown',
      message: health[id]?.message || '',
      door: health[id]?.door
    }));

    const healthyCount = statuses.filter(s => s.status === 'healthy').length;
    const dormantCount = statuses.filter(s => s.status === 'dormant').length;
    const totalCount = services.length;

    // Expanded when something wants attention: anything not healthy and not
    // dormant-by-profile. A profile-dormant service is a settled venue fact.
    const needsAttention = statuses.some(
      s => s.status !== 'healthy' && !(s.status === 'dormant' && s.door === 'profile')
    );
    const mode = (needsAttention || this._forceExpanded) ? 'expanded' : 'collapsed';

    if (!this._serviceEls || mode !== this._mode) {
      // First render or layout mode changed: full rebuild
      this._buildDOM(statuses, healthyCount, totalCount, dormantCount, mode);
      return;
    }

    if (mode === 'expanded') {
      this._updateDOM(statuses, healthyCount, totalCount);
    }
    // collapsed + same mode = no update needed
  }

  /**
   * Open (or re-close) the dashboard from the collapsed summary. The grey
   * rows are the reason this exists: with the rig uninstalled the dashboard
   * stays collapsed all night, and a GM still needs a way to look at WHAT
   * is dormant without waiting for something to break.
   */
  toggleDetail() {
    this._forceExpanded = !this._forceExpanded;
    if (this._lastData !== null) this.render(this._lastData);
  }

  /** @private The card class for a status. */
  static _cardClass(s) {
    if (s.status === 'healthy') return 'health-service--ok';
    if (s.status === 'dormant') return 'health-service--dormant';
    return 'health-service--down';
  }

  /** @private What the row says under the name. */
  static _statusText(s) {
    return s.status === 'dormant' ? doorWording(s.door) : s.status;
  }

  _buildDOM(statuses, healthyCount, totalCount, dormantCount, mode) {
    this._mode = mode;

    if (mode === 'collapsed') {
      const summary = dormantCount > 0
        ? `All installed systems operational (${healthyCount}/${totalCount}, ${dormantCount} not installed tonight)`
        : `All Systems Operational (${healthyCount}/${totalCount})`;
      this.container.innerHTML = `
        <div class="health-dashboard health-dashboard--ok">
          <button type="button" class="health-dashboard__summary" data-action="admin.toggleHealthDetail">
            <span class="health-indicator health-indicator--ok"></span>
            ${escapeHtml(summary)}
          </button>
        </div>
      `;
      this._summaryEl = this.container.querySelector('.health-dashboard__summary');
      this._serviceEls = {};
      return;
    }

    // Expanded mode
    const serviceCards = statuses.map(s => {
      const isDown = s.status !== 'healthy' && s.status !== 'dormant';
      return `
        <div class="health-service ${HealthRenderer._cardClass(s)}" data-service="${escapeHtml(s.id)}">
          <div class="health-service__name">${escapeHtml(s.name)}</div>
          <div class="health-service__status">${escapeHtml(HealthRenderer._statusText(s))}</div>
          ${s.message ? `<div class="health-service__message">${escapeHtml(s.message)}</div>` : '<div class="health-service__message" style="display:none"></div>'}
          <div class="health-service__btn-slot">
            ${isDown ? `<button class="btn btn-sm" data-action="admin.serviceCheck" data-service-id="${escapeHtml(s.id)}">Check Now</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    this.container.innerHTML = `
      <div class="health-dashboard health-dashboard--degraded">
        <button type="button" class="health-dashboard__summary" data-action="admin.toggleHealthDetail">
          <span class="health-indicator health-indicator--degraded"></span>
          <span class="health-dashboard__summary-text">Systems: ${healthyCount}/${totalCount} Operational</span>
        </button>
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
      const card = this.container.querySelector(`[data-service="${escapeCssAttrValue(s.id)}"]`);
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

      const isDown = s.status !== 'healthy' && s.status !== 'dormant';

      // Status class
      els.card.className = `health-service ${HealthRenderer._cardClass(s)}`;

      // Status text
      els.statusEl.textContent = HealthRenderer._statusText(s);

      // Message
      if (s.message) {
        els.messageEl.textContent = s.message;
        els.messageEl.style.display = '';
      } else {
        els.messageEl.textContent = '';
        els.messageEl.style.display = 'none';
      }

      // Check Now button — never for a dormant service: there is nothing to
      // probe, and a button that always answers "not probed" is furniture.
      if (isDown) {
        if (!els.btnSlot.querySelector('button')) {
          els.btnSlot.innerHTML = `<button class="btn btn-sm" data-action="admin.serviceCheck" data-service-id="${escapeHtml(s.id)}">Check Now</button>`;
        }
      } else {
        els.btnSlot.innerHTML = '';
      }
    }
  }

}
