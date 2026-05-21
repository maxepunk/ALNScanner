import { escapeHtml } from '../../utils/escapeHtml.js';

/**
 * MusicRenderer - Differential DOM Rendering for Music (MPD) Status & Controls
 *
 * First render builds full DOM and caches element references; subsequent
 * renders diff state vs prev and only update changed elements. Volume
 * slider is protected during user drag.
 *
 * Features:
 *   - Playlist picker (<select>) populated from state.playlists
 *   - Transport controls (play/pause/stop/next/previous)
 *   - Shuffle + Loop toggles
 *   - Volume slider with drag protection
 *   - Ducking indicator
 */
export class MusicRenderer {
  constructor(elements = {}) {
    this.container = elements.container || document.getElementById('music-section');
    this._els = null;
    this._volumeDragging = false;
    this._playlistsSig = null;  // signature of currently-rendered playlist list
  }

  /**
   * Render music state (differential)
   * @param {Object} state - Full music domain state from StateStore
   *   { connected, state, volume, track, playlist, playlists, pausedByGameClock }
   * @param {Object|null} prev - Previous state (null on first render)
   */
  render(state, prev = null) {
    if (!this.container) return;

    if (!this._els) {
      this._buildDOM(state || {});
      return;
    }

    this._updateDOM(state || {}, prev);
  }

