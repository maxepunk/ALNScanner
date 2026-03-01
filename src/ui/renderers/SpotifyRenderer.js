import { escapeHtml } from '../../utils/escapeHtml.js';

/**
 * SpotifyRenderer - Differential DOM Rendering for Spotify Status & Controls
 *
 * First render builds full DOM and caches element references.
 * Subsequent renders diff state vs prev, updating only changed elements.
 * Volume slider is protected during user drag (pointer capture).
 */
export class SpotifyRenderer {
  constructor(elements = {}) {
    this.container = elements.container || document.getElementById('now-playing-section');
    this._els = null;
    this._volumeDragging = false;
  }

  /**
   * Render Spotify state (differential)
   * @param {Object} state - { connected, state, volume, pausedByGameClock, track }
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
    const volume = state.volume ?? 100;

    this.container.innerHTML = `
      <div class="spotify spotify--connected ${isPlaying ? 'spotify--playing' : 'spotify--paused'}">
        <div class="spotify__clock-paused" style="${state.pausedByGameClock ? '' : 'display:none'}">Paused by Game Clock</div>
        <div class="spotify__track">
          <span class="spotify__track-title">${escapeHtml(title)}</span>
          <span class="spotify__track-artist"${artist ? '' : ' style="display:none"'}>${escapeHtml(artist)}</span>
        </div>
        <div class="spotify__controls">
          <button class="btn btn-sm btn-icon" data-action="admin.spotifyPrevious" title="Previous"${disabled}>&#9664;&#9664;</button>
          ${isPlaying
            ? `<button class="btn btn-sm btn-icon spotify__play-btn" data-action="admin.spotifyPause" title="Pause"${disabled}>&#10074;&#10074;</button>`
            : `<button class="btn btn-sm btn-icon spotify__play-btn" data-action="admin.spotifyPlay" title="Play"${disabled}>&#9654;</button>`
          }
          <button class="btn btn-sm btn-icon" data-action="admin.spotifyNext" title="Next"${disabled}>&#9654;&#9654;</button>
          <button class="btn btn-sm btn-icon" data-action="admin.spotifyStop" title="Stop"${disabled}>&#9632;</button>
        </div>
        <div class="spotify__volume">
          <label class="spotify__volume-label">Vol</label>
          <input type="range" class="spotify__volume-slider"
            min="0" max="100" value="${volume}"
            data-action="admin.spotifySetVolume"
            title="Volume: ${volume}%">
          <span class="spotify__volume-value">${volume}%</span>
        </div>
      </div>
    `;

    this._els = {
      root: this.container.querySelector('.spotify'),
      clockPaused: this.container.querySelector('.spotify__clock-paused'),
      trackTitle: this.container.querySelector('.spotify__track-title'),
      trackArtist: this.container.querySelector('.spotify__track-artist'),
      playBtn: this.container.querySelector('.spotify__play-btn'),
      prevBtn: this.container.querySelector('[data-action="admin.spotifyPrevious"]'),
      nextBtn: this.container.querySelector('[data-action="admin.spotifyNext"]'),
      stopBtn: this.container.querySelector('[data-action="admin.spotifyStop"]'),
      volumeSlider: this.container.querySelector('.spotify__volume-slider'),
      volumeValue: this.container.querySelector('.spotify__volume-value'),
    };

    // Wire volume drag protection
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
    const wasPlaying = prev?.state === 'playing';
    const track = state.track || {};
    const prevTrack = prev?.track || {};

    // Play state or connected state changed → update controls
    if (state.state !== prev?.state || connected !== wasConnected) {
      this._els.root.classList.toggle('spotify--playing', isPlaying);
      this._els.root.classList.toggle('spotify--paused', !isPlaying);

      // Swap play/pause button content and action
      this._els.playBtn.setAttribute('data-action', isPlaying ? 'admin.spotifyPause' : 'admin.spotifyPlay');
      this._els.playBtn.setAttribute('title', isPlaying ? 'Pause' : 'Play');
      this._els.playBtn.innerHTML = isPlaying ? '&#10074;&#10074;' : '&#9654;';
    }

    // Disabled state changed
    if (connected !== wasConnected) {
      const buttons = [this._els.prevBtn, this._els.playBtn, this._els.nextBtn, this._els.stopBtn];
      buttons.forEach(btn => { btn.disabled = !connected; });
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
      const vol = state.volume ?? 100;
      this._els.volumeSlider.value = vol;
      this._els.volumeSlider.title = `Volume: ${vol}%`;
      this._els.volumeValue.textContent = `${vol}%`;
    }

    // pausedByGameClock changed
    if (state.pausedByGameClock !== prev?.pausedByGameClock) {
      this._els.clockPaused.style.display = state.pausedByGameClock ? '' : 'none';
    }
  }

  /**
   * Render ducking status indicator
   * @param {Object} duckingState - { ducked, volume, activeSources }
   */
  renderDucking(duckingState) {
    if (!this.container) return;

    let indicator = document.getElementById('spotify-ducking-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'spotify-ducking-indicator';
      indicator.className = 'spotify__ducking-indicator';
      this.container.appendChild(indicator);
    }

    if (duckingState?.ducked) {
      const sources = duckingState.activeSources?.join(', ') || 'system';
      indicator.textContent = `Volume reduced (${sources} playing)`;
      indicator.style.display = 'block';
    } else {
      indicator.style.display = 'none';
    }
  }

}
