/**
 * SpotifyRenderer - DOM Rendering for Spotify Status & Controls
 * Follows same pattern as CueRenderer, EnvironmentRenderer, etc.
 */
export class SpotifyRenderer {
  constructor(elements = {}) {
    this.container = elements.container || document.getElementById('now-playing-section');
  }

  /**
   * Render Spotify state
   * @param {Object} state - { connected, state, volume, pausedByGameClock, track }
   */
  render(state) {
    if (!this.container) return;

    if (!state || !state.connected) {
      this._renderDisconnected();
      return;
    }

    this._renderConnected(state);
  }

  _renderDisconnected() {
    this.container.innerHTML = `
      <div class="spotify spotify--disconnected">
        <div class="spotify__status">
          <span class="spotify__status-icon">&#9679;</span>
          <span class="spotify__status-text">Spotify Disconnected</span>
        </div>
        <button class="btn btn-sm" data-action="admin.spotifyReconnect">
          Reconnect
        </button>
      </div>
    `;
  }

  _renderConnected(state) {
    const isPlaying = state.state === 'playing';
    const track = state.track || {};
    const title = track.title || 'No track';
    const artist = track.artist || '';
    const volume = state.volume ?? 100;

    this.container.innerHTML = `
      <div class="spotify spotify--connected ${isPlaying ? 'spotify--playing' : 'spotify--paused'}">
        ${state.pausedByGameClock ? '<div class="spotify__clock-paused">Paused by Game Clock</div>' : ''}
        <div class="spotify__track">
          <span class="spotify__track-title">${this._escapeHtml(title)}</span>
          ${artist ? `<span class="spotify__track-artist">${this._escapeHtml(artist)}</span>` : ''}
        </div>
        <div class="spotify__controls">
          <button class="btn btn-sm btn-icon" data-action="admin.spotifyPrevious" title="Previous">&#9664;&#9664;</button>
          ${isPlaying
            ? '<button class="btn btn-sm btn-icon" data-action="admin.spotifyPause" title="Pause">&#10074;&#10074;</button>'
            : '<button class="btn btn-sm btn-icon" data-action="admin.spotifyPlay" title="Play">&#9654;</button>'
          }
          <button class="btn btn-sm btn-icon" data-action="admin.spotifyNext" title="Next">&#9654;&#9654;</button>
          <button class="btn btn-sm btn-icon" data-action="admin.spotifyStop" title="Stop">&#9632;</button>
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
  }

  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
