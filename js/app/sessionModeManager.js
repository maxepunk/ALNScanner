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

                // Initialize ConnectionManager (or use existing one from determineInitialScreen)
                if (!window.connectionManager) {
                    window.connectionManager = new ConnectionManager();
                }
                window.connectionManager.migrateLocalStorage();

                // NetworkedQueueManager will be created after authentication succeeds
                // and OrchestratorClient is instantiated with valid connection

                // Check if we have a valid token - if yes, auto-connect
                if (window.connectionManager.isTokenValid()) {
                    console.log('Valid token found - attempting auto-connect...');

                    // Show reconnecting toast
                    if (window.UIManager) {
                        window.UIManager.showToast('Reconnecting to orchestrator...', 'info', 3000);
                    }

                    // Attempt connection
                    await window.connectionManager.connect();
                    console.log('Auto-connect successful');
                    // Connection successful - return success
                    return true;
                } else {
                    // No valid token - caller should show connection wizard
                    console.log('No valid token - initialization incomplete');
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

                // Networked mode - verify WebSocket connection exists and is active
                // IMPORTANT: Property is 'isConnected' (not 'connected') - see OrchestratorClient line 5473
                return window.connectionManager?.client?.isConnected === true;
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
