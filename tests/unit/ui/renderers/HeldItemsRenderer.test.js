/**
 * Unit Test: HeldItemsRenderer
 *
 * Verifies incremental event-driven rendering of held cues/videos.
 * Unlike other renderers, this one receives events (held/released/discarded)
 * and maintains internal _items Map.
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

  describe('render() - held action', () => {
    it('should render held cue item with release/discard buttons', () => {
      renderer.render({
        action: 'held',
        id: 'held-cue-1',
        type: 'cue',
        cueId: 'tension-hit',
        reason: 'video_busy',
        heldAt: new Date().toISOString(),
      });

      expect(container.querySelector('[data-held-id="held-cue-1"]')).toBeTruthy();
      expect(container.querySelector('[data-action="admin.releaseHeld"]')).toBeTruthy();
      expect(container.querySelector('[data-action="admin.discardHeld"]')).toBeTruthy();
    });

    it('should render held video item', () => {
      renderer.render({
        action: 'held',
        id: 'held-video-1',
        type: 'video',
        videoFile: 'intro.mp4',
        reason: 'vlc_down',
        heldAt: new Date().toISOString(),
      });

      expect(container.querySelector('.held-item--video')).toBeTruthy();
      expect(container.textContent).toContain('intro.mp4');
    });

    it('should show cue type badge', () => {
      renderer.render({
        action: 'held',
        id: 'h1',
        type: 'cue',
        cueId: 'test',
        reason: 'test',
        heldAt: new Date().toISOString(),
      });

      expect(container.querySelector('.held-item--cue')).toBeTruthy();
      expect(container.querySelector('.held-item__type').textContent).toBe('cue');
    });

    it('should show item count in summary', () => {
      renderer.render({ action: 'held', id: 'h1', type: 'cue', reason: 'x', heldAt: new Date().toISOString() });
      renderer.render({ action: 'held', id: 'h2', type: 'video', reason: 'y', heldAt: new Date().toISOString() });

      expect(container.textContent).toContain('Held Items (2)');
    });

    it('should show cueId as description for cue type', () => {
      renderer.render({
        action: 'held',
        id: 'h1',
        type: 'cue',
        cueId: 'tension-hit',
        reason: 'blocked',
        heldAt: new Date().toISOString(),
      });

      expect(container.querySelector('.held-item__description').textContent).toBe('tension-hit');
    });

    it('should show videoFile as description for video type', () => {
      renderer.render({
        action: 'held',
        id: 'h1',
        type: 'video',
        videoFile: 'scene1.mp4',
        reason: 'vlc_busy',
        heldAt: new Date().toISOString(),
      });

      expect(container.querySelector('.held-item__description').textContent).toBe('scene1.mp4');
    });

    it('should fallback to tokenId for video description', () => {
      renderer.render({
        action: 'held',
        id: 'h1',
        type: 'video',
        tokenId: 'token-abc',
        reason: 'vlc_busy',
        heldAt: new Date().toISOString(),
      });

      expect(container.querySelector('.held-item__description').textContent).toBe('token-abc');
    });

    it('should show reason text', () => {
      renderer.render({
        action: 'held',
        id: 'h1',
        type: 'cue',
        cueId: 'test',
        reason: 'service_down: vlc',
        heldAt: new Date().toISOString(),
      });

      expect(container.querySelector('.held-item__reason').textContent).toBe('service_down: vlc');
    });

    it('should escape HTML in descriptions', () => {
      renderer.render({
        action: 'held',
        id: 'h1',
        type: 'cue',
        cueId: '<script>alert("xss")</script>',
        reason: '<img onerror=alert(1)>',
        heldAt: new Date().toISOString(),
      });

      expect(container.innerHTML).not.toContain('<script>alert');
      expect(container.innerHTML).not.toContain('<img onerror');
    });
  });

  describe('render() - released action', () => {
    it('should remove item on released action', () => {
      renderer.render({
        action: 'held',
        id: 'h1',
        type: 'cue',
        reason: 'blocked',
        heldAt: new Date().toISOString(),
      });

      expect(container.querySelector('[data-held-id="h1"]')).toBeTruthy();

      renderer.render({ action: 'released', id: 'h1' });

      expect(container.querySelector('[data-held-id="h1"]')).toBeFalsy();
    });

    it('should support heldId fallback for released action', () => {
      renderer.render({
        action: 'held',
        id: 'h1',
        type: 'cue',
        reason: 'blocked',
        heldAt: new Date().toISOString(),
      });

      renderer.render({ action: 'released', heldId: 'h1' });

      expect(container.querySelector('[data-held-id="h1"]')).toBeFalsy();
    });

    it('should show empty state after last item released', () => {
      renderer.render({ action: 'held', id: 'h1', type: 'cue', reason: 'x', heldAt: new Date().toISOString() });
      renderer.render({ action: 'released', id: 'h1' });

      expect(container.querySelector('.held-items--empty')).toBeTruthy();
      expect(container.textContent).toContain('No Held Items');
    });
  });

  describe('render() - discarded action', () => {
    it('should remove item on discarded action', () => {
      renderer.render({ action: 'held', id: 'h1', type: 'cue', reason: 'x', heldAt: new Date().toISOString() });
      renderer.render({ action: 'discarded', id: 'h1' });

      expect(container.querySelector('[data-held-id="h1"]')).toBeFalsy();
      expect(container.querySelector('.held-items--empty')).toBeTruthy();
    });

    it('should support heldId fallback for discarded action', () => {
      renderer.render({ action: 'held', id: 'h1', type: 'cue', reason: 'x', heldAt: new Date().toISOString() });
      renderer.render({ action: 'discarded', heldId: 'h1' });

      expect(container.querySelector('[data-held-id="h1"]')).toBeFalsy();
    });
  });

  describe('render() - recoverable action', () => {
    it('should handle recoverable action without error', () => {
      renderer.render({ action: 'held', id: 'h1', type: 'cue', reason: 'x', heldAt: new Date().toISOString() });

      expect(() => renderer.render({ action: 'recoverable', id: 'h1' })).not.toThrow();
    });
  });

  describe('bulk actions', () => {
    it('should show bulk actions when 2+ items held', () => {
      renderer.render({ action: 'held', id: 'h1', type: 'cue', reason: 'x', heldAt: new Date().toISOString() });
      renderer.render({ action: 'held', id: 'h2', type: 'video', reason: 'y', heldAt: new Date().toISOString() });

      expect(container.querySelector('[data-action="admin.releaseAllHeld"]')).toBeTruthy();
      expect(container.querySelector('[data-action="admin.discardAllHeld"]')).toBeTruthy();
    });

    it('should NOT show bulk actions for single item', () => {
      renderer.render({ action: 'held', id: 'h1', type: 'cue', reason: 'x', heldAt: new Date().toISOString() });

      expect(container.querySelector('[data-action="admin.releaseAllHeld"]')).toBeFalsy();
    });
  });

  describe('duration display', () => {
    it('should show duration for items with heldAt', () => {
      const heldAt = new Date(Date.now() - 65000).toISOString(); // 65 seconds ago
      renderer.render({
        action: 'held',
        id: 'h1',
        type: 'cue',
        reason: 'blocked',
        heldAt,
      });

      const durationEl = container.querySelector('.held-item__duration');
      expect(durationEl).toBeTruthy();
      expect(durationEl.textContent).toMatch(/1m \d+s/);
    });

    it('should show empty duration for items without heldAt', () => {
      renderer.render({
        action: 'held',
        id: 'h1',
        type: 'cue',
        reason: 'blocked',
      });

      const durationEl = container.querySelector('.held-item__duration');
      expect(durationEl.textContent).toBe('');
    });
  });

  describe('edge cases', () => {
    it('should handle null container gracefully', () => {
      const noContainerRenderer = new HeldItemsRenderer({ container: null });
      expect(() => noContainerRenderer.render({ action: 'held', id: 'h1', type: 'cue' })).not.toThrow();
      noContainerRenderer.destroy();
    });

    it('should handle releasing non-existent item gracefully', () => {
      expect(() => renderer.render({ action: 'released', id: 'nonexistent' })).not.toThrow();
    });
  });

  describe('destroy()', () => {
    it('should clear duration timer and items', () => {
      renderer.render({ action: 'held', id: 'h1', type: 'cue', reason: 'x', heldAt: new Date().toISOString() });
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
