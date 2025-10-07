/**
 * Admin Module
 * Unified admin functionality extracted from admin panel
 * Extracted from monolith per Phase 4.1.4
 *
 * CRITICAL: Uses WebSocket gm:command events per AsyncAPI contract (line 1002)
 * NOT HTTP fetch - admin commands via WebSocket only
 */

const AdminModule = {
    // Session Management
    SessionManager: class {
        constructor(connection) {
            this.connection = connection; // OrchestratorClient instance with socket
            this.currentSession = null;

            // BUG FIX (Phase 2.3): Listen to session:update broadcasts for state
            // Broadcasts are single source of truth (event-driven architecture)
            this.connection.on('session:update', (session) => {
                this.currentSession = session;
            });
        }

        async createSession(name, teams = ['001', '002', '003']) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Session creation timeout'));
                }, 5000);

                // Listen for acknowledgment
                this.connection.socket.once('gm:command:ack', (response) => {
                    clearTimeout(timeout);
                    if (response.data.success) {
                        // State updates from broadcasts (see constructor listener)
                        // Just resolve command success
                        resolve(response.data.session);
                    } else {
                        reject(new Error(response.data.message || 'Failed to create session'));
                    }
                });

                // Send command via WebSocket (per AsyncAPI contract)
                this.connection.socket.emit('gm:command', {
                    event: 'gm:command',
                    data: {
                        action: 'session:create',
                        payload: { name, teams }
                    },
                    timestamp: new Date().toISOString()
                });
            });
        }

        async pauseSession() {
            if (!this.currentSession) return;

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

                this.connection.socket.once('gm:command:ack', (response) => {
                    clearTimeout(timeout);
                    if (response.data.success) {
                        // State updates from broadcasts (see constructor listener)
                        resolve(response.data.session);
                    } else {
                        reject(new Error(response.data.message || 'Failed to pause session'));
                    }
                });

                this.connection.socket.emit('gm:command', {
                    event: 'gm:command',
                    data: {
                        action: 'session:pause',
                        payload: {}
                    },
                    timestamp: new Date().toISOString()
                });
            });
        }

        async resumeSession() {
            if (!this.currentSession) return;

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

                this.connection.socket.once('gm:command:ack', (response) => {
                    clearTimeout(timeout);
                    if (response.data.success) {
                        // State updates from broadcasts (see constructor listener)
                        resolve(response.data.session);
                    } else {
                        reject(new Error(response.data.message || 'Failed to resume session'));
                    }
                });

                this.connection.socket.emit('gm:command', {
                    event: 'gm:command',
                    data: {
                        action: 'session:resume',
                        payload: {}
                    },
                    timestamp: new Date().toISOString()
                });
            });
        }

        async endSession() {
            if (!this.currentSession) return;

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

                this.connection.socket.once('gm:command:ack', (response) => {
                    clearTimeout(timeout);
                    if (response.data.success) {
                        // State updates from broadcasts (see constructor listener)
                        resolve(response.data);
                    } else {
                        reject(new Error(response.data.message || 'Failed to end session'));
                    }
                });

                this.connection.socket.emit('gm:command', {
                    event: 'gm:command',
                    data: {
                        action: 'session:end',
                        payload: {}
                    },
                    timestamp: new Date().toISOString()
                });
            });
        }

        // BUG FIX (Phase 2.3): updateDisplay() removed - separation of concerns
        // SessionManager maintains state (currentSession from broadcasts)
        // MonitoringDisplay updates DOM (from session:update events)
        // This follows event-driven architecture with clear responsibilities
    },

    // Video Control
    VideoController: class {
        constructor(connection) {
            this.connection = connection;
            this.currentVideo = null;
            this.queueLength = 0;
        }

        async playVideo() {
            return this._sendVideoCommand('video:play');
        }

        async pauseVideo() {
            return this._sendVideoCommand('video:pause');
        }

        async stopVideo() {
            return this._sendVideoCommand('video:stop');
        }

        async skipVideo() {
            return this._sendVideoCommand('video:skip');
        }

        async addToQueue(tokenId, filename) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

                this.connection.socket.once('gm:command:ack', (response) => {
                    clearTimeout(timeout);
                    if (response.data.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.data.message || 'Failed to add to queue'));
                    }
                });

                this.connection.socket.emit('gm:command', {
                    event: 'gm:command',
                    data: {
                        action: 'video:queue:add',
                        payload: { tokenId, filename }
                    },
                    timestamp: new Date().toISOString()
                });
            });
        }

        async reorderQueue(fromIndex, toIndex) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

                this.connection.socket.once('gm:command:ack', (response) => {
                    clearTimeout(timeout);
                    if (response.data.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.data.message || 'Failed to reorder queue'));
                    }
                });

                this.connection.socket.emit('gm:command', {
                    event: 'gm:command',
                    data: {
                        action: 'video:queue:reorder',
                        payload: { fromIndex, toIndex }
                    },
                    timestamp: new Date().toISOString()
                });
            });
        }

        async clearQueue() {
            return this._sendVideoCommand('video:queue:clear');
        }

        _sendVideoCommand(action) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

                this.connection.socket.once('gm:command:ack', (response) => {
                    clearTimeout(timeout);
                    if (response.data.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.data.message || `Failed: ${action}`));
                    }
                });

                this.connection.socket.emit('gm:command', {
                    event: 'gm:command',
                    data: {
                        action: action,
                        payload: {}
                    },
                    timestamp: new Date().toISOString()
                });
            });
        }

        updateDisplay(videoStatus) {
            const currentElement = document.getElementById('admin-current-video');
            const queueElement = document.getElementById('admin-queue-length');

            if (currentElement) {
                currentElement.textContent = videoStatus?.current || 'None';
            }
            if (queueElement) {
                queueElement.textContent = videoStatus?.queueLength || '0';
            }
        }
    },

    // System Monitoring
    SystemMonitor: class {
        constructor() {
            this.statusElements = {};
            this.devices = [];
        }

        updateOrchestratorStatus(status) {
            const element = document.getElementById('orchestrator-status');
            if (element) {
                element.className = status === 'connected' ? 'status-dot connected' : 'status-dot disconnected';
                element.title = status;
            }
        }

        updateVLCStatus(status) {
            const element = document.getElementById('vlc-status');
            if (element) {
                element.className = status === 'ready' ? 'status-dot connected' : 'status-dot disconnected';
                element.title = status;
            }
        }

        updateDeviceList(devices) {
            this.devices = devices;
            const countElement = document.getElementById('device-count');
            const listElement = document.getElementById('device-list');

            if (countElement) {
                countElement.textContent = devices.length;
            }

            if (listElement) {
                listElement.innerHTML = devices.map(device => `
                    <div class="device-item">
                        <span>${device.deviceId}</span>
                        <span class="device-type">${device.deviceType}</span>
                    </div>
                `).join('');
            }
        }

        refresh() {
            // Request latest status from server
            if (window.connectionManager?.client) {
                window.connectionManager.client.requestStateSync();
            }
        }
    },

    // Admin Operations
    AdminOperations: class {
        constructor(connection) {
            this.connection = connection;
        }

        async systemReset() {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

                this.connection.socket.once('gm:command:ack', (response) => {
                    clearTimeout(timeout);
                    if (response.data.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.data.message || 'Failed to reset system'));
                    }
                });

                this.connection.socket.emit('gm:command', {
                    event: 'gm:command',
                    data: {
                        action: 'system:reset',
                        payload: {}
                    },
                    timestamp: new Date().toISOString()
                });
            });
        }

        async adjustScore(teamId, delta, reason) {
            // Validate inputs per contract requirements
            if (!teamId || !/^[0-9]{3}$/.test(teamId)) {
                return Promise.reject(new Error('Invalid teamId format. Must be 3 digits (e.g., "001")'));
            }

            if (typeof delta !== 'number' || isNaN(delta)) {
                return Promise.reject(new Error('Invalid delta. Must be a number'));
            }

            if (!reason || reason.trim() === '') {
                return Promise.reject(new Error('Reason is required for audit trail'));
            }

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

                this.connection.socket.once('gm:command:ack', (response) => {
                    clearTimeout(timeout);
                    if (response.data.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.data.message || 'Failed to adjust score'));
                    }
                });

                this.connection.socket.emit('gm:command', {
                    event: 'gm:command',
                    data: {
                        action: 'score:adjust',
                        payload: { teamId, delta, reason }
                    },
                    timestamp: new Date().toISOString()
                });
            });
        }

        async deleteTransaction(transactionId) {
            if (!transactionId) {
                return Promise.reject(new Error('Transaction ID is required'));
            }

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

                this.connection.socket.once('gm:command:ack', (response) => {
                    clearTimeout(timeout);
                    if (response.data.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.data.message || 'Failed to delete transaction'));
                    }
                });

                this.connection.socket.emit('gm:command', {
                    event: 'gm:command',
                    data: {
                        action: 'transaction:delete',
                        payload: { transactionId }
                    },
                    timestamp: new Date().toISOString()
                });
            });
        }

        async createTransaction(transaction) {
            // Validate required transaction fields
            const requiredFields = ['tokenId', 'teamId', 'deviceId', 'mode'];
            for (const field of requiredFields) {
                if (!transaction[field]) {
                    return Promise.reject(new Error(`Missing required field: ${field}`));
                }
            }

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

                this.connection.socket.once('gm:command:ack', (response) => {
                    clearTimeout(timeout);
                    if (response.data.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.data.message || 'Failed to create transaction'));
                    }
                });

                this.connection.socket.emit('gm:command', {
                    event: 'gm:command',
                    data: {
                        action: 'transaction:create',
                        payload: transaction
                    },
                    timestamp: new Date().toISOString()
                });
            });
        }

        // Legacy methods redirected to new WebSocket commands
        async resetScores() {
            return this.systemReset();
        }

        async clearTransactions() {
            return this.systemReset();
        }
    },

    // Monitoring Display
    MonitoringDisplay: class {
        constructor(connection) {
            this.connection = connection;
            this.setupEventListeners();
        }

        /**
         * Register all monitoring event listeners
         * Called on construction to wire events → display updates
         */
        setupEventListeners() {
            // CRITICAL: transaction:new payload is { transaction: {...} }, not flat
            // BUG FIX (Phase 2.3): Unwrap transaction from payload
            // BUG FIX (Phase 5): Add null safety for malformed event data
            this.connection.on('transaction:new', (payload) => {
                if (payload && payload.transaction) {
                    this.updateTransactionDisplay(payload.transaction);
                }
            });
            this.connection.on('score:updated', (data) => this.updateScoreDisplay(data));
            this.connection.on('session:update', (data) => this.updateSessionDisplay(data));
            this.connection.on('video:status', (data) => this.updateVideoDisplay(data));
            this.connection.on('device:connected', () => this.updateSystemDisplay());
            this.connection.on('device:disconnected', () => this.updateSystemDisplay());
            this.connection.on('sync:full', (data) => this.updateAllDisplays(data));
        }

        /**
         * Update transaction log display
         * FR 4.1.5: Transaction Monitoring
         * Shows recent transactions with metadata
         */
        updateTransactionDisplay(transaction) {
            if (!transaction) return;

            const transactionLog = document.getElementById('admin-transaction-log');
            if (!transactionLog) return;

            // Create transaction HTML element
            const txTime = transaction.timestamp ? new Date(transaction.timestamp).toLocaleTimeString() : '-';
            const memoryType = transaction.memoryType || 'UNKNOWN';

            const txHtml = `
                <div class="transaction-item">
                    <span class="tx-time">${txTime}</span>
                    <span class="tx-team">${transaction.teamId || '-'}</span>
                    <span class="tx-token">${transaction.tokenId || '-'}</span>
                    <span class="tx-type">${memoryType}</span>
                </div>
            `;

            // Prepend new transaction (most recent first)
            transactionLog.innerHTML = txHtml + transactionLog.innerHTML;

            // Keep only last 10 transactions
            const items = transactionLog.querySelectorAll('.transaction-item');
            if (items.length > 10) {
                for (let i = 10; i < items.length; i++) {
                    items[i].remove();
                }
            }
        }

        /**
         * Update score board display
         * FR 4.1.4: Score Monitoring
         * Shows all team scores with breakdown
         */
        updateScoreDisplay(scoreData) {
            if (!scoreData) return;

            const scoreBoard = document.getElementById('admin-score-board');
            if (!scoreBoard) return;

            // Build complete score table from DataManager.backendScores
            // This method is called for each team's score update
            // We rebuild the entire table to ensure consistency

            if (window.DataManager && window.DataManager.backendScores) {
                let html = '<table class="score-table"><tr><th>Team</th><th>Tokens</th><th>Score</th></tr>';

                window.DataManager.backendScores.forEach((teamScore, teamId) => {
                    const tokensScanned = teamScore.tokensScanned || 0;
                    const currentScore = teamScore.currentScore || 0;

                    html += `<tr>
                        <td>${teamId}</td>
                        <td>${tokensScanned}</td>
                        <td>${currentScore.toLocaleString()}</td>
                    </tr>`;
                });

                html += '</table>';
                scoreBoard.innerHTML = html;
            }
        }

        /**
         * Update session display
         * FR 4.1.1: Session Monitoring
         * Shows current session info
         */
        updateSessionDisplay(session) {
            const sessionIdElem = document.getElementById('admin-session-id');
            const sessionStatusElem = document.getElementById('admin-session-status');

            if (sessionIdElem) {
                sessionIdElem.textContent = session?.id || '-';
            }

            if (sessionStatusElem) {
                sessionStatusElem.textContent = session?.status || 'No Session';
            }
        }

        /**
         * Update video display
         * FR 4.1.2: Video Monitoring
         * Shows current video and queue length
         */
        updateVideoDisplay(videoStatus) {
            if (!videoStatus) return;

            const currentVideoElem = document.getElementById('admin-current-video');
            const queueLengthElem = document.getElementById('admin-queue-length');

            if (currentVideoElem) {
                currentVideoElem.textContent = videoStatus.tokenId || 'None';
            }

            if (queueLengthElem) {
                queueLengthElem.textContent = String(videoStatus.queueLength || 0);
            }
        }

        /**
         * Update system display
         * FR 4.1.3: System Monitoring
         * Shows orchestrator/VLC status and device list
         */
        updateSystemDisplay() {
            // Update orchestrator status based on connection state
            const orchestratorElem = document.getElementById('orchestrator-status');
            if (orchestratorElem) {
                const status = this.connection.isConnected ? 'connected' : 'disconnected';
                orchestratorElem.className = status === 'connected'
                    ? 'status-dot connected'
                    : 'status-dot disconnected';
                orchestratorElem.title = status;
            }

            // Update device count and list
            const devices = this.connection.connectedDevices || [];
            const deviceCountElem = document.getElementById('device-count');
            const deviceListElem = document.getElementById('device-list');

            if (deviceCountElem) {
                deviceCountElem.textContent = String(devices.length);
            }

            if (deviceListElem) {
                if (devices.length === 0) {
                    deviceListElem.innerHTML = '';
                } else {
                    deviceListElem.innerHTML = devices.map(device => `
                        <div class="device-item">
                            <span>${device.deviceId || 'Unknown'}</span>
                            <span class="device-type">${device.type || '-'}</span>
                        </div>
                    `).join('');
                }
            }
        }

        /**
         * Initialize all displays from sync:full event
         * Called on connection/reconnection to populate displays
         */
        updateAllDisplays(syncData) {
            if (!syncData) return;

            // Update session display
            if (syncData.session) {
                this.updateSessionDisplay(syncData.session);
            } else {
                this.updateSessionDisplay(null);
            }

            // Update video display
            if (syncData.videoStatus) {
                this.updateVideoDisplay(syncData.videoStatus);
            }

            // Update all team scores
            if (syncData.scores && Array.isArray(syncData.scores)) {
                // Process each score through DataManager
                syncData.scores.forEach(scoreData => {
                    if (window.DataManager) {
                        window.DataManager.updateTeamScoreFromBackend(scoreData);
                    }
                });

                // Trigger single score display update
                if (syncData.scores.length > 0) {
                    this.updateScoreDisplay(syncData.scores[0]);
                }
            }

            // Update transaction log (last 10)
            if (syncData.recentTransactions && Array.isArray(syncData.recentTransactions)) {
                const transactionLog = document.getElementById('admin-transaction-log');
                if (transactionLog) {
                    // Clear existing and add last 10 in reverse order (most recent first)
                    transactionLog.innerHTML = '';

                    const recent = syncData.recentTransactions.slice(-10).reverse();
                    recent.forEach(tx => this.updateTransactionDisplay(tx));
                }
            }

            // Update system display
            this.updateSystemDisplay();
        }

        /**
         * Manually refresh all displays from cached data
         * Used when switching to admin view
         */
        refreshAllDisplays() {
            // Refresh from DataManager cached data
            if (window.DataManager) {
                // Trigger score display rebuild
                if (window.DataManager.backendScores && window.DataManager.backendScores.size > 0) {
                    const firstScore = Array.from(window.DataManager.backendScores.values())[0];
                    this.updateScoreDisplay(firstScore);
                }

                // Refresh transaction log (last 10)
                if (window.DataManager.transactions && window.DataManager.transactions.length > 0) {
                    const transactionLog = document.getElementById('admin-transaction-log');
                    if (transactionLog) {
                        transactionLog.innerHTML = '';
                        const recent = window.DataManager.transactions.slice(-10).reverse();
                        recent.forEach(tx => this.updateTransactionDisplay(tx));
                    }
                }
            }

            // Refresh system display
            this.updateSystemDisplay();
        }
    }
};

// Export for Node.js testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdminModule;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.AdminModule = AdminModule;
}
