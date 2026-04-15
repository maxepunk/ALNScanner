import { escapeHtml } from '../../utils/escapeHtml.js';

/**
 * EvidencePickerRenderer - Scoreboard evidence navigation picker
 *
 * Populates the "Jump to Character" dropdown in the admin panel's
 * "Scoreboard Evidence" section with the alphabetical list of character
 * owners whose tokens have been exposed in the current session. Enables
 * or disables the Prev / Next / Jump controls based on whether any
 * evidence exists.
 *
 * Data source: `DataManager.getExposedOwners()` — derived from
 * detective-mode transactions, mirroring the filter applied on
 * scoreboard.html (`transaction.mode === 'detective'`).
 */
export class EvidencePickerRenderer {
  constructor(elements = {}) {
    this.hint = elements.hint || document.getElementById('scoreboard-evidence-hint');
    this.prevBtn = elements.prevBtn || document.getElementById('scoreboard-prev-btn');
    this.nextBtn = elements.nextBtn || document.getElementById('scoreboard-next-btn');
    this.jumpBtn = elements.jumpBtn || document.getElementById('scoreboard-jump-btn');
    this.dropdown = elements.dropdown || document.getElementById('scoreboard-owner-dropdown');

    // Track last-rendered owner list to avoid destroying a user's in-progress
    // dropdown selection on unrelated updates.
    this._lastOwners = null;
  }

  /**
   * Render the picker with the given list of owners.
   * @param {string[]} owners - Alphabetical list of character owners
   */
  render(owners) {
    const list = Array.isArray(owners) ? owners : [];
    const hasEvidence = list.length > 0;

    if (this.hint) {
      this.hint.textContent = hasEvidence
        ? `${list.length} character${list.length === 1 ? '' : 's'} on board`
        : 'Awaiting evidence...';
    }

    if (this.prevBtn) this.prevBtn.disabled = !hasEvidence;
    if (this.nextBtn) this.nextBtn.disabled = !hasEvidence;
    if (this.jumpBtn) this.jumpBtn.disabled = !hasEvidence;
    if (this.dropdown) this.dropdown.disabled = !hasEvidence;

    // Skip dropdown DOM rebuild if the owner list is unchanged.
    if (this._ownersEqual(this._lastOwners, list)) return;
    this._lastOwners = list.slice();

    if (this.dropdown) {
      // Preserve current selection if the owner is still present.
      const prevValue = this.dropdown.value;
      const options = ['<option value="">Jump to character…</option>']
        .concat(list.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`));
      this.dropdown.innerHTML = options.join('');
      if (prevValue && list.includes(prevValue)) {
        this.dropdown.value = prevValue;
      }
    }
  }

  _ownersEqual(a, b) {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}

export default EvidencePickerRenderer;
