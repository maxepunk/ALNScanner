        class SessionModeManager {
            constructor() {
                this.mode = null; // 'networked' | 'standalone' | null
                this.locked = false; // Once set, cannot change during session
            }

            async setMode(mode) {
                if (this.locked) {
                    throw new Error('Cannot change session mode after game start');
                }

                if (mode !== 'networked' && mode !== 'standalone') {
                    throw new Error('Invalid session mode');
                }

                this.mode = mode;
                this.locked = true;
                localStorage.setItem('gameSessionMode', mode);

                // Trigger appropriate initialization
                if (mode === 'networked') {
                    const success = await this.initNetworkedMode();
                    // If no valid token, show connection wizard
                    if (!success && typeof showConnectionWizard === 'function') {
                        showConnectionWizard();
                    }
                } else {
                    this.initStandaloneMode();
                }
            }

            async initNetworkedMode() {
                console.log('Initializing networked mode...');
                // Show view selector tabs for networked mode
                document.getElementById('viewSelector').style.display = 'flex';

                // CRITICAL: Clear standalone mode data to prevent leaks into networked session
                // Orchestrator is source of truth in networked mode
                if (window.DataManager) {
                    console.log('Clearing standalone data before entering networked mode...');
                    // Clear standalone scanned tokens (networked uses separate namespace)
                    localStorage.removeItem('standalone_scannedTokens');
                    // Clear transactions (will be synced from orchestrator)
                    window.DataManager.transactions = [];
                    window.DataManager.currentSession = [];
                    window.DataManager.scannedTokens.clear();
                    window.DataManager.saveTransactions();
                    console.log('Standalone data cleared - orchestrator will be source of truth');
                }

                // Get configuration from localStorage (set by connection wizard)
                const orchestratorUrl = localStorage.getItem('aln_orchestrator_url') || 'https://localhost:3000';
                const deviceId = window.Settings?.deviceId || 'GM_STATION_UNKNOWN';
                const token = localStorage.getItem('aln_auth_token');

                // Check if we have a valid token - if yes, create session and auto-connect
                if (token && this._isTokenValid(token)) {
                    console.log('Valid token found - attempting auto-connect...');

                    // Show reconnecting toast
                    if (window.UIManager) {
                        window.UIManager.showToast('Reconnecting to orchestrator...', 'info', 3000);
                    }

                    // Create NetworkedSession
                    window.networkedSession = new NetworkedSession({
                        url: orchestratorUrl,
                        deviceId: deviceId,
                        stationName: window.Settings?.stationName || 'GM Station',
                        token: token
                    });

                    // Wire session events
                    this._wireSessionEvents(window.networkedSession);

                    // Attempt connection
                    try {
                        await window.networkedSession.initialize();
                        console.log('Auto-connect successful');

                        // Connection successful - return success
                        return true;
                    } catch (error) {
                        console.error('Auto-connect failed:', error);
                        // Clean up failed session
                        if (window.networkedSession) {
                            await window.networkedSession.destroy();
                            window.networkedSession = null;
                        }
                        throw error;
                    }
                } else {
                    // No valid token - caller should show connection wizard
                    console.log('No valid token - initialization incomplete');
                    return false;
                }
            }

            /**
             * Wire NetworkedSession events to UI
             * @private
             */
            _wireSessionEvents(session) {
                session.addEventListener('session:ready', () => {
                    console.log('NetworkedSession ready');
                });

                session.addEventListener('session:error', (event) => {
                    console.error('NetworkedSession error:', event.detail.error);
                    if (window.UIManager) {
                        window.UIManager.showError('Connection error: ' + event.detail.error.message);
                    }
                });

                session.addEventListener('auth:required', () => {
                    console.warn('Authentication required');
                    // Clear invalid token and show connection wizard
                    localStorage.removeItem('aln_auth_token');
                    if (typeof showConnectionWizard === 'function') {
                        showConnectionWizard();
                    }
                });
            }

            /**
             * Check if JWT token is valid (not expired, with 1-minute buffer)
             * @private
             */
            _isTokenValid(token) {
                try {
                    const parts = token.split('.');
                    if (parts.length !== 3) return false;

                    const payload = JSON.parse(atob(parts[1]));
                    const expiry = payload.exp;
                    if (!expiry) return false;

                    const now = Math.floor(Date.now() / 1000);
                    const buffer = 60; // 1-minute safety buffer
                    return (expiry - buffer) > now;
                } catch (error) {
                    console.error('Token validation error:', error);
                    return false;
                }
            }

            initStandaloneMode() {
                console.log('Initializing standalone mode...');
                // Skip all connection logic
                // Initialize local-only data manager
                window.dataManager = window.dataManager || new StandaloneDataManager();
                // Proceed directly to team entry
                UIManager.showScreen('teamEntry');
            }

            isNetworked() {
                return this.mode === 'networked';
            }

            isStandalone() {
                return this.mode === 'standalone';
            }

            // Check if we have a saved mode from previous incomplete session
            // Does NOT initialize - just returns the mode
            restoreMode() {
                const savedMode = localStorage.getItem('gameSessionMode');
                if (savedMode && (savedMode === 'networked' || savedMode === 'standalone')) {
                    this.mode = savedMode;
                    // Don't lock it yet - allow user to change on fresh start
                    return savedMode;
                }
                return null;
            }

            clearMode() {
                this.mode = null;
                this.locked = false;
                localStorage.removeItem('gameSessionMode');
            }

            /**
             * Check if networked mode connection is actually ready
             * @returns {boolean} True if connection ready (or not needed)
             */
            isConnectionReady() {
                if (this.mode !== 'networked') {
                    // Standalone mode doesn't need connection
                    return true;
                }

                // Networked mode - verify session is connected
                return window.networkedSession?.state === 'connected';
            }
        }

// Export for Node.js testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SessionModeManager;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.SessionModeManager = SessionModeManager;
}
