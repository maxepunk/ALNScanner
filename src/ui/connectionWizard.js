/**
 * Connection Wizard Module
 * Handles networked mode connection setup and server discovery
 *
 * This module replaces the inline script functions from index.html
 * with proper ES6 module architecture and dependency injection.
 */

/**
 * ConnectionWizard class - Manages connection wizard UI and workflow
 * Receives app instance via dependency injection (no window globals)
 */
export class ConnectionWizard {
  constructor(app) {
    this.app = app;

    // Bind methods for event listeners
    this.scanForServers = this.scanForServers.bind(this);
    this.handleConnectionSubmit = this.handleConnectionSubmit.bind(this);
    this.cancelNetworkedMode = this.cancelNetworkedMode.bind(this);
    this.showConnectionWizard = this.showConnectionWizard.bind(this);
  }

  /**
   * Initialize connection wizard by binding form submit event
   * Call this after DOM is ready
   */
  init() {
    const connectionForm = document.getElementById('connectionForm');
    if (connectionForm) {
      connectionForm.addEventListener('submit', this.handleConnectionSubmit);
    }

    // Setup debounced server URL handler for manual entry
    this._setupServerUrlHandler();
  }

  /**
   * Scan for game servers via HTTP brute-force
   * Web browsers cannot do UDP, so we scan common IPs/ports using /health endpoint
   * Based on player scanner discovery pattern from aln-memory-scanner/config.html
   */
  async scanForServers() {
    const statusDiv = document.getElementById('discoveryStatus');
    const serversDiv = document.getElementById('discoveredServers');
    const btn = document.getElementById('scanServersBtn');

    btn.disabled = true;
    btn.textContent = '🔍 Scanning...';
    statusDiv.textContent = 'Looking for orchestrators on the network...';
    statusDiv.style.color = '#2196F3';
    serversDiv.innerHTML = '';

    try {
      // Detect current subnet dynamically
      const currentHost = window.location.hostname;
      let subnet = '192.168.1'; // Default fallback

      // Try to detect subnet from current host
      if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
        const parts = currentHost.split('.');
        if (parts.length >= 3) {
          subnet = parts.slice(0, 3).join('.');
        }
      }

      const commonPorts = [3000, 8080];
      // Use same protocol as current page to avoid mixed content blocking
      const protocol = window.location.protocol.replace(':', ''); // 'https' or 'http'
      const promises = [];

      // Scan detected subnet (254 IPs × 2 ports = 508 requests max)
      // Browser connection pooling naturally rate-limits concurrent requests
      for (let i = 1; i <= 254; i++) {
        for (const port of commonPorts) {
          const url = `${protocol}://${subnet}.${i}:${port}`;
          promises.push(
            fetch(`${url}/health`, {
              method: 'GET',
              mode: 'cors',
              signal: AbortSignal.timeout(500)
            })
            .then(response => response.ok ? url : null)
            .catch(() => null)
          );
        }
      }

      // Also try localhost
      promises.push(
        fetch(`${protocol}://localhost:3000/health`, {
          signal: AbortSignal.timeout(1000)
        })
        .then(response => response.ok ? `${protocol}://localhost:3000` : null)
        .catch(() => null)
      );

      // Try current origin if served from orchestrator
      if (window.location.pathname.startsWith('/gm-scanner/')) {
        promises.push(Promise.resolve(window.location.origin));
      }

      const results = await Promise.all(promises);
      const foundServers = [...new Set(results.filter(url => url !== null))];

      if (foundServers.length > 0) {
        statusDiv.textContent = `✅ Found ${foundServers.length} orchestrator(s)`;
        statusDiv.style.color = '#4CAF50';

        // Use existing displayDiscoveredServers pattern
        this.displayDiscoveredServers(foundServers.map(url => ({ url })));
      } else {
        statusDiv.textContent = '⚠️ No orchestrators found. Please enter URL manually below.';
        statusDiv.style.color = '#ff9800';
      }
    } catch (error) {
      statusDiv.textContent = '❌ Discovery failed. Please enter URL manually below.';
      statusDiv.style.color = '#f44336';
      console.error('Server discovery error:', error);
    } finally {
      btn.disabled = false;
      btn.textContent = '🔍 Scan for Game Servers';
    }
  }

  /**
   * Display discovered servers in the UI
   * @private
   */
  displayDiscoveredServers(servers) {
    const statusDiv = document.getElementById('discoveryStatus');
    const serversDiv = document.getElementById('discoveredServers');

    statusDiv.textContent = `✅ Found ${servers.length} game server(s)`;
    serversDiv.innerHTML = '';

    servers.forEach(server => {
      const serverEl = document.createElement('div');
      serverEl.className = 'server-item';
      serverEl.innerHTML = `
        <span>🎮 Game Server at ${server.ip || server.url}</span>
        <button data-action="connectionWizard.selectServer" data-arg="${server.url}">Select</button>
      `;
      serversDiv.appendChild(serverEl);
    });
  }

  /**
   * Setup debounced handler for server URL manual entry
   * Queries /api/state to auto-assign station name when URL is entered
   * @private
   */
  _setupServerUrlHandler() {
    const serverUrlInput = document.getElementById('serverUrl');
    if (!serverUrlInput) return;

    let debounceTimer;
    const DEBOUNCE_MS = 500;

    serverUrlInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const url = serverUrlInput.value.trim();
        if (url) {
          // Normalize URL (add protocol if missing)
          let normalizedUrl = url;
          if (!normalizedUrl.match(/^https?:\/\//i)) {
            normalizedUrl = `http://${normalizedUrl}`;
          }
          this.assignStationName(normalizedUrl);
        }
      }, DEBOUNCE_MS);
    });
  }

  /**
   * Query orchestrator for existing devices and assign next available station name
   * @param {string} serverUrl - The orchestrator URL
   * @private
   */
  async assignStationName(serverUrl) {
    const stationNameDisplay = document.getElementById('stationNameDisplay');
    if (!stationNameDisplay) return; // Graceful fallback if HTML not updated yet

    try {
      // Query /api/state (no auth required)
      const response = await fetch(`${serverUrl}/api/state`, {
        method: 'GET',
        mode: 'cors',
        signal: AbortSignal.timeout(3000)
      });

      if (!response.ok) {
        throw new Error('Server unreachable');
      }

      const state = await response.json();
      const devices = state.devices || [];

      // Extract existing GM device IDs
      const existingIds = devices
        .filter(d => d.type === 'gm')
        .map(d => d.deviceId);

      // Find next available station ID
      const nextStationId = this._findNextStationId(existingIds);

      // Update display
      stationNameDisplay.textContent = nextStationId;
      stationNameDisplay.dataset.deviceId = nextStationId;

      console.log(`[ConnectionWizard] Auto-assigned station name: ${nextStationId}`);
    } catch (error) {
      // Fallback to localStorage counter on error
      console.warn(`[ConnectionWizard] Failed to query /api/state, using localStorage fallback:`, error.message);

      const stationNum = localStorage.getItem('lastStationNum') || '1';
      const fallbackId = `GM_Station_${stationNum}`;

      if (stationNameDisplay) {
        stationNameDisplay.textContent = fallbackId;
        stationNameDisplay.dataset.deviceId = fallbackId;
      }
    }
  }

  /**
   * Find next available station ID using gap-filling algorithm
   * @param {string[]} existingIds - Array of existing device IDs (e.g., ["GM_Station_1", "GM_Station_3"])
   * @returns {string} Next available station ID (e.g., "GM_Station_2")
   * @private
   */
  _findNextStationId(existingIds) {
    // Extract numbers from GM_Station_N pattern
    const stationNumbers = existingIds
      .filter(id => id && id.startsWith('GM_Station_'))
      .map(id => {
        const match = id.match(/GM_Station_(\d+)$/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter(num => num !== null)
      .sort((a, b) => a - b);

    // Find first missing number starting from 1
    let nextNum = 1;
    for (const num of stationNumbers) {
      if (num === nextNum) {
        nextNum++;
      } else if (num > nextNum) {
        break; // Found a gap
      }
    }

    return `GM_Station_${nextNum}`;
  }

  /**
   * Select discovered server and pre-fill connection form
   */
  selectServer(url) {
    document.getElementById('serverUrl').value = url;
    document.getElementById('discoveryStatus').textContent = '✅ Server selected';

    // Auto-assign station name by querying /api/state
    this.assignStationName(url);
  }

  /**
   * Unified connection form handler
   */
  async handleConnectionSubmit(event) {
    event.preventDefault();

    const serverUrl = document.getElementById('serverUrl').value;
    const password = document.getElementById('gmPassword').value;
    const statusDiv = document.getElementById('connectionStatusMsg');

    // Read device ID from display element's dataset (not input field)
    const stationNameDisplay = document.getElementById('stationNameDisplay');
    const deviceId = stationNameDisplay ? stationNameDisplay.dataset.deviceId : null;

    // Validate inputs
    if (!serverUrl || !deviceId || !password) {
      statusDiv.textContent = '⚠️ Please fill in all fields';
      statusDiv.style.color = '#ff9800';
      return;
    }

    statusDiv.textContent = '⏳ Connecting...';
    statusDiv.style.color = '#2196F3';

    try {
      // Normalize URL - add http:// if no protocol specified
      let normalizedUrl = serverUrl.trim();
      if (!normalizedUrl.match(/^https?:\/\//i)) {
        normalizedUrl = `http://${normalizedUrl}`;
        statusDiv.textContent = `🔧 Using ${normalizedUrl}`;
      }

      // 1. Test server reachability (use orchestrator health endpoint)
      const healthCheck = await fetch(`${normalizedUrl}/health`, {
        method: 'GET',
        mode: 'cors',
        signal: AbortSignal.timeout(3000)
      });

      if (!healthCheck.ok) {
        throw new Error('Server not responding');
      }

      // 2. Authenticate
      const authResponse = await fetch(`${normalizedUrl}/api/admin/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (!authResponse.ok) {
        statusDiv.textContent = '❌ Invalid password';
        statusDiv.style.color = '#f44336';
        return;
      }

      const { token } = await authResponse.json();

      // 3. Save configuration to localStorage
      localStorage.setItem('aln_orchestrator_url', normalizedUrl);
      localStorage.setItem('aln_auth_token', token);
      localStorage.setItem('aln_station_name', deviceId);

      // Set device ID in Settings (deviceId is already in correct format: GM_Station_N)
      const settings = this.app.settings;
      settings.deviceId = deviceId;
      settings.stationName = deviceId;
      settings.save();

      // Update localStorage counter for next session
      const match = deviceId.match(/GM_Station_(\d+)$/);
      if (match) {
        const nextNum = parseInt(match[1], 10) + 1;
        localStorage.setItem('lastStationNum', nextNum.toString());
      }

      // 4. Trigger networked mode initialization via App (event-driven pattern)
      // Per Architecture Refactoring 2025-11: App creates NetworkedSession, not wizard
      statusDiv.textContent = '✅ Authenticated! Connecting...';
      statusDiv.style.color = '#4CAF50';

      // Delegate to App.selectGameMode() for proper event-driven initialization:
      // - App will lock mode via SessionModeManager
      // - App will create NetworkedSession with services
      // - NetworkedSession will emit session:ready event
      // - App's session:ready listener will initialize admin modules
      // - App will close modal and show team entry screen
      await this.app.selectGameMode('networked');

      // Success handled by App's session:ready event listener
      // (Modal close and UI transition happen in App._initializeNetworkedMode)

    } catch (error) {
      statusDiv.textContent = `❌ Connection failed: ${error.message}`;
      statusDiv.style.color = '#f44336';
    }
  }

  /**
   * Cancel networked mode and return to game mode selection
   */
  cancelNetworkedMode() {
    // Close the connection modal
    document.getElementById('connectionModal').style.display = 'none';

    // Clear the session mode manager's lock so user can choose again
    const sessionModeManager = this.app.sessionModeManager;
    if (sessionModeManager) {
      sessionModeManager.clearMode();
    }

    // Return to game mode selection screen
    this.app.uiManager.showScreen('gameModeScreen');
  }

  /**
   * Show connection wizard modal
   */
  showConnectionWizard() {
    const modal = document.getElementById('connectionModal');
    modal.style.display = 'flex';

    // Auto-scan on open for better UX (but don't block)
    setTimeout(() => this.scanForServers(), 100);
  }

}

/**
 * Queue Status Indicator Manager
 * Manages the offline queue UI indicator with event-driven updates
 */
export class QueueStatusManager {
  constructor(app) {
    this.app = app;
    this.updateQueueIndicator = this.updateQueueIndicator.bind(this);
  }

  /**
   * Initialize queue status indicator with event listeners
   */
  init() {
    this.updateQueueIndicator(); // Initial update

    // Register event listener for queue changes (no polling)
    const queueManager = this.app.networkedSession?.services?.queueManager;
    if (queueManager) {
      queueManager.addEventListener('queue:changed', (event) => {
        console.log('Queue changed:', event.detail);
        this.updateQueueIndicator();
      });
    }
  }

  /**
   * Update the queue status indicator with current queue count
   * P2.2.3: Event-driven updates (no polling)
   */
  updateQueueIndicator() {
    const indicator = document.getElementById('queueStatusIndicator');
    const countSpan = document.getElementById('queueCount');

    if (!indicator || !countSpan) return;

    // Get queue count from NetworkedQueueManager
    const queueManager = this.app.networkedSession?.services?.queueManager;
    const queueStatus = queueManager?.getStatus();
    const queueCount = queueStatus ? queueStatus.queuedCount : 0;

    countSpan.textContent = queueCount;
    indicator.classList.toggle('visible', queueCount > 0);
  }
}

/**
 * Cleanup handler for page unload
 * Ensures graceful disconnect when page is closing
 */
export function setupCleanupHandlers(app) {
  window.addEventListener('beforeunload', () => {
    if (app.networkedSession?.services?.client) {
      console.log('Page unloading - disconnecting socket');
      app.networkedSession.services.client.disconnect();
    }
  });
}
