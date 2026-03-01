import { SpotifyRenderer } from '../../../../src/ui/renderers/SpotifyRenderer.js';

describe('SpotifyRenderer', () => {
  let container;
  let renderer;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'now-playing-section';
    document.body.appendChild(container);
    renderer = new SpotifyRenderer({ container });
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  test('renders disabled controls when disconnected (health shown by HealthRenderer)', () => {
    renderer.render({ connected: false, state: 'stopped', volume: 100 });
    // Should show controls but disabled (no separate disconnected banner)
    expect(container.querySelector('.spotify--connected')).not.toBeNull();
    const buttons = container.querySelectorAll('button');
    buttons.forEach(btn => {
      expect(btn.disabled).toBe(true);
    });
    // No serviceCheck button — that's HealthRenderer's job now
    expect(container.querySelector('[data-action="admin.serviceCheck"]')).toBeNull();
  });

  test('renders connected state with transport controls', () => {
    renderer.render({
      connected: true,
      state: 'playing',
      volume: 80,
      track: { title: 'Test Song', artist: 'Test Artist' }
    });
    expect(container.querySelector('.spotify--connected')).not.toBeNull();
    expect(container.querySelector('[data-action="admin.spotifyPause"]')).not.toBeNull();
    expect(container.querySelector('.spotify__track-title').textContent).toBe('Test Song');
  });

  test('renders paused state with play button', () => {
    renderer.render({ connected: true, state: 'paused', volume: 80, track: { title: 'Song', artist: 'Artist' } });
    expect(container.querySelector('[data-action="admin.spotifyPlay"]')).not.toBeNull();
    expect(container.querySelector('[data-action="admin.spotifyPause"]')).toBeNull();
  });

  test('renders volume slider', () => {
    renderer.render({ connected: true, state: 'playing', volume: 65 });
    const slider = container.querySelector('.spotify__volume-slider');
    expect(slider).not.toBeNull();
    expect(slider.value).toBe('65');
  });

  test('shows paused-by-clock indicator', () => {
    renderer.render({ connected: true, state: 'paused', pausedByGameClock: true, volume: 80 });
    expect(container.querySelector('.spotify__clock-paused')).not.toBeNull();
    expect(container.querySelector('.spotify__clock-paused').style.display).not.toBe('none');
  });

  test('no track info shows "No track" placeholder', () => {
    renderer.render({ connected: true, state: 'stopped', volume: 100, track: null });
    expect(container.querySelector('.spotify__track-title').textContent).toContain('No track');
  });

  test('escapes HTML in track title and artist', () => {
    renderer.render({
      connected: true,
      state: 'playing',
      volume: 80,
      track: { title: '<script>alert(1)</script>', artist: 'A&B' }
    });
    const title = container.querySelector('.spotify__track-title');
    expect(title.textContent).toBe('<script>alert(1)</script>');
    expect(title.innerHTML).not.toContain('<script>');
  });

  test('does nothing when container is null', () => {
    const noContainerRenderer = new SpotifyRenderer({ container: null });
    expect(() => noContainerRenderer.render({ connected: true, state: 'playing', volume: 50 })).not.toThrow();
  });

  describe('differential updates', () => {
    const baseState = {
      connected: true,
      state: 'playing',
      volume: 80,
      track: { title: 'Song A', artist: 'Artist A' }
    };

    test('updates only volume when only volume changes', () => {
      renderer.render(baseState);
      const titleEl = container.querySelector('.spotify__track-title');
      const titleBefore = titleEl.textContent;

      const newState = { ...baseState, volume: 50 };
      renderer.render(newState, baseState);

      // Volume updated
      expect(container.querySelector('.spotify__volume-slider').value).toBe('50');
      expect(container.querySelector('.spotify__volume-value').textContent).toBe('50%');
      // Title unchanged (same reference — not rebuilt)
      expect(titleEl.textContent).toBe(titleBefore);
      expect(container.querySelector('.spotify__track-title')).toBe(titleEl);
    });

    test('swaps play/pause button on state change', () => {
      renderer.render(baseState);
      expect(container.querySelector('[data-action="admin.spotifyPause"]')).not.toBeNull();

      const pausedState = { ...baseState, state: 'paused' };
      renderer.render(pausedState, baseState);
      expect(container.querySelector('[data-action="admin.spotifyPlay"]')).not.toBeNull();
      expect(container.querySelector('[data-action="admin.spotifyPause"]')).toBeNull();
    });

    test('updates track info on track change', () => {
      renderer.render(baseState);
      const newState = { ...baseState, track: { title: 'Song B', artist: 'Artist B' } };
      renderer.render(newState, baseState);
      expect(container.querySelector('.spotify__track-title').textContent).toBe('Song B');
      expect(container.querySelector('.spotify__track-artist').textContent).toBe('Artist B');
    });

    test('toggles disabled state when connected changes', () => {
      renderer.render(baseState);
      const buttons = container.querySelectorAll('button');
      buttons.forEach(btn => expect(btn.disabled).toBe(false));

      const disconnected = { connected: false, state: 'stopped', volume: 100 };
      renderer.render(disconnected, baseState);
      const buttonsAfter = container.querySelectorAll('button');
      buttonsAfter.forEach(btn => expect(btn.disabled).toBe(true));
    });

    test('preserves DOM element references across updates', () => {
      renderer.render(baseState);
      const sliderBefore = container.querySelector('.spotify__volume-slider');
      const titleBefore = container.querySelector('.spotify__track-title');

      const newState = { ...baseState, volume: 30 };
      renderer.render(newState, baseState);

      // Same DOM nodes — not rebuilt
      expect(container.querySelector('.spotify__volume-slider')).toBe(sliderBefore);
      expect(container.querySelector('.spotify__track-title')).toBe(titleBefore);
    });

    test('hides artist span when artist becomes empty', () => {
      renderer.render(baseState);
      expect(container.querySelector('.spotify__track-artist').style.display).not.toBe('none');

      const noArtist = { ...baseState, track: { title: 'Song A', artist: '' } };
      renderer.render(noArtist, baseState);
      expect(container.querySelector('.spotify__track-artist').style.display).toBe('none');
    });

    test('toggles pausedByGameClock indicator', () => {
      renderer.render(baseState);
      expect(container.querySelector('.spotify__clock-paused').style.display).toBe('none');

      const paused = { ...baseState, pausedByGameClock: true };
      renderer.render(paused, baseState);
      expect(container.querySelector('.spotify__clock-paused').style.display).not.toBe('none');
    });
  });

  describe('volume drag protection', () => {
    test('skips volume update during pointer drag', () => {
      const state = { connected: true, state: 'playing', volume: 80 };
      renderer.render(state);
      const slider = container.querySelector('.spotify__volume-slider');

      // Simulate pointer down (start drag)
      slider.dispatchEvent(new Event('pointerdown'));

      // Render with new volume
      const newState = { ...state, volume: 30 };
      renderer.render(newState, state);

      // Volume slider NOT updated (still 80)
      expect(slider.value).toBe('80');

      // Simulate pointer up (end drag)
      slider.dispatchEvent(new Event('pointerup'));

      // Now update should apply
      renderer.render(newState, state);
      expect(slider.value).toBe('30');
    });
  });

  describe('renderDucking', () => {
    beforeEach(() => {
      // Render connected state first so spotify container exists
      renderer.render({ connected: true, state: 'playing', volume: 80, track: { title: 'Song' } });
    });

    test('shows ducking indicator when ducked', () => {
      renderer.renderDucking({ ducked: true, volume: 20, activeSources: ['video'] });
      const indicator = document.getElementById('spotify-ducking-indicator');
      expect(indicator).toBeTruthy();
      expect(indicator.textContent).toContain('video');
      expect(indicator.style.display).toBe('block');
    });

    test('hides ducking indicator when not ducked', () => {
      renderer.renderDucking({ ducked: true, volume: 20, activeSources: ['video'] });
      renderer.renderDucking({ ducked: false, volume: 100, activeSources: [] });
      const indicator = document.getElementById('spotify-ducking-indicator');
      expect(indicator.style.display).toBe('none');
    });

    test('does not throw when container is missing', () => {
      const noContainerRenderer = new SpotifyRenderer({ container: null });
      expect(() => noContainerRenderer.renderDucking({ ducked: true, volume: 20 })).not.toThrow();
    });
  });
});
