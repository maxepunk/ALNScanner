import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StateStore } from '../../../src/core/stateStore.js';

describe('StateStore', () => {
  let store;

  beforeEach(() => {
    store = new StateStore();
  });

  describe('constructor', () => {
    it('should create empty store', () => {
      expect(store.getAll()).toEqual({});
    });

    it('should return null for unknown domains', () => {
      expect(store.get('spotify')).toBeNull();
    });
  });

  describe('update()', () => {
    it('should store state for a domain', () => {
      store.update('spotify', { connected: true, state: 'Playing' });
      expect(store.get('spotify')).toEqual({ connected: true, state: 'Playing' });
    });

    it('should shallow-merge new state into existing domain state', () => {
      store.update('spotify', { connected: true, state: 'Playing' });
      store.update('spotify', { volume: 65 });
      expect(store.get('spotify')).toEqual({ connected: true, state: 'Playing', volume: 65 });
    });

    it('should store previous state', () => {
      store.update('spotify', { state: 'Playing' });
      store.update('spotify', { state: 'Paused' });

      // Verify via listener that prev was the old state
      const cb = jest.fn();
      store.on('spotify', cb);
      store.update('spotify', { state: 'Stopped' });
      expect(cb).toHaveBeenCalledWith(
        { state: 'Stopped' },
        { state: 'Paused' }
      );
    });

    it('should set prev to null on first update', () => {
      const cb = jest.fn();
      store.on('spotify', cb);
      store.update('spotify', { connected: true });
      expect(cb).toHaveBeenCalledWith({ connected: true }, null);
    });
  });

  describe('on() / off()', () => {
    it('should call subscriber when domain updates', () => {
      const cb = jest.fn();
      store.on('spotify', cb);
      store.update('spotify', { state: 'Playing' });
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith({ state: 'Playing' }, null);
    });

    it('should not call subscriber for other domains', () => {
      const cb = jest.fn();
      store.on('spotify', cb);
      store.update('video', { status: 'idle' });
      expect(cb).not.toHaveBeenCalled();
    });

    it('should support multiple subscribers for one domain', () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      store.on('health', cb1);
      store.on('health', cb2);
      store.update('health', { vlc: 'healthy' });
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it('should unsubscribe with off()', () => {
      const cb = jest.fn();
      store.on('spotify', cb);
      store.off('spotify', cb);
      store.update('spotify', { state: 'Playing' });
      expect(cb).not.toHaveBeenCalled();
    });

    it('should handle off() for non-existent domain gracefully', () => {
      const cb = jest.fn();
      expect(() => store.off('nonexistent', cb)).not.toThrow();
    });
  });

  describe('get() / getAll()', () => {
    it('should return current state for domain', () => {
      store.update('video', { status: 'playing', currentVideo: 'jaw011.mp4' });
      expect(store.get('video')).toEqual({ status: 'playing', currentVideo: 'jaw011.mp4' });
    });

    it('should return snapshot of all domains', () => {
      store.update('spotify', { state: 'Playing' });
      store.update('health', { vlc: 'healthy' });
      const all = store.getAll();
      expect(all).toEqual({
        spotify: { state: 'Playing' },
        health: { vlc: 'healthy' },
      });
    });

    it('should return a copy from getAll() (not internal reference)', () => {
      store.update('spotify', { state: 'Playing' });
      const all = store.getAll();
      all.spotify = 'tampered';
      expect(store.get('spotify')).toEqual({ state: 'Playing' });
    });

    it('should return a copy from get() (not internal reference)', () => {
      store.update('spotify', { state: 'Playing', volume: 65 });
      const state = store.get('spotify');
      state.volume = 0;  // Mutate the returned copy
      expect(store.get('spotify').volume).toBe(65);  // Internal state unchanged
    });
  });

  describe('rapid updates', () => {
    it('should emit for each update with correct prev', () => {
      const calls = [];
      store.on('spotify', (state, prev) => calls.push({ state: { ...state }, prev }));

      store.update('spotify', { state: 'Playing' });
      store.update('spotify', { state: 'Paused' });
      store.update('spotify', { state: 'Stopped' });

      expect(calls).toHaveLength(3);
      expect(calls[0]).toEqual({ state: { state: 'Playing' }, prev: null });
      expect(calls[1]).toEqual({ state: { state: 'Paused' }, prev: { state: 'Playing' } });
      expect(calls[2]).toEqual({ state: { state: 'Stopped' }, prev: { state: 'Paused' } });
    });
  });

  describe('error isolation', () => {
    it('should continue calling remaining listeners if one throws', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const badCb = jest.fn(() => { throw new Error('listener broke'); });
      const goodCb = jest.fn();

      store.on('spotify', badCb);
      store.on('spotify', goodCb);

      store.update('spotify', { state: 'Playing' });

      expect(badCb).toHaveBeenCalledTimes(1);
      expect(goodCb).toHaveBeenCalledTimes(1);
      expect(errSpy).toHaveBeenCalledWith(
        'StateStore listener error [spotify]:',
        expect.any(Error)
      );

      errSpy.mockRestore();
    });
  });

  describe('cross-domain isolation', () => {
    it('should not trigger spotify listener on video update', () => {
      const spotifyCb = jest.fn();
      const videoCb = jest.fn();
      store.on('spotify', spotifyCb);
      store.on('video', videoCb);

      store.update('video', { status: 'playing' });

      expect(spotifyCb).not.toHaveBeenCalled();
      expect(videoCb).toHaveBeenCalledTimes(1);
    });

    it('should maintain independent state per domain', () => {
      store.update('spotify', { state: 'Playing' });
      store.update('video', { status: 'idle' });

      expect(store.get('spotify')).toEqual({ state: 'Playing' });
      expect(store.get('video')).toEqual({ status: 'idle' });
    });
  });
});
