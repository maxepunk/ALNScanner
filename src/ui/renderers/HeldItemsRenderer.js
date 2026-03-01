import { escapeHtml } from '../../utils/escapeHtml.js';

/**
 * HeldItemsRenderer - Unified Held Items Queue
 * Phase 4: Replaces CueRenderer.renderHeldItem() with unified cue+video queue
 *
 * Shows all held items (cues blocked by service outage, videos blocked by VLC)
 * with release/discard buttons and live duration counter.
 *
 * NOTE: Unlike other renderers (CueRenderer, HealthRenderer) which receive full state
 * and render idempotently, this renderer receives incremental events (held/released/discarded)
 * and maintains internal state via `_items` Map. Wire via `e.detail` directly, not a state snapshot.
 */
export class HeldItemsRenderer {
  constructor(elements = {}) {
    this.container = elements.container || document.getElementById('held-items-container');
    this._items = new Map(); // id → held item data
    this._durationTimer = null;
  }

  /**
   * Handle held item event
   * @param {Object} data - { action, id, type, reason, cueId?, videoFile?, heldAt?, ... }
   */
  render(data) {
    if (!this.container) return;

    const { action } = data;

    switch (action) {
      case 'held':
        this._items.set(data.id, data);
        break;
      case 'released':
      case 'discarded': {
        const id = data.id || data.heldId;
        this._items.delete(id);
        break;
      }
      case 'recoverable':
        // Mark recoverable items — could add visual indicator
        break;
    }

    this._renderAll();
    this._manageDurationTimer();
  }

  /**
   * Replace internal state from a full snapshot (used by StateStore subscriptions)
   * @param {Array} items - Full list of currently held items
   */
  renderSnapshot(items) {
    if (!this.container) return;
    this._items.clear();
    (items || []).forEach(item => this._items.set(item.id, item));
    this._renderAll();
    this._manageDurationTimer();
  }

  _renderAll() {
    if (!this.container) return;

    if (this._items.size === 0) {
      this.container.innerHTML = `
        <div class="held-items held-items--empty">
          <span class="held-items__summary">No Held Items</span>
        </div>
      `;
      return;
    }

    const itemsHtml = Array.from(this._items.values()).map(item => {
      const typeBadge = item.type === 'video' ? 'video' : 'cue';
      const description = item.type === 'video'
        ? (item.videoFile || item.tokenId || 'Unknown video')
        : (item.cueId || 'Unknown cue');
      const duration = this._formatDuration(item.heldAt);

      return `
        <div class="held-item held-item--${typeBadge}" data-held-id="${escapeHtml(item.id)}">
          <span class="held-item__type">${typeBadge}</span>
          <div class="held-item__info">
            <span class="held-item__description">${escapeHtml(description)}</span>
            <span class="held-item__reason">${escapeHtml(item.reason || '')}</span>
          </div>
          <span class="held-item__duration" data-held-at="${item.heldAt || ''}">${duration}</span>
          <div class="held-item__actions">
            <button class="btn btn-sm btn-warning" data-action="admin.releaseHeld" data-held-id="${escapeHtml(item.id)}">Release</button>
            <button class="btn btn-sm btn-secondary" data-action="admin.discardHeld" data-held-id="${escapeHtml(item.id)}">Discard</button>
          </div>
        </div>
      `;
    }).join('');

    const bulkHtml = this._items.size >= 2 ? `
      <div class="held-items__bulk">
        <button class="btn btn-sm btn-warning" data-action="admin.releaseAllHeld">Release All</button>
        <button class="btn btn-sm btn-secondary" data-action="admin.discardAllHeld">Discard All</button>
      </div>
    ` : '';

    this.container.innerHTML = `
      <div class="held-items held-items--active">
        <div class="held-items__summary">Held Items (${this._items.size})</div>
        <div class="held-items__list">${itemsHtml}</div>
        ${bulkHtml}
      </div>
    `;
  }

  _formatDuration(heldAt) {
    if (!heldAt) return '';
    const seconds = Math.floor((Date.now() - new Date(heldAt).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  }

  _manageDurationTimer() {
    if (this._items.size > 0 && !this._durationTimer) {
      this._durationTimer = setInterval(() => this._updateDurations(), 1000);
    } else if (this._items.size === 0 && this._durationTimer) {
      clearInterval(this._durationTimer);
      this._durationTimer = null;
    }
  }

  _updateDurations() {
    if (!this.container) return;
    this.container.querySelectorAll('.held-item__duration').forEach(el => {
      const heldAt = el.dataset.heldAt;
      if (heldAt) el.textContent = this._formatDuration(heldAt);
    });
  }

  destroy() {
    if (this._durationTimer) {
      clearInterval(this._durationTimer);
      this._durationTimer = null;
    }
    this._items.clear();
  }

}
