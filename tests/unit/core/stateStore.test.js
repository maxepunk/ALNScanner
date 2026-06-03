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
      expect(store.get('music')).toBeNull();
    });
  });

  describe('update()', () => {
    it('should store state for a domain', () => {
      store.update('music', { connected: true, state: 'Playing' });
      expect(store.get('music')).toEqual({ connected: true, state: 'Playing' });
    });

    it('should shallow-merge new state into existing domain state', () => {
      store.update('music', { connected: true, state: 'Playing' });
      store.update('music', { volume: 65 });
      expect(store.get('music')).toEqual({ connected: true, state: 'Playing', volume: 65 });
    });

    it('should store previous state', () => {
      store.update('music', { state: 'Playing' });
      store.update('music', { state: 'Paused' });

      // Verify via listener that prev was the old state
      const cb = jest.fn();
      store.on('music', cb);
      store.update('music', { state: 'Stopped' });
      expect(cb).toHaveBeenCalledWith(
        { state: 'Stopped' },
        { state: 'Paused' }
      );
    });

    it('should set prev to null on first update', () => {
      const cb = jest.fn();
      store.on('music', cb);
      store.update('music', { connected: true });
      expect(cb).toHaveBeenCalledWith({ connected: true }, null);
    });
  });

  describe('on() / off()', () => {
    it('should call subscriber when domain updates', () => {
      const cb = jest.fn();
      store.on('music', cb);
      store.update('music', { state: 'Playing' });
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith({ state: 'Playing' }, null);
    });

    it('should not call subscriber for other domains', () => {
      const cb = jest.fn();
      store.on('music', cb);
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
      store.on('music', cb);
      store.off('music', cb);
      store.update('music', { state: 'Playing' });
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
      store.update('music', { state: 'Playing' });
      store.update('health', { vlc: 'healthy' });
      const all = store.getAll();
      expect(all).toEqual({
        music: { state: 'Playing' },
        health: { vlc: 'healthy' },
      });
    });

    it('should return a copy from getAll() (not internal reference)', () => {
      store.update('music', { state: 'Playing' });
      const all = store.getAll();
      all.music = 'tampered';
      expect(store.get('music')).toEqual({ state: 'Playing' });
    });

    it('should return a copy from get() (not internal reference)', () => {
      store.update('music', { state: 'Playing', volume: 65 });
      const state = store.get('music');
      state.volume = 0;  // Mutate the returned copy
      expect(store.get('music').volume).toBe(65);  // Internal state unchanged
    });

    it('should deep-copy nested objects from get() (SSR-3)', () => {
      store.update('video', { queue: [{ id: 'a' }, { id: 'b' }] });
      const copy = store.get('video');
      copy.queue.push({ id: 'c' });
      copy.queue[0].id = 'mutated';
      expect(store.get('video').queue).toEqual([{ id: 'a' }, { id: 'b' }]);
    });

    it('should deep-copy nested objects from getAll() (SSR-3)', () => {
      store.update('health', { vlc: { status: 'healthy' } });
      const all = store.getAll();
      all.health.vlc.status = 'down';
      expect(store.get('health')).toEqual({ vlc: { status: 'healthy' } });
    });
  });

  describe('rapid updates', () => {
    it('should emit for each update with correct prev', () => {
      const calls = [];
      store.on('music', (state, prev) => calls.push({ state: { ...state }, prev }));

      store.update('music', { state: 'Playing' });
      store.update('music', { state: 'Paused' });
      store.update('music', { state: 'Stopped' });

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

      store.on('music', badCb);
      store.on('music', goodCb);

      store.update('music', { state: 'Playing' });

      expect(badCb).toHaveBeenCalledTimes(1);
      expect(goodCb).toHaveBeenCalledTimes(1);
      expect(errSpy).toHaveBeenCalledWith(
        'StateStore listener error [music]:',
        expect.any(Error)
      );

      errSpy.mockRestore();
    });
  });

  describe('cross-domain isolation', () => {
    it('should not trigger music listener on video update', () => {
      const musicCb = jest.fn();
      const videoCb = jest.fn();
      store.on('music', musicCb);
      store.on('video', videoCb);

      store.update('video', { status: 'playing' });

      expect(musicCb).not.toHaveBeenCalled();
      expect(videoCb).toHaveBeenCalledTimes(1);
    });

    it('should maintain independent state per domain', () => {
      store.update('music', { state: 'Playing' });
      store.update('video', { status: 'idle' });

      expect(store.get('music')).toEqual({ state: 'Playing' });
      expect(store.get('video')).toEqual({ status: 'idle' });
    });
  });

  describe('replace() — full-domain replacement (SSR-2)', () => {
    it('should drop keys absent from the new state (no orphan merge)', () => {
      store.update('gameclock', { status: 'running', elapsed: 10, startTime: 123, totalPausedMs: 0 });
      store.replace('gameclock', { status: 'paused', elapsed: 10, expectedDuration: 7200 });
      expect(store.get('gameclock')).toEqual({ status: 'paused', elapsed: 10, expectedDuration: 7200 });
    });

    it('should notify listeners with the replaced state and prev', () => {
      store.update('video', { nowPlaying: 'a.mp4', isPlaying: true });
      const cb = jest.fn();
      store.on('video', cb);
      store.replace('video', { isPlaying: false });
      expect(cb).toHaveBeenCalledWith({ isPlaying: false }, { nowPlaying: 'a.mp4', isPlaying: true });
    });

    it('should not notify when the replacement is shallow-equal', () => {
      store.update('audio', { sink: 'hdmi' });
      const cb = jest.fn();
      store.on('audio', cb);
      store.replace('audio', { sink: 'hdmi' });
      expect(cb).not.toHaveBeenCalled();
    });
  });
});
