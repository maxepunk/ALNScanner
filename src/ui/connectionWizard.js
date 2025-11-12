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
    this.showAuthModal = this.showAuthModal.bind(this);
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
      // Limited to 20 concurrent to avoid overwhelming network
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

        // Limit concurrent requests to avoid overwhelming the network
        if (promises.length >= 20) {
          await Promise.race(promises);
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
   * Select discovered server and pre-fill connection form
   */
  selectServer(url) {
    document.getElementById('serverUrl').value = url;
    document.getElementById('discoveryStatus').textContent = '✅ Server selected';

    // Generate station name if empty
    if (!document.getElementById('stationName').value) {
      const stationNum = localStorage.getItem('lastStationNum') || '1';
      document.getElementById('stationName').value = `GM Station ${stationNum}`;
    }
  }

  /**
   * Unified connection form handler
   */
  async handleConnectionSubmit(event) {
    event.preventDefault();

    const serverUrl = document.getElementById('serverUrl').value;
    const stationName = document.getElementById('stationName').value;
    const password = document.getElementById('gmPassword').value;
    const statusDiv = document.getElementById('connectionStatusMsg');

    // Validate inputs
    if (!serverUrl || !stationName || !password) {
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
      localStorage.setItem('aln_station_name', stationName);

      // Set device ID in Settings
      const settings = this.app.settings;
      settings.deviceId = stationName.replace(/\s+/g, '_');
      settings.stationName = stationName;
      settings.save();

      // Handle station number
      const match = stationName.match(/\d+$/);
      if (match) {
        const nextNum = parseInt(match[0]) + 1;
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

  /**
   * Show non-blocking authentication modal
   */
  async showAuthModal() {
    // Show the connection wizard modal instead of using prompt
    this.showConnectionWizard();

    // Pre-fill the server URL if we already have one
    const connectionManager = this.app.networkedSession?.services?.connectionManager;
    if (connectionManager && connectionManager.url) {
      document.getElementById('serverUrl').value = connectionManager.url;
    }

    // Pre-fill station name if we have one
    if (connectionManager && connectionManager.stationName) {
      document.getElementById('stationName').value = connectionManager.stationName;
    }
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

    // Update count display
    countSpan.textContent = queueCount;

    // Show/hide indicator based on queue count
    if (queueCount > 0) {
      indicator.classList.add('visible');
    } else {
      indicator.classList.remove('visible');
    }
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
