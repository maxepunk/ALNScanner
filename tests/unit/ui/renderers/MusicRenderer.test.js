import { MusicRenderer } from '../../../../src/ui/renderers/MusicRenderer.js';

describe('MusicRenderer', () => {
  let container;
  let renderer;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'music-section';
    document.body.appendChild(container);
    renderer = new MusicRenderer({ container });
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  test('renders disabled controls when disconnected', () => {
    renderer.render({ connected: false, state: 'stopped', volume: 70, playlists: [] });
    expect(container.querySelector('.music--connected')).not.toBeNull();
    container.querySelectorAll('button, select, input').forEach(el => {
      expect(el.disabled).toBe(true);
    });
  });

  test('renders connected playing state with pause button', () => {
    renderer.render({
      connected: true, state: 'playing', volume: 80,
      track: { title: 'Song A', artist: 'Artist X' },
      playlists: [{ id: 'p1', name: 'P1' }],
    });
    expect(container.querySelector('[data-action="admin.musicPause"]')).not.toBeNull();
    expect(container.querySelector('[data-action="admin.musicPlay"]')).toBeNull();
    expect(container.querySelector('.music__track-title').textContent).toBe('Song A');
    expect(container.querySelector('.music__track-artist').textContent).toBe('Artist X');
  });

  test('renders paused state with play button', () => {
    renderer.render({ connected: true, state: 'paused', volume: 60, playlists: [] });
    expect(container.querySelector('[data-action="admin.musicPlay"]')).not.toBeNull();
    expect(container.querySelector('[data-action="admin.musicPause"]')).toBeNull();
  });

  test('populates playlist picker from state.playlists', () => {
    renderer.render({
      connected: true, state: 'stopped', volume: 70,
      playlists: [
        { id: 'all-tracks', name: 'All Tracks' },
        { id: 'mood', name: 'Mood' },
      ],
      playlist: { id: 'mood' },
    });
    const picker = container.querySelector('.music__playlist-picker');
    expect(picker.children.length).toBe(2);
    expect(picker.value).toBe('mood');
  });

  test('reflects active playlist shuffle/loop settings on checkboxes', () => {
    renderer.render({
      connected: true, state: 'playing', volume: 70,
      playlist: { id: 'p1', shuffle: true, loop: false },
      playlists: [{ id: 'p1', name: 'P1' }],
    });
    expect(container.querySelector('.music__shuffle').checked).toBe(true);
    expect(container.querySelector('.music__loop').checked).toBe(false);
  });

  test('updates track title differentially on second render', () => {
    renderer.render({ connected: true, state: 'playing', volume: 70,
      track: { title: 'Old', artist: 'A' }, playlists: [] });
    renderer.render(
      { connected: true, state: 'playing', volume: 70, track: { title: 'New', artist: 'A' }, playlists: [] },
      { connected: true, state: 'playing', volume: 70, track: { title: 'Old', artist: 'A' }, playlists: [] }
    );
    expect(container.querySelector('.music__track-title').textContent).toBe('New');
  });

  test('updates volume on second render', () => {
    renderer.render({ connected: true, state: 'playing', volume: 70, playlists: [] });
    renderer.render(
      { connected: true, state: 'playing', volume: 42, playlists: [] },
      { connected: true, state: 'playing', volume: 70, playlists: [] }
    );
    expect(container.querySelector('.music__volume-slider').value).toBe('42');
    expect(container.querySelector('.music__volume-value').textContent).toBe('42%');
  });

  test('rebuilds picker options only when playlists list signature changes', () => {
    renderer.render({ connected: true, state: 'stopped', volume: 70,
      playlists: [{ id: 'a', name: 'A' }] });
    const firstPicker = container.querySelector('.music__playlist-picker');
    // Second render with the SAME playlists — picker should not be wiped.
    // (Implementation detail: signature-keyed rebuild)
    renderer.render(
      { connected: true, state: 'stopped', volume: 70, playlists: [{ id: 'a', name: 'A' }] },
      { connected: true, state: 'stopped', volume: 70, playlists: [{ id: 'a', name: 'A' }] }
    );
    expect(container.querySelector('.music__playlist-picker').children.length).toBe(1);
  });

  test('renderDucking shows + hides ducking indicator', () => {
    renderer.render({ connected: true, state: 'playing', volume: 70, playlists: [] });
    renderer.renderDucking({ ducked: true, volume: 20, activeSources: ['video'] });
    const indicator = document.getElementById('music-ducking-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator.style.display).toBe('block');
    expect(indicator.textContent).toContain('video');

    renderer.renderDucking({ ducked: false });
    expect(indicator.style.display).toBe('none');
  });

  test('shows pausedByGameClock indicator when flag is true', () => {
    renderer.render({
      connected: true, state: 'paused', volume: 70, playlists: [],
      pausedByGameClock: true,
    });
    expect(container.querySelector('.music__clock-paused').style.display).not.toBe('none');
  });

  test('escapes HTML in track title and playlist name', () => {
    renderer.render({
      connected: true, state: 'playing', volume: 70,
      track: { title: '<script>alert(1)</script>', artist: '' },
      playlists: [{ id: 'x', name: '<img onerror=1>' }],
    });
    expect(container.querySelector('.music__track-title').innerHTML)
      .toContain('&lt;script&gt;');
    expect(container.querySelector('.music__playlist-picker').innerHTML)
      .toContain('&lt;img');
  });
});
