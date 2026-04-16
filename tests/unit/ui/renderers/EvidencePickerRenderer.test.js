/**
 * Unit Test: EvidencePickerRenderer
 *
 * Verifies:
 *   - Empty-state rendering ("Awaiting evidence...") + all controls disabled
 *   - Populated-state rendering with character count in hint
 *   - Dropdown options built from the owner list
 *   - Disabled flags toggle with empty vs populated state
 *   - Differential short-circuit skips DOM rebuild when owners unchanged
 *   - User's in-progress dropdown selection preserved across updates
 *   - Owner names HTML-escaped (XSS safety)
 *   - Null-safety when DOM elements are missing
 *   - Defensive array handling (non-array / null input)
 *
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EvidencePickerRenderer } from '../../../../src/ui/renderers/EvidencePickerRenderer.js';

describe('EvidencePickerRenderer', () => {
  let hint, prevBtn, nextBtn, jumpBtn, dropdown, renderer;

  beforeEach(() => {
    hint = Object.assign(document.createElement('p'), { id: 'scoreboard-evidence-hint' });
    prevBtn = Object.assign(document.createElement('button'), {
      id: 'scoreboard-prev-btn', disabled: true
    });
    nextBtn = Object.assign(document.createElement('button'), {
      id: 'scoreboard-next-btn', disabled: true
    });
    jumpBtn = Object.assign(document.createElement('button'), {
      id: 'scoreboard-jump-btn', disabled: true
    });
    dropdown = Object.assign(document.createElement('select'), {
      id: 'scoreboard-owner-dropdown', disabled: true
    });
    dropdown.innerHTML = '<option value="">Jump to character…</option>';

    for (const el of [hint, prevBtn, nextBtn, jumpBtn, dropdown]) {
      document.body.appendChild(el);
    }

    renderer = new EvidencePickerRenderer();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('empty state', () => {
    it('shows "Awaiting evidence..." hint when owner list is empty', () => {
      renderer.render([]);
      expect(hint.textContent).toBe('Awaiting evidence...');
    });

    it('disables all controls when owner list is empty', () => {
      renderer.render([]);
      expect(prevBtn.disabled).toBe(true);
      expect(nextBtn.disabled).toBe(true);
      expect(jumpBtn.disabled).toBe(true);
      expect(dropdown.disabled).toBe(true);
    });

    it('falls back to empty state when input is not an array', () => {
      renderer.render(null);
      expect(hint.textContent).toBe('Awaiting evidence...');
      expect(prevBtn.disabled).toBe(true);
      renderer.render(undefined);
      expect(hint.textContent).toBe('Awaiting evidence...');
    });
  });

  describe('populated state', () => {
    it('enables all controls when the owner list is non-empty', () => {
      renderer.render(['Alex Reeves', 'Ashley White']);
      expect(prevBtn.disabled).toBe(false);
      expect(nextBtn.disabled).toBe(false);
      expect(jumpBtn.disabled).toBe(false);
      expect(dropdown.disabled).toBe(false);
    });

    it('renders pluralized character count in the hint', () => {
      renderer.render(['Alex Reeves']);
      expect(hint.textContent).toBe('1 character on board');

      renderer.render(['Alex Reeves', 'Ashley White']);
      expect(hint.textContent).toBe('2 characters on board');
    });

    it('builds dropdown options from the owner list', () => {
      renderer.render(['Alex Reeves', 'Marcus Black']);
      const options = dropdown.querySelectorAll('option');
      expect(options.length).toBe(3);
      expect(options[0].value).toBe('');
      expect(options[0].textContent).toBe('Jump to character…');
      expect(options[1].value).toBe('Alex Reeves');
      expect(options[1].textContent).toBe('Alex Reeves');
      expect(options[2].value).toBe('Marcus Black');
    });
  });

  describe('differential rendering', () => {
    it('skips dropdown rebuild when owner list is unchanged', () => {
      renderer.render(['Alex Reeves', 'Marcus Black']);
      const firstHTML = dropdown.innerHTML;

      dropdown.dataset.probe = 'stable';
      renderer.render(['Alex Reeves', 'Marcus Black']);
      expect(dropdown.innerHTML).toBe(firstHTML);
      expect(dropdown.dataset.probe).toBe('stable');
    });

    it('rebuilds dropdown when the owner list changes', () => {
      renderer.render(['Alex Reeves']);
      renderer.render(['Alex Reeves', 'Ashley White']);
      expect(dropdown.querySelectorAll('option').length).toBe(3);
    });

    it('rebuilds dropdown when order changes (same set, different order)', () => {
      renderer.render(['Alex Reeves', 'Ashley White']);
      renderer.render(['Ashley White', 'Alex Reeves']);
      const options = dropdown.querySelectorAll('option');
      expect(options[1].value).toBe('Ashley White');
      expect(options[2].value).toBe('Alex Reeves');
    });
  });

  describe('selection preservation', () => {
    it("preserves an in-progress selection when the list changes but still contains the owner", () => {
      renderer.render(['Alex Reeves', 'Ashley White']);
      dropdown.value = 'Ashley White';

      // Same owner still present after a new owner is added
      renderer.render(['Alex Reeves', 'Ashley White', 'Marcus Black']);
      expect(dropdown.value).toBe('Ashley White');
    });

    it('clears selection when the selected owner is no longer in the list', () => {
      renderer.render(['Alex Reeves', 'Ashley White']);
      dropdown.value = 'Ashley White';

      renderer.render(['Alex Reeves']);
      // Empty-option default (placeholder) is selected
      expect(dropdown.value).toBe('');
    });
  });

  describe('security', () => {
    it('HTML-escapes owner names in dropdown options', () => {
      const malicious = "<img src=x onerror=alert('xss')>";
      renderer.render([malicious]);

      // Real XSS would inject an <img> element — confirm none exists
      expect(dropdown.querySelectorAll('img').length).toBe(0);

      // The owner name survives round-trip as a string (value + text)
      const option = dropdown.querySelectorAll('option')[1];
      expect(option.value).toBe(malicious);
      expect(option.textContent).toBe(malicious);
    });

    it('escapes ampersands, quotes, and apostrophes', () => {
      renderer.render(["O'Brien & Sons \"Co.\""]);
      const option = dropdown.querySelectorAll('option')[1];
      expect(option.value).toBe("O'Brien & Sons \"Co.\"");
      expect(option.textContent).toBe("O'Brien & Sons \"Co.\"");
    });
  });

  describe('null safety', () => {
    it('does not throw when DOM elements are missing', () => {
      document.body.innerHTML = '';
      const bareRenderer = new EvidencePickerRenderer();
      expect(() => bareRenderer.render([])).not.toThrow();
      expect(() => bareRenderer.render(['Alex Reeves'])).not.toThrow();
    });

    it('accepts explicit element overrides via constructor', () => {
      document.body.innerHTML = '';
      const custom = {
        hint: Object.assign(document.createElement('p'), { id: 'custom-hint' }),
        prevBtn: document.createElement('button'),
        nextBtn: document.createElement('button'),
        jumpBtn: document.createElement('button'),
        dropdown: document.createElement('select')
      };
      const customRenderer = new EvidencePickerRenderer(custom);
      customRenderer.render(['Alex Reeves']);
      expect(custom.hint.textContent).toBe('1 character on board');
      expect(custom.prevBtn.disabled).toBe(false);
    });
  });
});
