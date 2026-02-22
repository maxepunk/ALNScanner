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

  test('renders disconnected state with reconnect button', () => {
    renderer.render({ connected: false, state: 'stopped', volume: 100 });
    expect(container.querySelector('.spotify--disconnected')).not.toBeNull();
    expect(container.querySelector('[data-action="admin.spotifyReconnect"]')).not.toBeNull();
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
});
