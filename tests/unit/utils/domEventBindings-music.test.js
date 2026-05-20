/**
 * domEventBindings - Music Action Tests
 *
 * Mirrors the spotify-actions test suite for the music (MPD) controls:
 * - Transport clicks (play/pause/stop/next/previous)
 * - Volume slider with debounce
 * - Checkbox toggles for shuffle/loop (boolean payload)
 * - Playlist picker (<select> change → loadPlaylist)
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import { bindDOMEvents } from '../../../src/utils/domEventBindings.js';

describe('domEventBindings - music actions', () => {
  const mockMusicController = {
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    next: jest.fn(),
    previous: jest.fn(),
    setVolume: jest.fn(),
    setShuffle: jest.fn(),
    setLoop: jest.fn(),
    loadPlaylist: jest.fn(),
  };

  const mockAdminController = {
    initialized: true,
    getModule: jest.fn((name) => (name === 'musicController' ? mockMusicController : {})),
  };

  const mockApp = {
    networkedSession: {
      getService: jest.fn(() => mockAdminController),
    },
  };

  const mockDebug = { log: jest.fn() };

  beforeAll(() => {
    jest.useFakeTimers();
    bindDOMEvents(mockApp, {}, {}, mockDebug, {}, {}, {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminController.initialized = true;
    mockApp.networkedSession = { getService: jest.fn(() => mockAdminController) };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  function clickAction(el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  function inputAction(el) { el.dispatchEvent(new Event('input', { bubbles: true })); }
  function changeAction(el) { el.dispatchEvent(new Event('change', { bubbles: true })); }

  it.each([
    ['musicPlay', 'play'],
    ['musicPause', 'pause'],
    ['musicStop', 'stop'],
    ['musicNext', 'next'],
    ['musicPrevious', 'previous'],
  ])('click %s calls musicController.%s', (action, method) => {
    const btn = document.createElement('button');
    btn.dataset.action = `admin.${action}`;
    document.body.appendChild(btn);
    clickAction(btn);
    expect(mockMusicController[method]).toHaveBeenCalled();
  });

  it('musicSetVolume slider input is debounced (150ms)', () => {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.dataset.action = 'admin.musicSetVolume';
    slider.value = '60';
    document.body.appendChild(slider);

    inputAction(slider);
    expect(mockMusicController.setVolume).not.toHaveBeenCalled();
    jest.advanceTimersByTime(150);
    expect(mockMusicController.setVolume).toHaveBeenCalledWith(60);
  });

  it('musicSetVolume debounces rapid slider movements', () => {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.dataset.action = 'admin.musicSetVolume';
    document.body.appendChild(slider);

    slider.value = '30'; inputAction(slider); jest.advanceTimersByTime(50);
    slider.value = '55'; inputAction(slider); jest.advanceTimersByTime(50);
    slider.value = '80'; inputAction(slider);

    expect(mockMusicController.setVolume).not.toHaveBeenCalled();
    jest.advanceTimersByTime(150);
    expect(mockMusicController.setVolume).toHaveBeenCalledTimes(1);
    expect(mockMusicController.setVolume).toHaveBeenCalledWith(80);
  });

  it('musicSetShuffle dispatches with checked=true on change event', () => {
    // jsdom (and real browsers) toggle a checkbox's `checked` on click before
    // firing 'change'. Dispatch the change event directly with checked set
    // to the desired post-click value — same semantics as a real user click.
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.action = 'admin.musicSetShuffle';
    box.checked = true;
    document.body.appendChild(box);
    changeAction(box);
    expect(mockMusicController.setShuffle).toHaveBeenCalledWith(true);
  });

  it('musicSetLoop dispatches with checked=false on change event', () => {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.action = 'admin.musicSetLoop';
    box.checked = false;
    document.body.appendChild(box);
    changeAction(box);
    expect(mockMusicController.setLoop).toHaveBeenCalledWith(false);
  });

  it('musicLoadPlaylist dispatches on select change with playlistId', () => {
    const sel = document.createElement('select');
    sel.dataset.action = 'admin.musicLoadPlaylist';
    const opt = document.createElement('option');
    opt.value = 'all-tracks';
    sel.appendChild(opt);
    sel.value = 'all-tracks';
    document.body.appendChild(sel);

    changeAction(sel);
    expect(mockMusicController.loadPlaylist).toHaveBeenCalledWith('all-tracks');
  });

  it('musicLoadPlaylist is a no-op when no value is selected', () => {
    const sel = document.createElement('select');
    sel.dataset.action = 'admin.musicLoadPlaylist';
    sel.value = '';
    document.body.appendChild(sel);
    changeAction(sel);
    expect(mockMusicController.loadPlaylist).not.toHaveBeenCalled();
  });
});
