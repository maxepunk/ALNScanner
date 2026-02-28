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

  describe('render()', () => {
    it('should show collapsed empty state when no items', () => {
      renderer.render({ action: 'held', id: 'x', type: 'cue', reason: 'test', heldAt: new Date().toISOString() });
      renderer.render({ action: 'released', id: 'x' });

      expect(container.querySelector('.held-items--empty')).toBeTruthy();
    });

    it('should render held item with release/discard buttons', () => {
      renderer.render({
        action: 'held',
        id: 'held-cue-1',
        type: 'cue',
        cueId: 'cue-1',
        reason: 'video_busy',
        heldAt: new Date().toISOString()
      });

      expect(container.querySelector('[data-held-id="held-cue-1"]')).toBeTruthy();
      expect(container.querySelector('[data-action="admin.releaseHeld"]')).toBeTruthy();
      expect(container.querySelector('[data-action="admin.discardHeld"]')).toBeTruthy();
    });

    it('should remove item on released action', () => {
      renderer.render({
        action: 'held',
        id: 'held-cue-1',
        type: 'cue',
        reason: 'service_down',
        heldAt: new Date().toISOString()
      });

      renderer.render({ action: 'released', id: 'held-cue-1', heldId: 'held-cue-1' });

      expect(container.querySelector('[data-held-id="held-cue-1"]')).toBeFalsy();
    });

    it('should show type badge for cue vs video', () => {
      renderer.render({
        action: 'held', id: 'held-video-1', type: 'video',
        videoFile: 'test.mp4', reason: 'vlc_down',
        heldAt: new Date().toISOString()
      });

      expect(container.textContent).toContain('video');
    });

    it('should show bulk actions when 2+ items', () => {
      renderer.render({ action: 'held', id: 'h1', type: 'cue', reason: 'x', heldAt: new Date().toISOString() });
      renderer.render({ action: 'held', id: 'h2', type: 'video', reason: 'y', heldAt: new Date().toISOString() });

      expect(container.querySelector('[data-action="admin.releaseAllHeld"]')).toBeTruthy();
      expect(container.querySelector('[data-action="admin.discardAllHeld"]')).toBeTruthy();
    });
  });

  describe('destroy()', () => {
    it('should clear duration timer', () => {
      renderer.render({ action: 'held', id: 'h1', type: 'cue', reason: 'x', heldAt: new Date().toISOString() });
      renderer.destroy();
      // No error — timer cleared
    });
  });
});
