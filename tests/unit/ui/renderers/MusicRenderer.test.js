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

  test('preserves picker selection when playlist list changes but selected id remains valid', () => {
    // Regression guard: when innerHTML is wiped to rebuild <option>s,
    // <select>.value resets to the first option. Without re-asserting
    // picker.value, the visible selection jumps away from the currently
    // playing playlist even though its id is still in the new option set.
    renderer.render({
      connected: true, state: 'playing', volume: 70,
      playlist: { id: 'b', name: 'B' },
      playlists: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    });
    const picker = container.querySelector('.music__playlist-picker');
    expect(picker.value).toBe('b');

    // Second render — list signature changes ('a' removed, 'c' added) but
    // playlist.id stays 'b' (still in the new option set).
    renderer.render(
      { connected: true, state: 'playing', volume: 70,
        playlist: { id: 'b', name: 'B' },
        playlists: [{ id: 'b', name: 'B' }, { id: 'c', name: 'C' }] },
      { connected: true, state: 'playing', volume: 70,
        playlist: { id: 'b', name: 'B' },
        playlists: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }
    );
    // Picker MUST still show 'b' selected (the playing playlist) even
    // though innerHTML was rebuilt and the id didn't change.
    expect(picker.value).toBe('b');
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

  // ── Queue counter ──────────────────────────────────────────────────────
  describe('queue counter', () => {
    afterEach(() => {
      // Ensure progress timer doesn't leak between tests
      if (renderer._progressTimer) clearInterval(renderer._progressTimer);
    });

    test('shows "Track X of Y" when playlist has tracks', () => {
      renderer.render({
        connected: true, state: 'playing', volume: 70, playlists: [],
        playlist: { id: 'p1', name: 'P1', position: 2, total: 10 },
      });
      const counter = container.querySelector('.music__queue-counter');
      expect(counter).not.toBeNull();
      expect(counter.textContent).toBe('Track 3 of 10');
      expect(counter.style.display).not.toBe('none');
    });

    test('is hidden when no playlist active', () => {
      renderer.render({ connected: true, state: 'stopped', volume: 70, playlists: [] });
      const counter = container.querySelector('.music__queue-counter');
      expect(counter.style.display).toBe('none');
    });

    test('updates differentially when position advances', () => {
      renderer.render({
        connected: true, state: 'playing', volume: 70, playlists: [],
        playlist: { id: 'p1', name: 'P1', position: 0, total: 5 },
      });
      renderer.render({
        connected: true, state: 'playing', volume: 70, playlists: [],
        playlist: { id: 'p1', name: 'P1', position: 2, total: 5 },
      }, {
        connected: true, state: 'playing', volume: 70, playlists: [],
        playlist: { id: 'p1', name: 'P1', position: 0, total: 5 },
      });
      expect(container.querySelector('.music__queue-counter').textContent).toBe('Track 3 of 5');
    });
  });

  // ── Progress bar (client-side extrapolation) ─────────────────────────
  describe('progress bar', () => {
    afterEach(() => {
      if (renderer._progressTimer) clearInterval(renderer._progressTimer);
      jest.useRealTimers();
    });

    test('renders initial position and duration', () => {
      renderer.render({
        connected: true, state: 'paused', volume: 70, playlists: [],
        track: { title: 'A', artist: '', position: 30, duration: 180 },
      });
      expect(container.querySelector('.music__time-current').textContent).toBe('0:30');
      expect(container.querySelector('.music__time-duration').textContent).toBe('3:00');
      const fill = container.querySelector('.music__progress-fill');
      // 30/180 = ~16.67%
      expect(parseFloat(fill.style.width)).toBeCloseTo(16.67, 1);
    });

    test('extrapolates position via 250ms timer while playing', () => {
      jest.useFakeTimers();
      const startTime = Date.now();
      jest.setSystemTime(startTime);
      renderer.render({
        connected: true, state: 'playing', volume: 70, playlists: [],
        track: { title: 'A', artist: '', position: 10, duration: 100 },
      });
      // Advance 2 seconds — display should now read ~0:12 (10 + 2)
      jest.setSystemTime(startTime + 2000);
      jest.advanceTimersByTime(250);
      expect(container.querySelector('.music__time-current').textContent).toBe('0:12');
    });

    test('freezes position when paused', () => {
      jest.useFakeTimers();
      const startTime = Date.now();
      jest.setSystemTime(startTime);
      renderer.render({
        connected: true, state: 'playing', volume: 70, playlists: [],
        track: { title: 'A', artist: '', position: 5, duration: 60 },
      });
      jest.setSystemTime(startTime + 3000);
      jest.advanceTimersByTime(250);
      // Switch to paused
      renderer.render(
        { connected: true, state: 'paused', volume: 70, playlists: [],
          track: { title: 'A', artist: '', position: 5, duration: 60 } },
        { connected: true, state: 'playing', volume: 70, playlists: [],
          track: { title: 'A', artist: '', position: 5, duration: 60 } }
      );
      const frozen = container.querySelector('.music__time-current').textContent;
      // Now wait 5 more seconds — display should NOT advance
      jest.setSystemTime(startTime + 8000);
      jest.advanceTimersByTime(1000);
      expect(container.querySelector('.music__time-current').textContent).toBe(frozen);
    });

    test('resets extrapolation when track changes', () => {
      jest.useFakeTimers();
      const startTime = Date.now();
      jest.setSystemTime(startTime);
      renderer.render({
        connected: true, state: 'playing', volume: 70, playlists: [],
        track: { title: 'A', artist: '', file: 'a.mp3', position: 50, duration: 60 },
      });
      jest.setSystemTime(startTime + 5000);
      jest.advanceTimersByTime(250);
      // New track starts
      renderer.render(
        { connected: true, state: 'playing', volume: 70, playlists: [],
          track: { title: 'B', artist: '', file: 'b.mp3', position: 0, duration: 90 } },
        { connected: true, state: 'playing', volume: 70, playlists: [],
          track: { title: 'A', artist: '', file: 'a.mp3', position: 50, duration: 60 } }
      );
      expect(container.querySelector('.music__time-current').textContent).toBe('0:00');
      expect(container.querySelector('.music__time-duration').textContent).toBe('1:30');
    });

    test('caps position at duration', () => {
      jest.useFakeTimers();
      const startTime = Date.now();
      jest.setSystemTime(startTime);
      renderer.render({
        connected: true, state: 'playing', volume: 70, playlists: [],
        track: { title: 'A', artist: '', position: 50, duration: 60 },
      });
      // Advance way past duration
      jest.setSystemTime(startTime + 30000);
      jest.advanceTimersByTime(250);
      expect(container.querySelector('.music__time-current').textContent).toBe('1:00');
      const fill = container.querySelector('.music__progress-fill');
      expect(parseFloat(fill.style.width)).toBe(100);
    });

    test('formatTime handles invalid input', () => {
      expect(renderer._formatTime(NaN)).toBe('0:00');
      expect(renderer._formatTime(-1)).toBe('0:00');
      expect(renderer._formatTime(undefined)).toBe('0:00');
      expect(renderer._formatTime(65)).toBe('1:05');
      expect(renderer._formatTime(125)).toBe('2:05');
    });
  });
});
