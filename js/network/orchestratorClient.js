        class OrchestratorClient {
            constructor(config = {}) {
                // Auto-detect orchestrator URL if served from orchestrator
                const detectOrchestratorUrl = () => {
                    // If served from orchestrator, use same origin
                    if (window.location.pathname.includes('/gm-scanner/')) {
                        return window.location.origin;
                    }
                    // Check localStorage for saved URL
                    const savedUrl = localStorage.getItem('orchestrator_url');
                    if (savedUrl) {
                        return savedUrl;
                    }
                    // Fallback to localhost for development
                    return 'http://localhost:3000';
                };

                this.config = {
                    url: config.url || detectOrchestratorUrl(),
                    deviceId: config.deviceId || 'GM_STATION_UNKNOWN',
                    version: config.version || '1.0.0',
                    transports: ['websocket'],
                    reconnection: config.reconnection !== false,
                    reconnectionDelay: config.reconnectionDelay || 1000,
                    reconnectionAttempts: config.reconnectionAttempts || Infinity,
                    connectionTimeout: config.connectionTimeout || 30000,
                    ...config.options
                };

                this.socket = null;
                this.isConnected = false;
                this.connectionStatus = 'disconnected'; // disconnected, connecting, connected, error
                this.sessionId = null;
                this.connectedDevices = [];
                this.eventHandlers = {};
                this.token = null; // Authentication token

                // Rate limiting functionality
                this.rateLimitQueue = [];
                this.stateRequestCooldown = 0;

                // Validate required config
                if (!this.config.deviceId || this.config.deviceId === 'GM_STATION_UNKNOWN') {
                    console.warn('OrchestratorClient: deviceId not configured');
                }

                // Check for existing token in localStorage
                this.token = localStorage.getItem('gmToken');

                // Note: Authentication is only required when connecting to orchestrator
                // Scanner can operate offline without authentication
            }

            // authenticateWithOrchestrator() method removed - authentication now happens at page load

            /**
             * Connect to the orchestrator WebSocket server
             * Note: Authentication must be complete BEFORE calling this method
             */
            async connect() {
                if (this.socket && this.socket.connected) {
                    console.warn('OrchestratorClient: Already connected');
                    return;
                }

                // Assume token already exists - it's set before connect() is ever called
                if (!this.token) {
                    console.error('OrchestratorClient: Cannot connect without token - auth should happen before connect()');
                    this.connectionStatus = 'disconnected';
                    this.emit('status:changed', 'offline');
                    return;
                }

                // Update status and create socket connection
                this.connectionStatus = 'connecting';
                this.emit('status:changed', 'connecting');

                // Create the socket connection with auth already in place
                this.createSocketConnection();
            }

            /**
             * Create and configure the WebSocket connection
             * Called AFTER authentication is complete
             */
            createSocketConnection() {
                try {
                    // Pass authentication in socket handshake to prevent "undefined device"
                    this.socket = io(this.config.url, {
                        transports: this.config.transports,
                        // Only enable auto-reconnection if we have a valid token
                        reconnection: this.token ? this.config.reconnection : false,
                        reconnectionDelay: this.config.reconnectionDelay,
                        reconnectionAttempts: this.config.reconnectionAttempts,
                        timeout: this.config.connectionTimeout,
                        // NEW: Include auth in the socket handshake
                        auth: {
                            token: this.token,
                            deviceId: this.config.deviceId,
                            deviceType: 'gm',
                            version: this.config.version
                        }
                    });

                    this.setupSocketEventHandlers();

                } catch (error) {
                    this.connectionStatus = 'error';
                    this.emit('status:changed', 'error');
                    this.emit('connection:error', error);
                    console.error('OrchestratorClient: Connection failed:', error);
                }
            }

            /**
             * Disconnect from the orchestrator
             */
            disconnect() {
                if (this.socket) {
                    this.socket.disconnect();
                }
                this.cleanup();
            }

            /**
             * Setup Socket.io event handlers
             */
            setupSocketEventHandlers() {
                if (!this.socket) return;

                this.socket.on('connect', () => {
                    this.isConnected = true;
                    this.connectionStatus = 'connected';
                    this.emit('status:changed', 'connected');
                    // Authentication already handled in handshake

                    // Initialize admin modules with shared connection
                    if (window.sessionModeManager?.isNetworked() && App.viewController) {
                        App.viewController.initAdminModules();
                    }

                    // Sync NetworkedQueueManager queue on reconnection
                    if (window.queueManager && typeof window.queueManager.syncQueue === 'function') {
                        Debug.log('Reconnected - syncing queued transactions...');
                        window.queueManager.syncQueue();
                    }
                });

                this.socket.on('disconnect', (reason) => {
                    this.isConnected = false;
                    this.connectionStatus = 'disconnected';
                    this.emit('status:changed', 'disconnected');
                    this.emit('disconnect', reason);

                    // Clear backend scores to ensure fallback to local calculation
                    if (window.DataManager && window.DataManager.backendScores) {
                        window.DataManager.backendScores.clear();
                        console.log('Backend scores cleared - falling back to local calculation');
                    }

                    // Handle server-initiated disconnects
                    if (reason === 'io server disconnect') {
                        // Don't use socket.connect() directly - it bypasses auth!
                        // Use our connect() method which ensures proper authentication
                        console.log('Server initiated disconnect - attempting reconnection with auth');
                        setTimeout(() => {
                            if (this.token) {
                                this.connect();  // Use our method, not socket's
                            } else {
                                console.warn('Cannot reconnect - no authentication token');
                            }
                        }, 1000);
                    }
                });

                this.socket.on('connect_error', (error) => {
                    this.connectionStatus = 'error';
                    this.emit('status:changed', 'error');
                    this.emit('connection:error', error);

                    // Set connection timeout
                    setTimeout(() => {
                        if (!this.isConnected) {
                            this.emit('connection:timeout');
                        }
                    }, this.config.connectionTimeout);
                });

                this.socket.on('reconnecting', (attemptNumber) => {
                    this.emit('reconnecting', attemptNumber);
                });

                this.socket.on('reconnect', (attemptNumber) => {
                    this.emit('reconnect', attemptNumber);
                    // Request state sync after reconnection
                    this.requestStateSync();
                });

                // Server event handlers
                this.socket.on('gm:identified', (eventData) => {
                    const payload = eventData.data;
                    this.sessionId = payload.sessionId;
                    this.emit('gm:identified', payload);
                });

                this.socket.on('transaction:new', (eventData) => {
                    const payload = eventData.data;
                    this.emit('transaction:new', payload);
                    // Unwrap nested transaction for DataManager (payload = { transaction: {...} })
                    this.updateDataManager({ newTransaction: payload.transaction });
                });

                // Transaction result from server (Decision #10: MUST check status and display errors)
                this.socket.on('transaction:result', (eventData) => {
                    const payload = eventData.data;
                    this.emit('transaction:result', payload);

                    // Decision #10: Check status and display errors to user
                    if (payload.status === 'error') {
                        if (window.UIManager) {
                            window.UIManager.showError(payload.message || 'Transaction failed');
                        }
                        console.error('Transaction error:', payload.message, payload);
                    } else if (payload.status === 'duplicate') {
                        if (window.UIManager) {
                            window.UIManager.showWarning(payload.message || 'Duplicate transaction');
                        }
                        console.warn('Duplicate transaction:', payload);
                    } else if (payload.status === 'accepted') {
                        console.log('Transaction accepted:', payload);
                    }
                });

                this.socket.on('video:status', (eventData) => {
                    const payload = eventData.data;
                    this.emit('video:status', payload);
                });

                // Video progress updates (emitted every 1s during playback)
                this.socket.on('video:progress', (eventData) => {
                    const payload = eventData.data;
                    this.emit('video:progress', payload);
                });

                // Video queue updates (when queue changes)
                this.socket.on('video:queue:update', (eventData) => {
                    const payload = eventData.data;
                    this.emit('video:queue:update', payload);
                });

                // Score update events from backend
                this.socket.on('score:updated', (eventData) => {
                    const payload = eventData.data;
                    this.emit('score:updated', payload);
                    // Update local score cache for the team
                    if (window.DataManager) {
                        window.DataManager.updateTeamScoreFromBackend(payload);
                    }
                    console.log('Received score update from backend:', payload);
                });

                this.socket.on('group:completed', (eventData) => {
                    const payload = eventData.data;
                    this.emit('group:completed', payload);
                    // Show notification about group completion
                    if (window.UIManager) {
                        window.UIManager.showGroupCompletionNotification(payload);
                    }
                    console.log('Group completed:', payload);
                });

                this.socket.on('device:connected', (eventData) => {
                    const payload = eventData.data;
                    this.connectedDevices.push(payload);
                    this.emit('device:connected', payload);
                });

                this.socket.on('device:disconnected', (eventData) => {
                    const payload = eventData.data;
                    this.connectedDevices = this.connectedDevices.filter(d => d.deviceId !== payload.deviceId);
                    this.emit('device:disconnected', payload);
                });

                this.socket.on('sync:full', (eventData) => {
                    const payload = eventData.data;
                    if (payload.devices) {
                        this.connectedDevices = payload.devices;
                    }
                    this.emit('sync:full', payload);
                });

                // Session state changes (replaces session:paused, session:resumed, session:ended per 08-functional-requirements.md:1051-1055)
                this.socket.on('session:update', (eventData) => {
                    const payload = eventData.data;
                    this.emit('session:update', payload);

                    // Update session info if available
                    if (payload.id) {
                        this.sessionId = payload.id;
                    }

                    // Log session state changes
                    console.log(`Session ${payload.status}:`, payload);

                    // Note: MonitoringDisplay automatically updates displays via event listeners
                });

                // GM command acknowledgment (admin panel feedback per 08-functional-requirements.md:1096)
                this.socket.on('gm:command:ack', (eventData) => {
                    const payload = eventData.data;
                    this.emit('gm:command:ack', payload);

                    // Display feedback to admin
                    if (payload.success) {
                        console.log(`Command '${payload.action}' succeeded:`, payload);
                    } else {
                        console.error(`Command '${payload.action}' failed:`, payload.message || 'Unknown error');
                        if (window.UIManager) {
                            window.UIManager.showError(`Command failed: ${payload.message || 'Unknown error'}`);
                        }
                    }
                });

                // Offline queue processed notification (after reconnection per asyncapi.yaml:OfflineQueueProcessed)
                this.socket.on('offline:queue:processed', (eventData) => {
                    const payload = eventData.data;
                    this.emit('offline:queue:processed', payload);

                    console.log(`Offline queue processed: ${payload.queueSize} transactions`, payload);

                    // Show notification to user
                    if (window.UIManager && payload.queueSize > 0) {
                        window.UIManager.showInfo(`Processed ${payload.queueSize} queued transactions`);
                    }
                });

                this.socket.on('error', (eventData) => {
                    const payload = eventData.data;
                    this.emit('error', payload);
                    console.error('OrchestratorClient: Server error:', payload);
                });

            }

            // startIdentification() method removed - authentication handled in handshake

            /**
             * Request full state synchronization
             */
            requestStateSync() {
                if (!this.socket || !this.socket.connected) {
                    console.warn('OrchestratorClient: Cannot request state sync - not connected');
                    return;
                }

                // Rate limiting for state requests
                const now = Date.now();
                if (now - this.stateRequestCooldown < 5000) {
                    console.warn('OrchestratorClient: State request rate limited');
                    return;
                }

                this.stateRequestCooldown = now;
                this.socket.emit('state:request', {});
            }








            /**
             * Add to rate limit queue
             */
            addToRateLimitQueue(fn) {
                this.rateLimitQueue.push(fn);

                // Start processing queue if not already processing
                if (this.rateLimitQueue.length === 1 && !this.rateLimitTimer) {
                    // Schedule first processing with delay (proper rate limiting)
                    this.rateLimitTimer = setTimeout(() => {
                        this.rateLimitTimer = null;
                        this.processRateLimitQueue();
                    }, 100);
                }
            }

            /**
             * Process rate-limited events
             * Performance optimized: Use single timer for better efficiency
             */
            processRateLimitQueue() {
                if (this.rateLimitQueue.length === 0) {
                    this.rateLimitTimer = null;
                    return;
                }

                // Process next item
                const fn = this.rateLimitQueue.shift();
                if (fn) fn();

                // Schedule next processing using optimized timer
                if (this.rateLimitQueue.length > 0 && !this.rateLimitTimer) {
                    this.rateLimitTimer = setTimeout(() => {
                        this.rateLimitTimer = null;
                        this.processRateLimitQueue();
                    }, 100); // 10/second max
                }
            }



            /**
             * Update DataManager with received data
             */
            updateDataManager(data) {
                if (typeof DataManager !== 'undefined') {
                    if (data.newTransaction) {
                        // Add new transaction to DataManager
                        DataManager.addTransaction(data.newTransaction);
                    }

                    if (data.state) {
                        // Update game state in DataManager
                        DataManager.updateGameState(data.state);
                    }

                    // Trigger UI update
                    if (typeof UIManager !== 'undefined') {
                        UIManager.updateHistoryBadge();
                        UIManager.updateSessionStats();
                    }

                    // Update admin panel if it's active
                    if (App.viewController && App.viewController.currentView === 'admin') {
                        App.updateAdminPanel();
                    }
                }
            }

            /**
             * Get current connection status
             */
            getConnectionStatus() {
                return {
                    isConnected: this.isConnected,
                    status: this.connectionStatus,
                    sessionId: this.sessionId,
                    connectedDevices: this.connectedDevices.length,
                    queueSize: 0  // Queue managed by NetworkedQueueManager
                };
            }

            /**
             * Event emitter functionality
             */
            on(event, handler) {
                if (!this.eventHandlers[event]) {
                    this.eventHandlers[event] = [];
                }
                this.eventHandlers[event].push(handler);
            }

            off(event, handler) {
                if (this.eventHandlers[event]) {
                    if (handler) {
                        this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
                    } else {
                        this.eventHandlers[event] = [];
                    }
                }
            }

            emit(event, data) {
                if (this.eventHandlers[event]) {
                    this.eventHandlers[event].forEach(handler => {
                        try {
                            handler(data);
                        } catch (error) {
                            console.error(`OrchestratorClient: Error in event handler for ${event}:`, error);
                        }
                    });
                }
            }

            /**
             * Cleanup resources
             * Performance: Proper cleanup prevents memory leaks
             */
            cleanup() {
                // Stop all timers
                if (this.rateLimitTimer) {
                    clearTimeout(this.rateLimitTimer);
                    this.rateLimitTimer = null;
                }
                if (this.saveTimer) {
                    clearTimeout(this.saveTimer);
                    this.saveTimer = null;
                }

                // Clear state
                this.isConnected = false;
                this.connectionStatus = 'disconnected';
                this.sessionId = null;
                this.connectedDevices = [];

                // Clear rate limit queue if too large
                if (this.rateLimitQueue.length > 50) {
                    this.rateLimitQueue = this.rateLimitQueue.slice(-50);
                }
            }
        }

        // Make classes available globally for debugging
        window.OrchestratorClient = OrchestratorClient;
        window.ConnectionManager = ConnectionManager;

        // Global ConnectionManager instance (initialized on DOMContentLoaded)
        window.connectionManager = null;

        // Discovery function integrated into main page (matches working config.html)
        async function scanForServers() {
            const statusDiv = document.getElementById('discoveryStatus');
            const serversDiv = document.getElementById('discoveredServers');

            statusDiv.textContent = '🔍 Scanning local network...';
            serversDiv.innerHTML = '';

            try {
                // Detect current subnet from page URL
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
                const promises = [];
                const foundServers = [];

                // Scan current subnet with proper endpoint
                for (let i = 1; i <= 254; i++) {
                    for (const port of commonPorts) {
                        const baseUrl = `http://${subnet}.${i}:${port}`;
                        promises.push(
                            fetch(`${baseUrl}/health`, {
                                method: 'GET',
                                mode: 'cors',
                                signal: AbortSignal.timeout(500)
                            })
                            .then(response => {
                                if (response.ok) {
                                    return { url: baseUrl, ip: `${subnet}.${i}:${port}` };
                                }
                                return null;
                            })
                            .catch(() => null)
                        );
                    }

                    // Limit concurrent requests to avoid browser issues
                    if (promises.length >= 20) {
                        const results = await Promise.all(promises.splice(0, 20));
                        foundServers.push(...results.filter(Boolean));
                    }
                }

                // Also try localhost
                promises.push(
                    fetch('http://localhost:3000/health', {
                        signal: AbortSignal.timeout(1000)
                    })
                    .then(response => response.ok ? { url: 'http://localhost:3000', ip: 'localhost:3000' } : null)
                    .catch(() => null)
                );

                // Process remaining promises
                const finalResults = await Promise.all(promises);
                foundServers.push(...finalResults.filter(Boolean));

                // Remove duplicates
                const uniqueServers = Array.from(new Map(
                    foundServers.map(server => [server.url, server])
                ).values());

                if (uniqueServers.length > 0) {
                    displayDiscoveredServers(uniqueServers);
                } else {
                    statusDiv.textContent = '❌ No servers found - enter address manually';
                }
            } catch (error) {
                statusDiv.textContent = '⚠️ Discovery failed - enter address manually';
                console.error('Discovery error:', error);
            }
        }

// Export for Node.js testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OrchestratorClient;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.OrchestratorClient = OrchestratorClient;
}
