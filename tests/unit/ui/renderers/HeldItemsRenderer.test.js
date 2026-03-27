/**
 * Unit Test: HeldItemsRenderer
 *
 * Verifies snapshot-driven rendering of held cues/videos.
 * HeldItemsRenderer receives full state snapshots via renderSnapshot(items)
 * from the StateStore subscription. The incremental render(data) method
 * was removed after the unified state architecture migration.
 * @jest-environment jsdom
 */

import { HeldItemsRenderer } from '../../../../src/ui/renderers/HeldItemsRenderer.js';

describe('HeldItemsRenderer', () => {
  let container;
  let renderer;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'held-items-container';
    document.body.appendChild(container);
    renderer = new HeldItemsRenderer({ container });
  });

  afterEach(() => {
    renderer.destroy();
    document.body.innerHTML = '';
  });

  describe('bulk actions', () => {
    it('should show bulk actions when 2+ items held', () => {
      renderer.renderSnapshot([
        { id: 'h1', type: 'cue', reason: 'x', heldAt: new Date().toISOString() },
        { id: 'h2', type: 'video', reason: 'y', heldAt: new Date().toISOString() },
      ]);

      expect(container.querySelector('[data-action="admin.releaseAllHeld"]')).toBeTruthy();
      expect(container.querySelector('[data-action="admin.discardAllHeld"]')).toBeTruthy();
    });

    it('should NOT show bulk actions for single item', () => {
      renderer.renderSnapshot([
        { id: 'h1', type: 'cue', reason: 'x', heldAt: new Date().toISOString() },
      ]);

      expect(container.querySelector('[data-action="admin.releaseAllHeld"]')).toBeFalsy();
    });
  });

  describe('duration display', () => {
    it('should show duration for items with heldAt', () => {
      const heldAt = new Date(Date.now() - 65000).toISOString(); // 65 seconds ago
      renderer.renderSnapshot([
        { id: 'h1', type: 'cue', reason: 'blocked', heldAt },
      ]);

      const durationEl = container.querySelector('.held-item__duration');
      expect(durationEl).toBeTruthy();
      expect(durationEl.textContent).toMatch(/1m \d+s/);
    });

    it('should show empty duration for items without heldAt', () => {
      renderer.renderSnapshot([
        { id: 'h1', type: 'cue', reason: 'blocked' },
      ]);

      const durationEl = container.querySelector('.held-item__duration');
      expect(durationEl.textContent).toBe('');
    });
  });

  describe('edge cases', () => {
    it('should handle null container gracefully', () => {
      const noContainerRenderer = new HeldItemsRenderer({ container: null });
      expect(() => noContainerRenderer.renderSnapshot([
        { id: 'h1', type: 'cue', reason: 'x', heldAt: new Date().toISOString() },
      ])).not.toThrow();
      noContainerRenderer.destroy();
    });

    it('should handle empty array snapshot gracefully', () => {
      renderer.renderSnapshot([
        { id: 'h1', type: 'cue', reason: 'x', heldAt: new Date().toISOString() },
      ]);
      expect(container.querySelector('[data-held-id="h1"]')).toBeTruthy();

      // Snapshot with empty array replaces state entirely — shows empty state
      renderer.renderSnapshot([]);
      expect(container.querySelector('.held-items--empty')).toBeTruthy();
      expect(container.textContent).toContain('No Held Items');
    });

    it('should handle undefined/null items array gracefully', () => {
      expect(() => renderer.renderSnapshot(null)).not.toThrow();
      expect(() => renderer.renderSnapshot(undefined)).not.toThrow();
    });
  });

  describe('destroy()', () => {
    it('should clear duration timer and items', () => {
      renderer.renderSnapshot([
        { id: 'h1', type: 'cue', reason: 'x', heldAt: new Date().toISOString() },
      ]);
      expect(renderer._durationTimer).not.toBeNull();

      renderer.destroy();
      expect(renderer._durationTimer).toBeNull();
      expect(renderer._items.size).toBe(0);
    });

    it('should not error if destroyed without items', () => {
      expect(() => renderer.destroy()).not.toThrow();
    });
  });
});
