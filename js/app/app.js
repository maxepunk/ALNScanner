        // ============================================
        // MODULE: Main Application
        // Coordinates all modules and handles user interaction
        // ============================================
        const App = {
            currentTeamId: '',
            nfcSupported: false,
            
            /**
             * Initialize application
             */
            async init() {
                Debug.log('App initializing...');

                // Initialize UI (Phase 1D)
                InitializationSteps.initializeUIManager(UIManager);

                // CRITICAL: Initialize SessionModeManager BEFORE viewController (Phase 1E)
                InitializationSteps.createSessionModeManager(SessionModeManager, window);

                // Initialize view controller (Phase 1F)
                InitializationSteps.initializeViewController(this.viewController);

                // Load settings (Phase 1G)
                InitializationSteps.loadSettings(Settings);

                // Load transaction history (Phase 1H)
                InitializationSteps.loadDataManager(DataManager, UIManager);

                // Check NFC support (Phase 1I)
                this.nfcSupported = await InitializationSteps.detectNFCSupport(NFCHandler);

                // Load token database (Phase 1A)
                await InitializationSteps.loadTokenDatabase(TokenManager, UIManager);

                // Apply URL parameter mode override (Phase 1B)
                InitializationSteps.applyURLModeOverride(window.location.search, Settings);

                // Register service worker for PWA functionality (Phase 1J)
                await InitializationSteps.registerServiceWorker(navigator, UIManager);

                // Connection restoration logic (Phase 1C)
                const screenDecision = InitializationSteps.determineInitialScreen(window.sessionModeManager);
                InitializationSteps.applyInitialScreenDecision(
                    screenDecision,
                    window.sessionModeManager,
                    UIManager,
                    showConnectionWizard
                );
            },
            
            // Settings Management
            showSettings() {
                UIManager.showScreen('settings');
            },
            
            saveSettings() {
                Settings.save();
                UIManager.showScreen('teamEntry');
            },
            
            toggleMode() {
                Settings.stationMode = Settings.stationMode === 'detective' ? 'blackmarket' : 'detective';

                // Use ConnectionManager if available
                if (window.connectionManager) {
                    window.connectionManager.stationMode = Settings.stationMode;
                }

                UIManager.updateModeDisplay(Settings.stationMode);
                
                const scanScreen = document.getElementById('scanScreen');
                if (scanScreen && scanScreen.classList.contains('active')) {
                    UIManager.updateSessionStats();
                }
                
                // Visual feedback
                const indicator = document.getElementById('modeIndicator');
                indicator.style.transform = `scale(${CONFIG.MODE_TOGGLE_SCALE})`;
                setTimeout(() => {
                    indicator.style.transform = 'scale(1)';
                }, CONFIG.ANIMATION_DURATION);
            },
            
            updateModeFromToggle() {
                Settings.stationMode = document.getElementById('modeToggle').checked ? 'blackmarket' : 'detective';
                UIManager.updateModeDisplay(Settings.stationMode);
            },

            // testOrchestratorConnection removed - use connection wizard instead
            
            // Team Entry
            appendNumber(num) {
                if (this.currentTeamId.length < CONFIG.MAX_TEAM_ID_LENGTH) {
                    this.currentTeamId += num;
                    UIManager.updateTeamDisplay(this.currentTeamId);
                }
            },
            
            clearTeamId() {
                this.currentTeamId = '';
                UIManager.updateTeamDisplay(this.currentTeamId);
            },
            
            confirmTeamId() {
                if (this.currentTeamId.length > 0) {
                    document.getElementById('currentTeam').textContent = this.currentTeamId;
                    DataManager.clearSession();
                    UIManager.updateSessionStats();
                    UIManager.showScreen('scan');
                }
            },

            // Game mode selection
            selectGameMode(mode) {
                if (!window.sessionModeManager) {
                    console.error('SessionModeManager not initialized');
                    UIManager.showError('System error: SessionModeManager not initialized. Please reload the page.');
                    return;
                }

                try {
                    window.sessionModeManager.setMode(mode);
                    console.log(`Game mode selected: ${mode}`);
                } catch (error) {
                    console.error('Failed to set game mode:', error);
                    UIManager.showError(`Failed to set game mode: ${error.message}`);
                }
            },

            // ========== View Controller ==========
            viewController: {
                currentView: 'scanner',
                views: ['scanner', 'admin', 'debug'],
                adminInstances: null,

                init() {
                    // Initialize based on session mode
                    if (window.sessionModeManager?.isNetworked()) {
                        // Show view selector tabs in networked mode
                        document.getElementById('viewSelector').style.display = 'flex';
                        // Admin modules will be initialized after connection
                    }
                },

                switchView(viewName) {
                    if (!this.views.includes(viewName)) {
                        console.error('Invalid view:', viewName);
                        UIManager.showError(`Invalid view: ${viewName}`);
                        return;
                    }

                    // Hide all view contents
                    document.querySelectorAll('.view-content').forEach(view => {
                        view.style.display = 'none';
                    });

                    // Show selected view
                    const selectedView = document.getElementById(`${viewName}-view`);
                    if (selectedView) {
                        selectedView.style.display = 'block';
                    }

                    // Update tab highlighting
                    document.querySelectorAll('.view-tab').forEach(tab => {
                        tab.classList.remove('active');
                    });
                    const activeTab = document.querySelector(`[data-view="${viewName}"]`);
                    if (activeTab) {
                        activeTab.classList.add('active');
                    }

                    this.currentView = viewName;

                    // Trigger view-specific initialization
                    if (viewName === 'admin') {
                        if (this.adminInstances) {
                            this.adminInstances.systemMonitor.refresh();
                            // Fetch current session state
                            this.fetchCurrentSession();
                        }
                        // Update admin panel displays
                        if (typeof App !== 'undefined') {
                            App.updateAdminPanel();
                        }
                    }
                },

                async fetchCurrentSession() {
                    // BUG FIX (Phase 2.3): Session state and display now handled by broadcasts
                    // SessionManager.currentSession updated from session:update broadcasts (event-driven)
                    // MonitoringDisplay updates DOM from session:update broadcasts
                    // No need to manually refresh display - broadcasts handle everything
                    // This follows event-driven architecture with clear separation of concerns

                    if (!this.adminInstances?.sessionManager) return;

                    Debug.log(this.adminInstances.sessionManager.currentSession
                        ? 'Session active: ' + JSON.stringify(this.adminInstances.sessionManager.currentSession)
                        : 'No active session');
                },

                initAdminModules() {
                    // Only initialize in networked mode with valid connection
                    if (!window.sessionModeManager?.isNetworked()) {
                        console.log('Admin modules only available in networked mode');
                        return;
                    }

                    if (!window.connectionManager?.client) {
                        console.error('No WebSocket connection available for admin modules');
                        UIManager.showError('No WebSocket connection available for admin modules. Check connection.');
                        return;
                    }

                    // Create admin module instances sharing the same WebSocket connection
                    this.adminInstances = {
                        sessionManager: new AdminModule.SessionManager(window.connectionManager.client),
                        videoController: new AdminModule.VideoController(window.connectionManager.client),
                        systemMonitor: new AdminModule.SystemMonitor(),
                        adminOps: new AdminModule.AdminOperations(window.connectionManager.client),
                        monitoring: new AdminModule.MonitoringDisplay(window.connectionManager.client)
                    };

                    // Note: MonitoringDisplay automatically registers event listeners
                    // for all monitoring display updates (session, video, system, scores, transactions)
                    // No need to manually register event listeners here

                    console.log('Admin modules initialized with shared WebSocket connection');
                }
            },

            // ========== Admin Actions ==========
            // These methods wrap calls to AdminModule functionality

            async adminCreateSession() {
                const name = prompt('Enter session name:');
                if (!name) return;

                if (!App.viewController.adminInstances?.sessionManager) {
                    alert('Admin functions not available. Please ensure you are connected.');
                    return;
                }

                try {
                    await App.viewController.adminInstances.sessionManager.createSession(name);
                    Debug.log(`Session created: ${name}`);
                } catch (error) {
                    console.error('Failed to create session:', error);
                    UIManager.showError('Failed to create session. Check connection.');
                }
            },

            async adminPauseSession() {
                if (!App.viewController.adminInstances?.sessionManager) {
                    alert('Admin functions not available.');
                    return;
                }
                try {
                    await App.viewController.adminInstances.sessionManager.pauseSession();
                    Debug.log('Session paused');
                } catch (error) {
                    console.error('Failed to pause session:', error);
                    UIManager.showError('Failed to pause session.');
                }
            },

            async adminResumeSession() {
                if (!App.viewController.adminInstances?.sessionManager) {
                    alert('Admin functions not available.');
                    return;
                }
                try {
                    await App.viewController.adminInstances.sessionManager.resumeSession();
                    Debug.log('Session resumed');
                } catch (error) {
                    console.error('Failed to resume session:', error);
                    UIManager.showError('Failed to resume session.');
                }
            },

            async adminEndSession() {
                if (!confirm('Are you sure you want to end the session?')) return;

                if (!App.viewController.adminInstances?.sessionManager) {
                    alert('Admin functions not available.');
                    return;
                }
                try {
                    await App.viewController.adminInstances.sessionManager.endSession();
                    Debug.log('Session ended');
                } catch (error) {
                    console.error('Failed to end session:', error);
                    UIManager.showError('Failed to end session.');
                }
            },

            async adminResetAndCreateNew() {
                // Step 0: Confirm with user
                const confirmReset = confirm(
                    'Reset system and start new session?\n\n' +
                    'This will:\n' +
                    '• Archive the current completed session\n' +
                    '• Clear all current data\n' +
                    '• Prepare system for a new game\n\n' +
                    'Continue?'
                );

                if (!confirmReset) return;

                // Step 1: Get new session name
                const name = prompt('Enter new session name:');
                if (!name || name.trim() === '') {
                    alert('Session name is required');
                    return;
                }

                // Step 2: Verify admin instances available
                if (!App.viewController.adminInstances?.sessionManager) {
                    alert('Admin functions not available. Please ensure you are connected to the orchestrator.');
                    return;
                }

                try {
                    // Step 3: Send system:reset command
                    Debug.log('Sending system:reset command...');

                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            reject(new Error('System reset timeout (5s)'));
                        }, 5000);

                        const socket = App.viewController.adminInstances.sessionManager.connection.socket;

                        socket.once('gm:command:ack', (response) => {
                            clearTimeout(timeout);

                            if (response.data && response.data.success) {
                                Debug.log('System reset successful');
                                resolve();
                            } else {
                                const errorMsg = response.data?.message || 'Reset failed';
                                reject(new Error(errorMsg));
                            }
                        });

                        socket.emit('gm:command', {
                            event: 'gm:command',
                            data: {
                                action: 'system:reset',
                                payload: {}
                            },
                            timestamp: new Date().toISOString()
                        });
                    });

                    Debug.log('System reset complete, creating new session...');

                    // Step 4: Create new session
                    await App.viewController.adminInstances.sessionManager.createSession(name.trim());

                    Debug.log(`New session created: ${name}`);

                    // Step 5: Show success feedback
                    if (UIManager.showToast) {
                        UIManager.showToast(`Session "${name}" started successfully`, 'success', 5000);
                    } else {
                        alert(`Session "${name}" created successfully!`);
                    }

                } catch (error) {
                    console.error('Failed to reset and create session:', error);

                    const errorMsg = `Failed to reset and create session: ${error.message}`;

                    if (UIManager.showError) {
                        UIManager.showError(errorMsg);
                    } else {
                        alert(errorMsg);
                    }
                }
            },

            async adminViewSessionDetails() {
                const session = App.viewController.adminInstances?.sessionManager?.currentSession;

                if (!session) {
                    alert('No session data available');
                    return;
                }

                // Format session details
                const startTime = session.startTime ? new Date(session.startTime).toLocaleString() : 'Unknown';
                const endTime = session.endTime ? new Date(session.endTime).toLocaleString() : 'Ongoing';
                const duration = session.getDuration ? this.formatSessionDuration(session.getDuration()) : 'Unknown';

                const details = `
═══════════════════════════════════
SESSION DETAILS
═══════════════════════════════════

Name: ${session.name || 'Unnamed Session'}
ID: ${session.id}
Status: ${session.status.toUpperCase()}

TIMING
──────────────────────────────────
Started: ${startTime}
${session.endTime ? 'Ended: ' + endTime : 'Status: In Progress'}
Duration: ${duration}

STATISTICS
──────────────────────────────────
Total Scans: ${session.metadata?.totalScans || 0}
Unique Tokens: ${session.metadata?.uniqueTokensScanned?.length || 0}
Teams: ${session.scores?.length || 0}
GM Stations: ${session.connectedDevices?.filter(d => d.type === 'gm').length || 0}

═══════════════════════════════════
                `.trim();

                alert(details);
            },

            /**
             * Helper: Format duration for session details
             */
            formatSessionDuration(ms) {
                if (!ms || ms < 0) return 'Unknown';

                const seconds = Math.floor(ms / 1000);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                const days = Math.floor(hours / 24);

                const parts = [];
                if (days > 0) parts.push(`${days}d`);
                if (hours % 24 > 0) parts.push(`${hours % 24}h`);
                if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
                if (seconds % 60 > 0 && parts.length < 2) parts.push(`${seconds % 60}s`);

                return parts.length > 0 ? parts.join(' ') : '0s';
            },

            async adminPlayVideo() {
                if (!App.viewController.adminInstances?.videoController) {
                    alert('Video controls not available.');
                    return;
                }
                try {
                    await App.viewController.adminInstances.videoController.playVideo();
                } catch (error) {
                    console.error('Failed to play video:', error);
                    UIManager.showError('Failed to play video.');
                }
            },

            async adminPauseVideo() {
                if (!App.viewController.adminInstances?.videoController) {
                    alert('Video controls not available.');
                    return;
                }
                try {
                    await App.viewController.adminInstances.videoController.pauseVideo();
                } catch (error) {
                    console.error('Failed to pause video:', error);
                    UIManager.showError('Failed to pause video.');
                }
            },

            async adminStopVideo() {
                if (!App.viewController.adminInstances?.videoController) {
                    alert('Video controls not available.');
                    return;
                }
                try {
                    await App.viewController.adminInstances.videoController.stopVideo();
                } catch (error) {
                    console.error('Failed to stop video:', error);
                    UIManager.showError('Failed to stop video.');
                }
            },

            async adminSkipVideo() {
                if (!App.viewController.adminInstances?.videoController) {
                    alert('Video controls not available.');
                    return;
                }
                try {
                    await App.viewController.adminInstances.videoController.skipVideo();
                } catch (error) {
                    console.error('Failed to skip video:', error);
                    UIManager.showError('Failed to skip video.');
                }
            },

            async adminAddVideoToQueue() {
                if (!App.viewController.adminInstances?.videoController) {
                    alert('Video controls not available.');
                    return;
                }
                const filename = document.getElementById('manual-video-input')?.value;
                if (!filename) {
                    alert('Enter a video filename (e.g., jaw001.mp4)');
                    return;
                }
                try {
                    await App.viewController.adminInstances.videoController.addToQueue(null, filename);
                    UIManager.showSuccess(`Added ${filename} to queue`);
                    document.getElementById('manual-video-input').value = '';
                } catch (error) {
                    console.error('Failed to add video to queue:', error);
                    UIManager.showError(`Failed to add video: ${error.message}`);
                }
            },

            async adminClearQueue() {
                if (!App.viewController.adminInstances?.videoController) {
                    alert('Video controls not available.');
                    return;
                }
                if (!confirm('Clear entire video queue?')) {
                    return;
                }
                try {
                    await App.viewController.adminInstances.videoController.clearQueue();
                    UIManager.showSuccess('Queue cleared');
                } catch (error) {
                    console.error('Failed to clear queue:', error);
                    UIManager.showError(`Failed to clear queue: ${error.message}`);
                }
            },

            // Update admin panel displays
            updateAdminPanel() {
                // In networked mode, delegate to MonitoringDisplay
                if (this.viewController?.adminInstances?.monitoring) {
                    this.viewController.adminInstances.monitoring.refreshAllDisplays();
                    return;
                }

                // Fallback for standalone mode (no WebSocket connection)
                // Calculate scores from local transactions
                const scoreBoard = document.getElementById('admin-score-board');
                if (scoreBoard) {
                    const teams = {};
                    DataManager.transactions.forEach(tx => {
                        if (!teams[tx.teamId]) {
                            teams[tx.teamId] = {
                                score: 0,
                                count: 0
                            };
                        }
                        teams[tx.teamId].count++;
                        // Use each transaction's stationMode, not the current setting
                        if (tx.stationMode === 'blackmarket') {
                            const score = DataManager.calculateTokenValue(tx);
                            teams[tx.teamId].score += score;
                        }
                    });

                    // Display scores
                    let html = '<table class="score-table"><tr><th>Team</th><th>Tokens</th><th>Score</th></tr>';
                    Object.keys(teams).forEach(teamId => {
                        html += `<tr>
                            <td>${teamId}</td>
                            <td>${teams[teamId].count}</td>
                            <td>${teams[teamId].score.toLocaleString()}</td>
                        </tr>`;
                    });
                    html += '</table>';
                    scoreBoard.innerHTML = html;
                }

                // Update transaction log
                const transactionLog = document.getElementById('admin-transaction-log');
                if (transactionLog && DataManager.transactions) {
                    const recentTransactions = DataManager.transactions.slice(-10).reverse();
                    let html = '<div class="transaction-list">';
                    recentTransactions.forEach(tx => {
                        html += `<div class="transaction-item">
                            <span class="tx-time">${new Date(tx.timestamp).toLocaleTimeString()}</span>
                            <span class="tx-team">${tx.teamId}</span>
                            <span class="tx-token">${tx.tokenId || tx.rfid}</span>
                            <span class="tx-type">${tx.memoryType || 'UNKNOWN'}</span>
                        </div>`;
                    });
                    html += '</div>';
                    transactionLog.innerHTML = html;
                }
            },

            async adminResetScores() {
                if (!confirm('Are you sure you want to reset all team scores? This cannot be undone.')) return;

                if (!App.viewController.adminInstances?.adminOps) {
                    alert('Admin functions not available.');
                    return;
                }

                try {
                    await App.viewController.adminInstances.adminOps.resetScores();
                    Debug.log('Scores reset successfully');

                    // Clear local backend scores cache
                    if (window.DataManager && window.DataManager.backendScores) {
                        window.DataManager.backendScores.clear();
                    }

                    // Update admin panel display
                    if (App.viewController.currentView === 'admin') {
                        App.updateAdminPanel();
                    }
                } catch (error) {
                    console.error('Failed to reset scores:', error);
                    UIManager.showError(`Failed to reset scores: ${error.message}`);
                    alert(`Failed to reset scores: ${error.message}`);
                }
            },

            async adminClearTransactions() {
                if (!confirm('Are you sure you want to clear transaction history?')) return;

                if (!App.viewController.adminInstances?.adminOps) {
                    alert('Admin functions not available.');
                    return;
                }

                try {
                    await App.viewController.adminInstances.adminOps.clearTransactions();
                    Debug.log('Transactions cleared');
                    // Clear local display
                    const logElement = document.getElementById('admin-transaction-log');
                    if (logElement) {
                        logElement.innerHTML = '';
                    }
                } catch (error) {
                    console.error('Failed to clear transactions:', error);
                    UIManager.showError(`Failed to clear transactions: ${error.message}`);
                    alert(`Failed to clear transactions: ${error.message}`);
                }
            },

            // Helper to switch to a specific view
            switchView(viewName) {
                this.viewController.switchView(viewName);
            },

            // Scanning
            async startScan() {
                const button = document.getElementById('scanButton');
                const status = document.getElementById('scanStatus');
                
                if (!this.nfcSupported) {
                    this.simulateScan();
                    return;
                }
                
                try {
                    button.disabled = true;
                    button.textContent = 'Scanning...';
                    status.textContent = 'Scanning... Tap a token';
                    
                    await NFCHandler.startScan(
                        (result) => this.processNFCRead(result),
                        (err) => {
                            Debug.log(`NFC read error: ${err?.message || err}`, true);
                            status.textContent = 'Read error. Try again.';
                            button.disabled = false;
                            button.textContent = 'Start Scanning';
                        }
                    );
                } catch (error) {
                    Debug.log(`Scan error: ${error.message}`, true);
                    status.textContent = 'NFC not available. Using demo mode.';
                    this.simulateScan();
                }
            },
            
            simulateScan() {
                const status = document.getElementById('scanStatus');
                status.textContent = 'Demo Mode: Simulating scan...';
                
                setTimeout(() => {
                    const result = NFCHandler.simulateScan();
                    this.processNFCRead(result);
                }, CONFIG.SCAN_SIMULATION_DELAY);
            },
            
            processNFCRead(result) {
                Debug.log(`Processing token: "${result.id}" (from ${result.source})`);
                Debug.log(`Token ID length: ${result.id.length} characters`);

                // VALIDATION: Ensure team is selected before processing
                if (!this.currentTeamId || this.currentTeamId.trim() === '') {
                    Debug.log('ERROR: No team selected - cannot process token', true);
                    UIManager.showError('Please select a team before scanning tokens');

                    // Reset scan button if it exists
                    const button = document.getElementById('scanButton');
                    if (button) {
                        button.disabled = false;
                        button.textContent = 'Start Scanning';
                    }
                    return;
                }

                // Trim any whitespace
                const cleanId = result.id.trim();
                Debug.log(`Cleaned ID: "${cleanId}" (length: ${cleanId.length})`);

                // Look up token first to get normalized ID (findToken handles case variations)
                const tokenData = TokenManager.findToken(cleanId);

                // Use matched ID for duplicate check (handles case variations)
                const tokenId = tokenData ? tokenData.matchedId : cleanId;

                // Check for duplicate using normalized ID
                if (DataManager.isTokenScanned(tokenId)) {
                    Debug.log(`Duplicate token detected: ${tokenId}`, true);
                    this.showDuplicateError(tokenId);
                    return;
                }

                if (!tokenData) {
                    this.recordTransaction(null, cleanId, true);
                } else {
                    this.recordTransaction(tokenData.token, tokenData.matchedId, false);
                }
            },
            
            showDuplicateError(tokenId) {
                const button = document.getElementById('scanButton');
                button.disabled = false;
                button.textContent = 'Start Scanning';
                
                const statusEl = document.getElementById('resultStatus');
                statusEl.className = 'status-message error';
                statusEl.innerHTML = `
                    <h2>Token Already Scanned</h2>
                    <p style="font-size: 14px;">This token has been used</p>
                    <p style="font-size: 12px; color: #666;">ID: ${tokenId}</p>
                `;
                
                document.getElementById('resultRfid').textContent = tokenId;
                document.getElementById('resultType').textContent = 'DUPLICATE';
                document.getElementById('resultType').style.color = '#FF5722';
                document.getElementById('resultGroup').textContent = 'Previously scanned';
                document.getElementById('resultValue').textContent = 'No points awarded';
                
                UIManager.showScreen('result');
            },
            
            recordTransaction(token, tokenId, isUnknown) {
                const transaction = {
                    timestamp: new Date().toISOString(),
                    deviceId: Settings.deviceId,
                    stationMode: Settings.stationMode,
                    teamId: this.currentTeamId,
                    rfid: tokenId,
                    tokenId: tokenId,  // Add tokenId for consistency with backend
                    memoryType: isUnknown ? 'UNKNOWN' : (token?.SF_MemoryType || 'UNKNOWN'),
                    group: isUnknown ? `Unknown: ${tokenId}` : (token?.SF_Group || ''),
                    valueRating: isUnknown ? 0 : (token?.SF_ValueRating || 0),
                    isUnknown: isUnknown
                };

                // Submit transaction based on session mode
                if (window.sessionModeManager && window.sessionModeManager.isNetworked()) {
                    // Networked mode - DON'T add to DataManager yet (will be added when backend confirms)
                    DataManager.markTokenAsScanned(tokenId);  // Still mark as scanned to prevent duplicates

                    // Queue manager MUST be ready - fail visibly if not
                    if (!window.queueManager) {
                        throw new Error('Cannot scan: NetworkedQueueManager not initialized. Please reconnect.');
                    }

                    // Use queue manager for reliable delivery
                    const txId = window.queueManager.queueTransaction({
                        tokenId: tokenId,
                        teamId: this.currentTeamId,
                        deviceId: Settings.deviceId,
                        mode: Settings.stationMode,  // AsyncAPI contract field (was 'stationMode')
                        timestamp: transaction.timestamp  // Use same timestamp
                    });
                    Debug.log(`Transaction queued for orchestrator: ${txId}`);
                } else {
                    // Standalone mode or no session mode - save locally only
                    DataManager.addTransaction(transaction);
                    DataManager.markTokenAsScanned(tokenId);

                    if (window.sessionModeManager && window.sessionModeManager.isStandalone()) {
                        Debug.log('Transaction stored locally (standalone mode)');
                        // Also save to StandaloneDataManager if available
                        if (window.dataManager && window.dataManager !== DataManager) {
                            window.dataManager.addTransaction(transaction);
                        }
                    } else {
                        Debug.log('No session mode selected - storing locally only');
                    }
                }

                if (Settings.stationMode === 'blackmarket' && !isUnknown) {
                    const tokenScore = DataManager.calculateTokenValue(transaction);
                    Debug.log(`Token scored: $${tokenScore.toLocaleString()}`);
                }

                UIManager.updateSessionStats();
                UIManager.showTokenResult(token, tokenId, isUnknown);
                
                const button = document.getElementById('scanButton');
                button.disabled = false;
                button.textContent = 'Start Scanning';
            },
            
            manualEntry() {
                const rfid = prompt('Enter RFID manually:');
                if (rfid && rfid.trim()) {
                    this.processNFCRead({
                        id: rfid.trim(),
                        source: 'manual',
                        raw: rfid.trim()
                    });
                }
            },
            
            cancelScan() {
                NFCHandler.stopScan();
                this.currentTeamId = '';
                UIManager.updateTeamDisplay('');
                UIManager.showScreen('teamEntry');
            },
            
            continueScan() {
                UIManager.updateSessionStats();
                UIManager.showScreen('scan');
            },
            
            finishTeam() {
                this.currentTeamId = '';
                DataManager.clearSession();
                UIManager.updateTeamDisplay('');
                UIManager.showScreen('teamEntry');
            },
            
            // History
            showHistory() {
                UIManager.updateHistoryStats();
                UIManager.renderTransactions();
                UIManager.showScreen('history');
            },
            
            closeHistory() {
                // Default to teamEntry if no valid previous screen
                const targetScreen = UIManager.previousScreen || 'teamEntry';
                UIManager.showScreen(targetScreen);
            },
            
            // Scoreboard
            showScoreboard() {
                if (Settings.stationMode !== 'blackmarket') {
                    Debug.log('Scoreboard only available in Black Market mode');
                    return;
                }
                UIManager.renderScoreboard();
                UIManager.showScreen('scoreboard');
            },
            
            closeScoreboard() {
                // Default to teamEntry if no valid previous screen
                const targetScreen = UIManager.previousScreen || 'teamEntry';
                UIManager.showScreen(targetScreen);
            },
            
            // Team Details
            showTeamDetails(teamId) {
                const transactions = DataManager.getTeamTransactions(teamId);
                UIManager.renderTeamDetails(teamId, transactions);
                UIManager.showScreen('teamDetails');
            },
            
            closeTeamDetails() {
                UIManager.showScreen('scoreboard');
            },
            
            // Testing Functions
            testTokenMatch() {
                const testId = prompt('Enter a token ID to test:');
                if (testId) {
                    const result = TokenManager.findToken(testId);
                    if (result) {
                        alert(`Match found!\nID: ${result.matchedId}\nType: ${result.token.SF_MemoryType}\nGroup: ${result.token.SF_Group}`);
                    } else {
                        alert(`No match found for: ${testId}`);
                    }
                }
            },
            
            testGroupParsing() {
                const testCases = [
                    'Server Logs (x5)',
                    'Marcus\' Memories (x1)',
                    'Government Files (x3)',
                    'No Multiplier Group',
                    'Bad Format (x)',
                    'Zero Multiplier (x0)',
                    'Large Multiplier (x999)'
                ];
                
                console.log('=== Testing Group Parsing ===');
                testCases.forEach(testCase => {
                    const parsed = DataManager.parseGroupInfo(testCase);
                    const normalized = DataManager.normalizeGroupName(parsed.name);
                    console.log(`Input: "${testCase}"`);
                    console.log(`  Parsed: name="${parsed.name}", multiplier=${parsed.multiplier}`);
                    console.log(`  Normalized: "${normalized}"`);
                });
                
                alert('Check console for test results');
            },
            
            testGroupInventory() {
                const inventory = TokenManager.getGroupInventory();
                
                console.log('=== Group Inventory Test ===');
                console.log('Total groups:', Object.keys(inventory).length);
                
                Object.entries(inventory).forEach(([normalizedName, groupData]) => {
                    console.log(`\nGroup: "${groupData.displayName}"`);
                    console.log(`  Normalized: "${normalizedName}"`);
                    console.log(`  Multiplier: ${groupData.multiplier}x`);
                    console.log(`  Tokens: ${groupData.tokens.size}`);
                });
                
                alert('Check console for group inventory details');
            },
            
            testCompletionDetection() {
                console.log('=== Testing Group Completion Detection ===\n');
                
                const realTeams = [...new Set(DataManager.transactions
                    .filter(t => t.stationMode === 'blackmarket')
                    .map(t => t.teamId))];
                
                if (realTeams.length > 0) {
                    console.log('=== Testing with REAL data ===');
                    realTeams.forEach(teamId => {
                        const completed = DataManager.getTeamCompletedGroups(teamId);
                        console.log(`Team ${teamId}: ${completed.length} completed groups`);
                        completed.forEach(group => {
                            console.log(`  ✅ "${group.name}" - ${group.tokenCount} tokens, ${group.multiplier}x`);
                        });
                    });
                } else {
                    console.log('No real data found. Add some transactions first.');
                }
                
                alert('Check console for completion detection results');
            },
            
            testBonusCalculations() {
                console.log('=== Testing Bonus Score Calculations ===\n');
                
                const teamScores = DataManager.getTeamScores();
                
                if (teamScores.length > 0) {
                    teamScores.forEach((team, index) => {
                        console.log(`${index + 1}. Team ${team.teamId}`);
                        console.log(`   Base: $${team.baseScore.toLocaleString()}`);
                        console.log(`   Bonus: $${team.bonusScore.toLocaleString()}`);
                        console.log(`   Total: $${team.score.toLocaleString()}`);
                        console.log(`   Completed Groups: ${team.completedGroups}`);
                    });
                } else {
                    console.log('No teams found. Add some transactions first.');
                }
                
                alert('Check console for bonus calculation results');
            },
            
            testEnhancedUI() {
                console.log('=== Testing Enhanced UI Data Structure ===\n');
                
                const teamId = prompt('Enter a team ID to test (or leave blank for first team):');
                const testTeamId = teamId || DataManager.transactions[0]?.teamId;
                
                if (!testTeamId) {
                    alert('No teams found. Add some transactions first.');
                    return;
                }
                
                const enhancedData = DataManager.getEnhancedTeamTransactions(testTeamId);
                
                console.log(`Team ${testTeamId} Enhanced Data:`);
                console.log(`  Completed Groups: ${enhancedData.completedGroups.length}`);
                console.log(`  In-Progress Groups: ${enhancedData.incompleteGroups.length}`);
                console.log(`  Ungrouped Tokens: ${enhancedData.ungroupedTokens.length}`);
                console.log(`  Unknown Tokens: ${enhancedData.unknownTokens.length}`);
                
                if (enhancedData.hasCompletedGroups) {
                    console.log('\nCompleted Groups:');
                    enhancedData.completedGroups.forEach(group => {
                        console.log(`  "${group.displayName}": ${group.tokens.length} tokens, +$${group.bonusValue.toLocaleString()} bonus`);
                    });
                }
                
                if (enhancedData.hasIncompleteGroups) {
                    console.log('\nIn-Progress Groups:');
                    enhancedData.incompleteGroups.forEach(group => {
                        console.log(`  "${group.displayName}": ${group.progress} (${group.percentage}%)`);
                    });
                }
                
                alert('Check console for enhanced UI data structure');
            }
        };


// Export for Node.js testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = App;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.App = App;
}
