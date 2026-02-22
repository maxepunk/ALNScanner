import { UnifiedDataManager } from '../../../src/core/unifiedDataManager.js';

describe('UnifiedDataManager - Spotify State', () => {
  let dm;

  beforeEach(() => {
    dm = new UnifiedDataManager();
  });

  test('initial spotify state is disconnected', () => {
    const state = dm.getSpotifyState();
    expect(state.connected).toBe(false);
    expect(state.state).toBe('stopped');
  });

  test('updateSpotifyState updates and dispatches event', (done) => {
    dm.addEventListener('spotify-state:updated', (e) => {
      expect(e.detail.connected).toBe(true);
      expect(e.detail.state).toBe('playing');
      expect(e.detail.track.title).toBe('Bohemian Rhapsody');
      done();
    });

    dm.updateSpotifyState({
      connected: true,
      state: 'playing',
      volume: 80,
      pausedByGameClock: false,
      track: { title: 'Bohemian Rhapsody', artist: 'Queen' }
    });
  });

  test('updateSpotifyState merges partial updates', () => {
    dm.updateSpotifyState({ connected: true, state: 'playing', volume: 80 });
    dm.updateSpotifyState({ state: 'paused' });

    const state = dm.getSpotifyState();
    expect(state.connected).toBe(true); // Preserved
    expect(state.state).toBe('paused'); // Updated
    expect(state.volume).toBe(80);      // Preserved
  });
});
