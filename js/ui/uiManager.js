/**
 * UI Manager Module
 * Manages all UI rendering and screen navigation
 * Extracted from monolith per Phase 4.3.1
 *
 * NEW: Error display methods added (Finding #57, #58, Decision #10)
 */

const UIManager = {
    screens: {},
    previousScreen: null,
    errorContainer: null,

    /**
     * Initialize UI elements
     */
    init() {
        this.screens = {
            loading: document.getElementById('loadingScreen'),
            settings: document.getElementById('settingsScreen'),
            gameModeScreen: document.getElementById('gameModeScreen'),
            teamEntry: document.getElementById('teamEntryScreen'),
            scan: document.getElementById('scanScreen'),
            result: document.getElementById('resultScreen'),
            history: document.getElementById('historyScreen'),
            scoreboard: document.getElementById('scoreboardScreen'),
            teamDetails: document.getElementById('teamDetailsScreen')
        };

        // Initialize error display container
        this.initErrorDisplay();
    },

    /**
     * Initialize error display container
     * NEW METHOD - Decision #10 requirement
     */
    initErrorDisplay() {
        // Create error container if doesn't exist
        if (!document.getElementById('error-container')) {
            const container = document.createElement('div');
            container.id = 'error-container';
            container.className = 'error-container';
            document.body.appendChild(container);
        }
        this.errorContainer = document.getElementById('error-container');
    },

    /**
     * Show error message to user
     * NEW METHOD - Decision #10 requirement
     * @param {string} message - Error message to display
     * @param {number} duration - Duration in milliseconds (default 5000)
     */
    showError(message, duration = 5000) {
        if (!this.errorContainer) {
            this.initErrorDisplay();
        }

        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;

        this.errorContainer.appendChild(errorDiv);

        // Auto-dismiss after duration
        setTimeout(() => {
            errorDiv.style.animation = 'slideOut 0.3s ease-out forwards';
            setTimeout(() => errorDiv.remove(), 300);
        }, duration);
    },

    /**
     * Show toast notification to user
     * NEW METHOD - Decision #10 requirement
     * @param {string} message - Notification message
     * @param {string} type - Toast type: 'info', 'success', 'warning', 'error'
     * @param {number} duration - Duration in milliseconds (default 3000)
     */
    showToast(message, type = 'info', duration = 3000) {
        if (!this.errorContainer) {
            this.initErrorDisplay();
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        this.errorContainer.appendChild(toast);

        // Auto-dismiss after duration
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-out forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    /**
     * Show specified screen
     * @param {string} screenName - Name of screen to show
     */
    showScreen(screenName) {
        // Track previous screen for back navigation
        const current = document.querySelector('.screen.active');
        if (current && current.id !== 'historyScreen' &&
            current.id !== 'scoreboardScreen' &&
            current.id !== 'teamDetailsScreen' &&
            current.id !== 'gameModeScreen' &&
            current.id !== 'loadingScreen' &&
            screenName !== 'history' &&
            screenName !== 'scoreboard' &&
            screenName !== 'teamDetails') {
            this.previousScreen = current.id.replace('Screen', '');
        }

        // Hide all screens
        Object.values(this.screens).forEach(screen => {
            screen.classList.remove('active');
        });

        // Show requested screen
        if (this.screens[screenName]) {
            this.screens[screenName].classList.add('active');
        }
    },

    /**
     * Update mode display elements
     * @param {string} mode - 'detective' or 'blackmarket'
     */
    updateModeDisplay(mode) {
        const indicator = document.getElementById('modeIndicator');
        const modeText = document.getElementById('modeText');
        const toggle = document.getElementById('modeToggle');

        if (mode === 'blackmarket') {
            indicator.className = 'mode-indicator mode-blackmarket';
            indicator.textContent = 'Black Market Mode';
            if (modeText) modeText.textContent = 'Black Market Mode';
            if (toggle) toggle.checked = true;
        } else {
            indicator.className = 'mode-indicator mode-detective';
            indicator.textContent = 'Detective Mode';
            if (modeText) modeText.textContent = 'Detective Mode';
            if (toggle) toggle.checked = false;
        }

        this.updateNavigationButtons();
    },

    /**
     * Update navigation button visibility
     */
    updateNavigationButtons() {
        const scoreboardButton = document.getElementById('scoreboardButton');
        if (scoreboardButton) {
            scoreboardButton.style.display =
                Settings.mode === 'blackmarket' ? 'block' : 'none';
        }
    },

    /**
     * Update team display
     * @param {string} teamId - Team ID to display
     */
    updateTeamDisplay(teamId) {
        const display = document.getElementById('teamDisplay');
        display.textContent = teamId || '_';
    },

    /**
     * Update session statistics display
     */
    updateSessionStats() {
        const stats = DataManager.getSessionStats();
        document.getElementById('teamTokenCount').textContent = stats.count;

        const valueElement = document.getElementById('teamTotalValue');
        const labelElement = document.getElementById('teamValueLabel');

        if (Settings.mode === 'blackmarket') {
            valueElement.textContent = `$${stats.totalScore.toLocaleString()}`;
            if (labelElement) labelElement.textContent = 'Score';
        } else {
            valueElement.textContent = stats.totalValue;
            if (labelElement) labelElement.textContent = 'Total Value';
        }
    },

    /**
     * Update history badge count
     */
    updateHistoryBadge() {
        const badge = document.getElementById('historyBadge');
        const count = DataManager.transactions.length;
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    },

    /**
     * Update history statistics
     */
    updateHistoryStats() {
        const stats = DataManager.getGlobalStats();
        document.getElementById('totalScans').textContent = stats.total;
        document.getElementById('uniqueTeams').textContent = stats.teams;
        document.getElementById('totalValue').textContent = stats.totalValue;
        document.getElementById('avgValue').textContent = stats.avgValue;
    },

    /**
     * Render scoreboard
     */
    renderScoreboard() {
        const container = document.getElementById('scoreboardContainer');
        const teamScores = DataManager.getTeamScores();

        if (teamScores.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No Teams Yet</h3>
                    <p>Teams will appear here after scanning tokens</p>
                </div>
            `;
            return;
        }

        // Add score source indicator
        const scoreSource = teamScores[0]?.isFromBackend ?
            '<div class="score-source" style="text-align: center; margin: 10px 0; padding: 10px; background: rgba(103,126,234,0.1); border-radius: 8px; font-size: 14px;">🔗 Live from Orchestrator</div>' :
            '<div class="score-source" style="text-align: center; margin: 10px 0; padding: 10px; background: rgba(255,152,0,0.1); border-radius: 8px; font-size: 14px;">📱 Local Calculation</div>';

        container.innerHTML = scoreSource + teamScores.map((team, index) => {
            const rank = index + 1;
            const rankClass = rank <= 3 ? `rank-${rank}` : '';
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

            return `
                <div class="scoreboard-entry ${rankClass}" onclick="App.showTeamDetails('${team.teamId}')">
                    <div class="scoreboard-rank">${medal}</div>
                    <div class="scoreboard-team">
                        Team ${team.teamId}
                        <span class="scoreboard-tokens">(${team.tokenCount} tokens)</span>
                    </div>
                    <div class="scoreboard-score">$${team.score.toLocaleString()}</div>
                </div>
            `;
        }).join('');
    },

    /**
     * Render team details with enhanced grouping
     * @param {string} teamId - Team ID
     * @param {Array} transactions - Team transactions
     */
    renderTeamDetails(teamId, transactions) {
        // Get enhanced data structure
        const enhancedData = DataManager.getEnhancedTeamTransactions(teamId);
        const scoreData = DataManager.calculateTeamScoreWithBonuses(teamId);

        // Check if networked mode for intervention controls
        const isNetworked = window.sessionModeManager?.isNetworked();

        // Update header
        document.getElementById('teamDetailsTitle').textContent = `Team ${teamId}`;
        document.getElementById('teamDetailsSummary').textContent =
            `${transactions.length} token${transactions.length !== 1 ? 's' : ''} collected`;

        // Build HTML with grouped sections
        let html = '';

        // Completed Groups Section
        if (enhancedData.hasCompletedGroups) {
            html += '<div class="section-divider">✅ Completed Groups</div>';

            enhancedData.completedGroups.forEach(group => {
                html += `
                    <div class="group-section">
                        <div class="group-header completed">
                            <div class="group-title">
                                <span class="completion-badge">🏆</span>
                                <span class="group-name">${group.displayName}</span>
                                <span class="completion-text">COMPLETE</span>
                            </div>
                            <div class="bonus-amount">
                                +$${group.bonusValue.toLocaleString()} bonus (${group.multiplier}x)
                            </div>
                        </div>`;

                // Add tokens in this group
                group.tokens.forEach(token => {
                    html += this.renderTokenCard(token, true, false, isNetworked);
                });

                html += '</div>';
            });
        }

        // In-progress Groups Section
        if (enhancedData.hasIncompleteGroups) {
            html += '<div class="section-divider">🔶 In Progress Groups</div>';

            enhancedData.incompleteGroups.forEach(group => {
                html += `
                    <div class="group-section">
                        <div class="group-header in-progress">
                            <div class="group-title">
                                <span class="progress-badge">⏳</span>
                                <span class="group-name">${group.displayName}</span>
                                <span class="progress-text">${group.progress}</span>
                            </div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${group.percentage}%"></div>
                            </div>
                        </div>`;

                // Add tokens in this group
                group.tokens.forEach(token => {
                    html += this.renderTokenCard(token, false, false, isNetworked);
                });

                html += '</div>';
            });
        }

        // Ungrouped Tokens Section
        if (enhancedData.hasUngroupedTokens) {
            html += '<div class="section-divider">📦 Individual Tokens</div>';

            enhancedData.ungroupedTokens.forEach(token => {
                html += this.renderTokenCard(token, false, false, isNetworked);
            });
        }

        // Unknown Tokens Section
        if (enhancedData.hasUnknownTokens) {
            html += '<div class="section-divider">❓ Unknown Tokens</div>';

            enhancedData.unknownTokens.forEach(token => {
                html += this.renderTokenCard(token, false, true, isNetworked);
            });
        }

        // Handle empty state
        if (html === '') {
            html = `
                <div class="empty-state">
                    <h3>No Tokens</h3>
                    <p>This team hasn't scanned any tokens yet</p>
                </div>
            `;
        }

        // Update container
        document.getElementById('teamDetailsContainer').innerHTML = html;

        // Check if backend has authoritative score (networked mode)
        const backendScore = DataManager.backendScores?.get(teamId);

        // Use backend scores if available (authoritative in networked mode)
        let displayBaseScore = scoreData.baseScore;
        let displayBonusScore = scoreData.bonusScore;
        let displayTotalScore = scoreData.totalScore;

        if (isNetworked && backendScore) {
            displayBaseScore = backendScore.baseScore;
            displayBonusScore = backendScore.bonusPoints;
            displayTotalScore = backendScore.currentScore;
        }

        // Update score breakdown with authoritative values
        document.getElementById('teamBaseScore').textContent =
            `$${displayBaseScore.toLocaleString()}`;
        document.getElementById('teamBonusScore').textContent =
            `$${displayBonusScore.toLocaleString()}`;
        document.getElementById('teamTotalScore').textContent =
            `$${displayTotalScore.toLocaleString()}`;

        // Display admin adjustments if present
        const adjustmentsSection = document.getElementById('teamAdminAdjustmentsSection');
        if (adjustmentsSection && isNetworked && backendScore?.adminAdjustments?.length > 0) {
            const adjustments = backendScore.adminAdjustments;
            const totalAdjustment = adjustments.reduce((sum, adj) => sum + adj.delta, 0);

            let html = `
                <div class="transaction-detail" style="margin: 8px 0; padding: 12px; background: rgba(255, 193, 7, 0.1); border-left: 4px solid #ffc107; border-radius: 4px;">
                    <label style="color: #856404; font-weight: bold;">⚠️ Admin Adjustments:</label>
                    <span class="value" style="color: ${totalAdjustment >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">
                        ${totalAdjustment >= 0 ? '+' : ''}$${Math.abs(totalAdjustment).toLocaleString()}
                    </span>
                </div>
                <div style="margin-left: 20px; font-size: 12px; color: #666;">
            `;

            adjustments.forEach(adj => {
                const date = new Date(adj.timestamp).toLocaleString();
                html += `
                    <div style="margin: 4px 0; padding: 6px; background: #f8f9fa; border-radius: 3px;">
                        <span style="color: ${adj.delta >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">
                            ${adj.delta >= 0 ? '+' : ''}$${Math.abs(adj.delta).toLocaleString()}
                        </span>
                        - ${adj.reason || 'No reason provided'}
                        <br><span style="font-size: 10px; color: #999;">${date} by ${adj.gmStation}</span>
                    </div>
                `;
            });

            html += '</div>';
            adjustmentsSection.innerHTML = html;
            adjustmentsSection.style.display = 'block';
        } else if (adjustmentsSection) {
            adjustmentsSection.style.display = 'none';
        }

        // Show/hide intervention controls based on mode
        const interventionControls = document.getElementById('teamInterventionControls');
        if (interventionControls) {
            interventionControls.style.display = isNetworked ? 'block' : 'none';
        }

        // Store team ID for intervention handlers
        if (window.App) {
            window.App.currentInterventionTeamId = teamId;
        }
    },

    /**
     * Render individual token card
     * @param {Object} token - Token data (transaction object)
     * @param {boolean} hasBonus - Whether token has group bonus
     * @param {boolean} isUnknown - Whether token is unknown
     * @param {boolean} showDelete - Show delete button (networked mode only)
     * @returns {string} HTML string
     */
    renderTokenCard(token, hasBonus = false, isUnknown = false, showDelete = false) {
        const tokenValue = DataManager.calculateTokenValue(token);
        const cardClass = isUnknown ? 'unknown' : (hasBonus ? 'bonus-applied' : '');

        let calculationText = '';
        if (!isUnknown && !token.isUnknown) {
            const baseValue = DataManager.SCORING_CONFIG.BASE_VALUES[token.valueRating] || 0;
            const multiplier = DataManager.SCORING_CONFIG.TYPE_MULTIPLIERS[token.memoryType] || 1;

            if (hasBonus) {
                const groupInfo = DataManager.parseGroupInfo(token.group);
                const finalValue = tokenValue * groupInfo.multiplier;
                calculationText = `
                    <strong>${baseValue.toLocaleString()}</strong> ×
                    <strong>${multiplier}x</strong> ${token.memoryType} ×
                    <strong>${groupInfo.multiplier}x</strong> group =
                    <strong>$${finalValue.toLocaleString()}</strong>`;
            } else {
                calculationText = `
                    <strong>${baseValue.toLocaleString()}</strong> ×
                    <strong>${multiplier}x</strong> ${token.memoryType} =
                    <strong>$${tokenValue.toLocaleString()}</strong>`;
            }
        } else {
            calculationText = 'Unknown token - No value';
        }

        // Delete button (networked mode only)
        const deleteButton = showDelete && token.id ? `
            <button class="btn" onclick="App.deleteTeamTransaction('${token.id}')"
                    style="background: #dc3545; color: white; padding: 4px 8px; font-size: 12px; margin-left: 8px;">
                🗑️ Delete
            </button>
        ` : '';

        return `
            <div class="token-detail-card ${cardClass}">
                <div class="token-detail-header">
                    <span>${token.group}</span>
                    <span class="token-detail-value" style="display: flex; align-items: center;">
                        <span style="margin-right: 8px;">$${(hasBonus ? tokenValue * DataManager.parseGroupInfo(token.group).multiplier : tokenValue).toLocaleString()}</span>
                        ${deleteButton}
                    </span>
                </div>
                <div class="token-detail-grid">
                    <div class="token-detail-item">
                        <span class="token-detail-label">RFID</span>
                        <span class="token-detail-info">${token.rfid}</span>
                    </div>
                    <div class="token-detail-item">
                        <span class="token-detail-label">Memory Type</span>
                        <span class="token-detail-info">${token.memoryType}</span>
                    </div>
                    <div class="token-detail-item">
                        <span class="token-detail-label">Base Rating</span>
                        <span class="token-detail-info">
                            ${isUnknown ? 'N/A' : `⭐${'⭐'.repeat(Math.max(0, token.valueRating - 1))}`}
                        </span>
                    </div>
                    <div class="token-detail-item">
                        <span class="token-detail-label">Status</span>
                        <span class="token-detail-info">
                            ${hasBonus ? '✅ Bonus Applied' : isUnknown ? '❓ Unknown' : '⏳ No Bonus'}
                        </span>
                    </div>
                    <div class="token-calculation">
                        ${calculationText}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render transaction history
     * @param {Array} filtered - Filtered transactions
     */
    renderTransactions(filtered = null) {
        const container = document.getElementById('historyContainer');
        const transactions = filtered || DataManager.transactions;

        if (transactions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No Transactions Yet</h3>
                </div>
            `;
            return;
        }

        container.innerHTML = transactions.map(t => {
            const date = new Date(t.timestamp);
            const timeStr = date.toLocaleTimeString();
            const dateStr = date.toLocaleDateString();
            const isUnknown = t.isUnknown || t.memoryType === 'UNKNOWN';

            let valueDisplay;
            if (t.mode === 'blackmarket') {
                valueDisplay = `$${DataManager.calculateTokenValue(t).toLocaleString()}`;
            } else {
                valueDisplay = isUnknown ? 'N/A' : '⭐'.repeat(t.valueRating || 0);
            }

            return `
                <div class="transaction-card ${t.mode} ${isUnknown ? 'unknown' : ''}">
                    <div class="transaction-header">
                        <span>Team ${t.teamId}</span>
                        <span class="transaction-time">${dateStr} ${timeStr}</span>
                    </div>
                    <div class="transaction-details">
                        <div class="detail">RFID: <span>${t.rfid}</span></div>
                        <div class="detail">Value: <span>${valueDisplay}</span></div>
                        <div class="detail">Type: <span>${t.memoryType}</span></div>
                        <div class="detail">Mode: <span>${t.mode === 'blackmarket' ? 'Black Market' : 'Detective'}</span></div>
                        <div class="detail" style="grid-column: 1 / -1;">Group: <span>${t.group}</span></div>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Filter transactions based on search criteria
     */
    filterTransactions() {
        const search = document.getElementById('searchFilter').value.toLowerCase();
        const mode = document.getElementById('modeFilter').value;

        let filtered = DataManager.transactions.filter(t => {
            const matchesSearch = !search ||
                t.rfid.toLowerCase().includes(search) ||
                t.teamId.toLowerCase().includes(search) ||
                t.memoryType.toLowerCase().includes(search) ||
                t.group.toLowerCase().includes(search);

            const matchesMode = !mode || t.mode === mode;

            return matchesSearch && matchesMode;
        });

        filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        this.renderTransactions(filtered);
    },

    /**
     * Show notification for group completion (from backend event)
     * @param {Object} data - Group completion data
     */
    showGroupCompletionNotification(data) {
        // Create a temporary notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 15px 20px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
            max-width: 350px;
        `;

        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 24px;">🏆</span>
                <div>
                    <div style="font-weight: bold; margin-bottom: 5px;">Group Completed!</div>
                    <div style="font-size: 14px;">Team ${data.teamId} - ${data.groupId}</div>
                    <div style="font-size: 14px;">Bonus: +$${data.bonus.toLocaleString()} (${data.multiplier}x)</div>
                </div>
            </div>
        `;

        document.body.appendChild(notification);

        // Remove after 5 seconds
        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s ease-out forwards';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    },

    /**
     * Show token scan result
     * @param {Object} token - Token data
     * @param {string} tokenId - Token ID
     * @param {boolean} isUnknown - Whether token is unknown
     */
    showTokenResult(token, tokenId, isUnknown) {
        const statusEl = document.getElementById('resultStatus');
        const rfidEl = document.getElementById('resultRfid');
        const typeEl = document.getElementById('resultType');
        const groupEl = document.getElementById('resultGroup');
        const valueEl = document.getElementById('resultValue');

        if (isUnknown) {
            statusEl.className = 'status-message error';
            statusEl.innerHTML = `
                <h2>Unknown Token</h2>
                <p style="font-size: 14px;">Not in database</p>
            `;
            rfidEl.textContent = tokenId;
            typeEl.textContent = 'UNKNOWN';
            typeEl.style.color = '#FF5722';
            groupEl.textContent = `Raw ID: ${tokenId}`;

            if (Settings.mode === 'blackmarket') {
                valueEl.textContent = '$0';
            } else {
                valueEl.textContent = 'No Value';
            }
        } else {
            statusEl.className = 'status-message success';
            statusEl.innerHTML = '<h2>Transaction Complete!</h2>';
            rfidEl.textContent = tokenId;
            typeEl.textContent = token.SF_MemoryType;
            typeEl.style.color = '#333';
            groupEl.textContent = token.SF_Group;

            if (Settings.mode === 'blackmarket') {
                const tokenScore = DataManager.calculateTokenValue({
                    valueRating: token.SF_ValueRating,
                    memoryType: token.SF_MemoryType,
                    isUnknown: false
                });
                valueEl.textContent = `$${tokenScore.toLocaleString()}`;
            } else {
                valueEl.textContent = '⭐'.repeat(token.SF_ValueRating || 0);
            }
        }

        this.showScreen('result');
    }
};

// Expose UIManager globally for cross-script access
if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
}

// Export for Node.js testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
}