  _buildDOM(state) {
    const connected = !!state.connected;
    const disabled = connected ? '' : ' disabled';
    const isPlaying = state.state === 'playing';
    const track = state.track || {};
    const title = track.title || 'No track';
    const artist = track.artist || '';
    const volume = state.volume ?? 70;
    const playlist = state.playlist || {};
    const playlists = Array.isArray(state.playlists) ? state.playlists : [];
    const selectedId = playlist.id || '';
    const shuffleChecked = !!playlist.shuffle;
    const loopChecked = !!playlist.loop;

    this.container.innerHTML = `
      <div class="music music--connected ${isPlaying ? 'music--playing' : 'music--paused'}">
        <div class="music__clock-paused" style="${state.pausedByGameClock ? '' : 'display:none'}">Paused by Game Clock</div>
        <div class="music__playlist-row">
          <label class="music__playlist-label">Playlist</label>
          <select class="music__playlist-picker" data-action="admin.musicLoadPlaylist"${disabled}>
            ${playlists.length === 0
              ? '<option value="">(no playlists)</option>'
              : playlists.map(p =>
                  `<option value="${escapeHtml(p.id)}"${p.id === selectedId ? ' selected' : ''}>${escapeHtml(p.name || p.id)}</option>`
                ).join('')}
          </select>
        </div>
        <div class="music__track">
          <span class="music__track-title">${escapeHtml(title)}</span>
          <span class="music__track-artist"${artist ? '' : ' style="display:none"'}>${escapeHtml(artist)}</span>
        </div>
        <div class="music__controls">
          <button class="btn btn-sm btn-icon" data-action="admin.musicPrevious" title="Previous"${disabled}>&#9664;&#9664;</button>
          ${isPlaying
            ? `<button class="btn btn-sm btn-icon music__play-btn" data-action="admin.musicPause" title="Pause"${disabled}>&#10074;&#10074;</button>`
            : `<button class="btn btn-sm btn-icon music__play-btn" data-action="admin.musicPlay" title="Play"${disabled}>&#9654;</button>`
          }
          <button class="btn btn-sm btn-icon" data-action="admin.musicNext" title="Next"${disabled}>&#9654;&#9654;</button>
          <button class="btn btn-sm btn-icon" data-action="admin.musicStop" title="Stop"${disabled}>&#9632;</button>
        </div>
        <div class="music__toggles">
          <label class="music__toggle">
            <input type="checkbox" class="music__shuffle" data-action="admin.musicSetShuffle" ${shuffleChecked ? 'checked' : ''}${disabled}>
            Shuffle
          </label>
          <label class="music__toggle">
            <input type="checkbox" class="music__loop" data-action="admin.musicSetLoop" ${loopChecked ? 'checked' : ''}${disabled}>
            Loop
          </label>
        </div>
        <div class="music__volume">
          <label class="music__volume-label">Vol</label>
          <input type="range" class="music__volume-slider"
            min="0" max="100" value="${volume}"
            data-action="admin.musicSetVolume"
            title="Volume: ${volume}%"${disabled}>
          <span class="music__volume-value">${volume}%</span>
        </div>
      </div>
    `;

    this._els = {
      root: this.container.querySelector('.music'),
      clockPaused: this.container.querySelector('.music__clock-paused'),
      picker: this.container.querySelector('.music__playlist-picker'),
      trackTitle: this.container.querySelector('.music__track-title'),
      trackArtist: this.container.querySelector('.music__track-artist'),
      playBtn: this.container.querySelector('.music__play-btn'),
      prevBtn: this.container.querySelector('[data-action="admin.musicPrevious"]'),
      nextBtn: this.container.querySelector('[data-action="admin.musicNext"]'),
      stopBtn: this.container.querySelector('[data-action="admin.musicStop"]'),
      shuffle: this.container.querySelector('.music__shuffle'),
      loop: this.container.querySelector('.music__loop'),
      volumeSlider: this.container.querySelector('.music__volume-slider'),
      volumeValue: this.container.querySelector('.music__volume-value'),
    };

    // Cache playlist signature so we only rebuild <option>s when the list changes
    this._playlistsSig = this._signaturePlaylists(playlists);

    // Volume drag protection (so live state pushes don't snap the thumb)
    this._els.volumeSlider.addEventListener('pointerdown', () => {
      this._volumeDragging = true;
    });
    this._els.volumeSlider.addEventListener('pointerup', () => {
      this._volumeDragging = false;
    });
    this._els.volumeSlider.addEventListener('lostpointercapture', () => {
      this._volumeDragging = false;
    });
  }

  _updateDOM(state, prev) {
    const connected = !!state.connected;
    const wasConnected = !!prev?.connected;
    const isPlaying = state.state === 'playing';
    const track = state.track || {};
    const prevTrack = prev?.track || {};
    const playlist = state.playlist || {};
    const prevPlaylist = prev?.playlist || {};
    const playlists = Array.isArray(state.playlists) ? state.playlists : [];

    // Play state changed → swap controls
    if (state.state !== prev?.state || connected !== wasConnected) {
      this._els.root.classList.toggle('music--playing', isPlaying);
      this._els.root.classList.toggle('music--paused', !isPlaying);
      this._els.playBtn.setAttribute('data-action', isPlaying ? 'admin.musicPause' : 'admin.musicPlay');
      this._els.playBtn.setAttribute('title', isPlaying ? 'Pause' : 'Play');
      this._els.playBtn.innerHTML = isPlaying ? '&#10074;&#10074;' : '&#9654;';
    }

    // Connected → enable/disable everything that requires MPD
    if (connected !== wasConnected) {
      const all = [
        this._els.prevBtn, this._els.playBtn, this._els.nextBtn, this._els.stopBtn,
        this._els.picker, this._els.shuffle, this._els.loop, this._els.volumeSlider,
      ];
      all.forEach(el => { el.disabled = !connected; });
    }

    // Track changed
    if (track.title !== prevTrack.title) {
      this._els.trackTitle.textContent = track.title || 'No track';
    }
    if (track.artist !== prevTrack.artist) {
      const artist = track.artist || '';
      this._els.trackArtist.textContent = artist;
      this._els.trackArtist.style.display = artist ? '' : 'none';
    }

    // Volume changed (skip if user is dragging)
    if (!this._volumeDragging && state.volume !== prev?.volume) {
      const vol = state.volume ?? 70;
      this._els.volumeSlider.value = vol;
      this._els.volumeSlider.title = `Volume: ${vol}%`;
      this._els.volumeValue.textContent = `${vol}%`;
    }

    // pausedByGameClock changed
    if (state.pausedByGameClock !== prev?.pausedByGameClock) {
      this._els.clockPaused.style.display = state.pausedByGameClock ? '' : 'none';
    }

    // Shuffle/loop reflect the ACTIVE playlist's current settings
    if (playlist.shuffle !== prevPlaylist.shuffle) {
      this._els.shuffle.checked = !!playlist.shuffle;
    }
    if (playlist.loop !== prevPlaylist.loop) {
      this._els.loop.checked = !!playlist.loop;
    }

    // Playlist list — only rebuild <option>s if signature changed
    const sig = this._signaturePlaylists(playlists);
    const rebuilt = sig !== this._playlistsSig;
    if (rebuilt) {
      this._els.picker.innerHTML = playlists.length === 0
        ? '<option value="">(no playlists)</option>'
        : playlists.map(p =>
            `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name || p.id)}</option>`
          ).join('');
      this._playlistsSig = sig;
    }

    // Restore selection. We must do this in BOTH cases:
    //   - Selected playlist changed (obvious)
    //   - List signature changed but playlist.id didn't (innerHTML wipe
    //     resets <select>.value to the first option; without re-asserting,
    //     the picker visually jumps off the currently-playing playlist)
    if (rebuilt || playlist.id !== prevPlaylist.id) {
      this._els.picker.value = playlist.id || '';
    }
  }

  /**
   * Render ducking status indicator.
   * @param {Object} duckingState - { ducked, volume, activeSources }
   */
  renderDucking(duckingState) {
    if (!this.container) return;

    let indicator = document.getElementById('music-ducking-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'music-ducking-indicator';
      indicator.className = 'music__ducking-indicator';
      this.container.appendChild(indicator);
    }

    if (duckingState?.ducked) {
      const sources = duckingState.activeSources?.join(', ') || 'system';
      indicator.textContent = `Music ducked (${sources} playing)`;
      indicator.style.display = 'block';
    } else {
      indicator.style.display = 'none';
    }
  }

  _signaturePlaylists(playlists) {
    // JSON.stringify avoids separator-collision: a playlist name containing
    // '|' or ',' would otherwise produce ambiguous signatures and skip
    // legitimate rebuilds.
    return JSON.stringify(playlists.map(p => [p.id, p.name || '']));
  }
}

export default MusicRenderer;
