        class SessionModeManager {
            constructor() {
                this.mode = null; // 'networked' | 'standalone' | null
                this.locked = false; // Once set, cannot change during session
            }

            setMode(mode) {
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
                    this.initNetworkedMode();
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

                // Initialize ConnectionManager
                window.connectionManager = new ConnectionManager();
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
                    try {
                        await window.connectionManager.connect();
                        console.log('Auto-connect successful');
                        // Connection successful - proceed to team entry
                        // connect() success is handled by connection event handlers
                    } catch (error) {
                        console.error('Auto-connect failed:', error);
                        // Connection failed after retries - show wizard
                        showConnectionWizard();
                    }
                } else {
                    // No valid token - show connection wizard
                    console.log('No valid token found - showing connection wizard');
                    showConnectionWizard();
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
            // Initializes the restored mode (networked mode auto-connects if token valid)
            async restoreMode() {
                const savedMode = localStorage.getItem('gameSessionMode');
                if (savedMode && (savedMode === 'networked' || savedMode === 'standalone')) {
                    this.mode = savedMode;
                    // Don't lock it yet - allow user to change on fresh start

                    // Initialize the restored mode (async for networked auto-connect)
                    if (savedMode === 'networked') {
                        await this.initNetworkedMode();
                    } else if (savedMode === 'standalone') {
                        this.initStandaloneMode();
                    }

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
