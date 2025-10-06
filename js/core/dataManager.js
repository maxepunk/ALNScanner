/**
 * Data Manager Module
 * Manages transactions, scoring, and persistence
 * Extracted from monolith per Phase 4.2.1
 * Refactored to class-based architecture per Phase 5.3.1
 */

class DataManager extends EventTarget {
    constructor({ tokenManager, settings, debug, uiManager, app } = {}) {
        super();

        // Inject dependencies for testability
        this.tokenManager = tokenManager;
        this.settings = settings;
        this.debug = debug;
        this.uiManager = uiManager;
        this.app = app;

        // Initialize state
        this.transactions = [];
        this.currentSession = [];
        this.scannedTokens = new Set();
        this.backendScores = new Map();  // Store scores from orchestrator

        // Scoring configuration for Black Market mode
        this.SCORING_CONFIG = {
            BASE_VALUES: {
                1: 100,
                2: 500,
                3: 1000,
                4: 5000,
                5: 10000
            },
            TYPE_MULTIPLIERS: {
                'Technical': 5,
                'Personal': 1,
                'Business': 3,
                'Classified': 3,
                'Corporate': 3,
                'Medical': 2,
                'Military': 4,
                'Research': 3,
                'Legal': 2,
                'Educational': 1,
                'Intelligence': 4,
                'Communications': 2,
                'Entertainment': 1,
                'Scientific': 3,
                'Diplomatic': 4,
                'Social': 1,
                'Test': 2,
                'UNKNOWN': 0
            }
        };
    }

    /**
     * Load transactions from localStorage
     */
    loadTransactions() {
        try {
            const stored = localStorage.getItem('transactions');
            if (stored) {
                this.transactions = JSON.parse(stored);
                this.debug?.log(`Loaded ${this.transactions.length} transactions`);
            }
        } catch (e) {
            this.debug?.log('Error loading transactions', true);
            this.transactions = [];
        }
    }

    /**
     * Load scanned tokens registry from localStorage
     */
    loadScannedTokens() {
        try {
            const stored = localStorage.getItem('scannedTokens');
            if (stored) {
                this.scannedTokens = new Set(JSON.parse(stored));
                this.debug?.log(`Loaded ${this.scannedTokens.size} scanned tokens`);
            }
        } catch (e) {
            this.debug?.log('Error loading scanned tokens', true);
            this.scannedTokens = new Set();
        }
    }

    /**
     * Save transactions to localStorage
     */
    saveTransactions() {
        try {
            localStorage.setItem('transactions', JSON.stringify(this.transactions));
        } catch (e) {
            this.debug?.log('Error saving transactions', true);
        }
    }

    /**
     * Save scanned tokens registry to localStorage
     */
    saveScannedTokens() {
        try {
            localStorage.setItem('scannedTokens', JSON.stringify([...this.scannedTokens]));
        } catch (e) {
            this.debug?.log('Error saving scanned tokens', true);
        }
    }

    /**
     * Check if token has been scanned globally
     * @param {string} tokenId - Token ID to check
     * @returns {boolean} Whether token was already scanned
     */
    isTokenScanned(tokenId) {
        return this.scannedTokens.has(tokenId);
    }

    /**
     * Mark token as scanned globally
     * @param {string} tokenId - Token ID to mark
     */
    markTokenAsScanned(tokenId) {
        this.scannedTokens.add(tokenId);
        this.saveScannedTokens();
    }

    /**
     * Add transaction and update session
     * @param {Object} transaction - Transaction data
     */
    addTransaction(transaction) {
        // If backend transaction, look up token data
        let tokenData = null;
        if (transaction.tokenId && !transaction.memoryType) {
            tokenData = this.tokenManager?.findToken(transaction.tokenId);
            this.debug?.log('Looking up token data for backend transaction', {
                tokenId: transaction.tokenId,
                found: !!tokenData,
                memoryType: tokenData?.SF_MemoryType,
                group: tokenData?.SF_Group
            });
        }

        // Normalize transaction format (backend sends different structure)
        const normalizedTx = {
            timestamp: transaction.timestamp || new Date().toISOString(),
            deviceId: transaction.deviceId || this.settings?.deviceId,
            stationMode: transaction.stationMode || this.settings?.stationMode,
            teamId: transaction.teamId || this.app?.currentTeamId,
            rfid: transaction.tokenId || transaction.rfid,
            tokenId: transaction.tokenId || transaction.rfid,
            memoryType: transaction.memoryType || (tokenData?.SF_MemoryType) || 'UNKNOWN',
            group: transaction.group || tokenData?.SF_Group || 'No Group',
            // CRITICAL FIX: valueRating is 1-5, points is calculated score - don't confuse them!
            // Use valueRating if explicitly provided (even if 0), otherwise use token data
            valueRating: transaction.valueRating !== undefined ? transaction.valueRating :
                         (tokenData?.SF_ValueRating !== undefined ? tokenData.SF_ValueRating : 0),
            isUnknown: transaction.isUnknown !== undefined ? transaction.isUnknown : !tokenData
            // Note: 'synced' flag removed - NetworkedQueueManager handles sync status
        };

        // Check if this transaction already exists (prevent duplicates)
        const exists = this.transactions.some(tx =>
            tx.tokenId === normalizedTx.tokenId &&
            tx.teamId === normalizedTx.teamId &&
            Math.abs(new Date(tx.timestamp) - new Date(normalizedTx.timestamp)) < 1000
        );

        if (!exists) {
            this.transactions.push(normalizedTx);
            this.currentSession.push(normalizedTx);
            this.saveTransactions();
            this.uiManager?.updateHistoryBadge();
            this.debug?.log('Added transaction to DataManager', {
                tokenId: normalizedTx.tokenId,
                memoryType: normalizedTx.memoryType,
                group: normalizedTx.group,
                teamId: normalizedTx.teamId
            });
        } else {
            this.debug?.log('Skipping duplicate transaction', normalizedTx.tokenId);
        }
    }

    /**
     * Clear current session
     */
    clearSession() {
        this.currentSession = [];
    }

    /**
     * Update game state from orchestrator
     */
    updateGameState(state) {
        if (state && typeof state === 'object') {
            // Update any relevant local state
            if (state.sessionId && this.currentSessionId !== state.sessionId) {
                this.currentSessionId = state.sessionId;
                this.debug?.log(`Session updated: ${state.sessionId}`);
            }

            if (state.gameMode && state.gameMode !== this.gameMode) {
                this.gameMode = state.gameMode;
                this.debug?.log(`Game mode updated: ${state.gameMode}`);
            }

            // If state includes new transactions, add them
            if (state.transactions && Array.isArray(state.transactions)) {
                state.transactions.forEach(transaction => {
                    // Only add if we don't already have this transaction
                    const exists = this.transactions.find(t =>
                        t.id === transaction.id ||
                        (t.rfid === transaction.tokenId && t.timestamp === transaction.timestamp)
                    );
                    if (!exists) {
                        const localTransaction = {
                            id: transaction.id || Date.now().toString(),
                            rfid: transaction.tokenId,
                            teamId: transaction.teamId || 'Unknown',
                            timestamp: transaction.timestamp || new Date().toISOString(),
                            memoryType: transaction.memoryType || 'Unknown',
                            group: transaction.group || 'Unknown',
                            rating: transaction.rating || 1,
                            stationMode: this.settings?.stationMode || 'detective'
                        };
                        this.transactions.push(localTransaction);
                    }
                });
                this.saveTransactions();
                this.uiManager?.updateHistoryBadge();
                this.uiManager?.updateSessionStats();
            }
        }
    }

    /**
     * Get current session statistics
     * @returns {Object} Session stats
     */
    getSessionStats() {
        const count = this.currentSession.length;
        const knownTokens = this.currentSession.filter(t => !t.isUnknown);
        const totalValue = knownTokens.reduce((sum, t) => sum + (t.valueRating || 0), 0);

        // Calculate score with bonuses for Black Market mode
        let totalScore = 0;
        if (this.settings?.stationMode === 'blackmarket' && this.currentSession.length > 0) {
            const teamId = this.currentSession[0].teamId;
            const scoreData = this.calculateTeamScoreWithBonuses(teamId);
            totalScore = scoreData.totalScore;
        } else {
            totalScore = this.currentSession.reduce((sum, t) => {
                return sum + this.calculateTokenValue(t);
            }, 0);
        }

        return { count, totalValue, totalScore };
    }

    /**
     * Calculate base value of a token
     * @param {Object} transaction - Transaction data
     * @returns {number} Token value
     */
    calculateTokenValue(transaction) {
        if (transaction.isUnknown) return 0;

        const baseValue = this.SCORING_CONFIG.BASE_VALUES[transaction.valueRating] || 0;
        const multiplier = this.SCORING_CONFIG.TYPE_MULTIPLIERS[transaction.memoryType] || 1;

        return baseValue * multiplier;
    }

    /**
     * Get global statistics
     * @returns {Object} Global stats
     */
    getGlobalStats() {
        const total = this.transactions.length;
        const teams = [...new Set(this.transactions.map(t => t.teamId))].length;
        const known = this.transactions.filter(t => !t.isUnknown);

        const blackMarketTransactions = known.filter(t => t.stationMode === 'blackmarket');
        const detectiveTransactions = known.filter(t => t.stationMode === 'detective');

        const blackMarketScore = blackMarketTransactions.reduce((sum, t) => {
            return sum + this.calculateTokenValue(t);
        }, 0);

        const detectiveValue = detectiveTransactions.reduce((sum, t) => {
            return sum + (t.valueRating || 0);
        }, 0);

        const totalValue = detectiveValue + Math.floor(blackMarketScore / 1000);
        const avgValue = known.length > 0 ? (totalValue / known.length).toFixed(1) : 0;

        return { total, teams, totalValue, avgValue, blackMarketScore, detectiveValue };
    }

    /**
     * Parse group info from group name string
     * @param {string} groupName - Group name with multiplier
     * @returns {Object} Parsed group info
     */
    parseGroupInfo(groupName) {
        if (!groupName) {
            return { name: 'Unknown', multiplier: 1 };
        }

        // Trim input first to handle leading/trailing whitespace
        const trimmed = groupName.trim();

        // Match pattern: "Group Name (xN)"
        const match = trimmed.match(/^(.+?)\s*\(x(\d+)\)$/i);

        if (match) {
            const name = match[1].trim();
            const multiplier = parseInt(match[2]) || 1;

            if (multiplier < 1) {
                this.debug?.log(`Invalid multiplier ${multiplier} for "${name}", using 1`, true);
                return { name, multiplier: 1 };
            }

            return { name, multiplier };
        }

        return { name: trimmed, multiplier: 1 };
    }

    /**
     * Normalize group name for consistent matching
     * @param {string} name - Group name
     * @returns {string} Normalized name
     */
    normalizeGroupName(name) {
        if (!name) return '';

        return name
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/['\u2018\u2019]/g, "'");  // Normalize curly apostrophes to straight
    }

    /**
     * Update team score from backend broadcast
     * @param {Object} scoreData - Score data from backend
     */
    updateTeamScoreFromBackend(scoreData) {
        // Only update if we're connected to orchestrator
        if (!window.connectionManager?.client?.isConnected) {
            return;
        }

        // Store backend scores for display
        if (!this.backendScores) {
            this.backendScores = new Map();
        }

        this.backendScores.set(scoreData.teamId, {
            currentScore: scoreData.currentScore,
            baseScore: scoreData.baseScore,
            bonusPoints: scoreData.bonusPoints,
            tokensScanned: scoreData.tokensScanned,
            completedGroups: scoreData.completedGroups,
            lastUpdate: scoreData.lastUpdate
        });

        // Trigger UI update if viewing scanner scoreboard
        if (document.getElementById('scoreboardContainer')) {
            this.uiManager?.renderScoreboard();
        }

        // Also update admin panel if it's active
        if (this.app?.viewController && this.app.viewController.currentView === 'admin') {
            this.app.updateAdminPanel();
        }

        this.debug?.log(`Score updated from backend for team ${scoreData.teamId}: $${scoreData.currentScore}`);
    }

    /**
     * Calculate team score with group completion bonuses
     * @param {string} teamId - Team ID
     * @returns {Object} Score breakdown
     */
    calculateTeamScoreWithBonuses(teamId) {
        const transactions = this.transactions.filter(t =>
            t.teamId === teamId &&
            t.stationMode === 'blackmarket' &&
            !t.isUnknown
        );

        const completedGroups = this.getTeamCompletedGroups(teamId);
        const completedGroupNames = new Set(
            completedGroups.map(g => g.normalizedName)
        );

        let baseScore = 0;
        let bonusScore = 0;
        const groupBreakdown = {};

        // Initialize breakdown for completed groups
        completedGroups.forEach(group => {
            groupBreakdown[group.name] = {
                tokens: 0,
                baseValue: 0,
                bonusValue: 0,
                multiplier: group.multiplier
            };
        });

        // Calculate scores for each transaction
        transactions.forEach(t => {
            const tokenBaseValue = this.calculateTokenValue(t);
            baseScore += tokenBaseValue;

            // Check if this token's group is completed
            const groupInfo = this.parseGroupInfo(t.group);
            const normalizedGroupName = this.normalizeGroupName(groupInfo.name);

            if (completedGroupNames.has(normalizedGroupName)) {
                // Apply bonus (multiplier - 1) × base value
                const bonusAmount = tokenBaseValue * (groupInfo.multiplier - 1);
                bonusScore += bonusAmount;

                // Track in breakdown
                if (groupBreakdown[groupInfo.name]) {
                    groupBreakdown[groupInfo.name].tokens++;
                    groupBreakdown[groupInfo.name].baseValue += tokenBaseValue;
                    groupBreakdown[groupInfo.name].bonusValue += bonusAmount;
                }
            }
        });

        this.debug?.log(`Team ${teamId}: Base=$${baseScore}, Bonus=$${bonusScore}`);

        return {
            baseScore,
            bonusScore,
            totalScore: baseScore + bonusScore,
            completedGroups: completedGroups.length,
            groupBreakdown
        };
    }

    /**
     * Get all team scores for scoreboard
     * @returns {Array} Sorted team scores
     */
    getTeamScores() {
        // If connected and have backend scores, use those as source of truth
        if (window.connectionManager?.client?.isConnected && this.backendScores?.size > 0) {
            const scores = Array.from(this.backendScores.entries()).map(([teamId, score]) => ({
                teamId,
                score: score.currentScore,
                baseScore: score.baseScore,
                bonusScore: score.bonusPoints,
                tokenCount: score.tokensScanned,
                completedGroups: score.completedGroups,
                isFromBackend: true  // Flag to show this is authoritative
            }));

            // Sort by score
            scores.sort((a, b) => b.score - a.score);
            return scores;
        }

        // Fallback to local calculation when disconnected
        return this.calculateLocalTeamScores();
    }

    /**
     * Calculate team scores locally (fallback when disconnected)
     * @returns {Array} Sorted team scores
     */
    calculateLocalTeamScores() {
        const teamGroups = {};

        const blackMarketTransactions = this.transactions.filter(t =>
            t.stationMode === 'blackmarket'
        );

        blackMarketTransactions.forEach(t => {
            if (!teamGroups[t.teamId]) {
                teamGroups[t.teamId] = [];
            }
            teamGroups[t.teamId].push(t);
        });

        const teamScores = Object.keys(teamGroups).map(teamId => {
            const transactions = teamGroups[teamId];
            const scoreData = this.calculateTeamScoreWithBonuses(teamId);

            return {
                teamId: teamId,
                score: scoreData.totalScore,
                baseScore: scoreData.baseScore,
                bonusScore: scoreData.bonusScore,
                tokenCount: transactions.length,
                completedGroups: scoreData.completedGroups,
                transactions: transactions
            };
        });

        teamScores.sort((a, b) => b.score - a.score);
        return teamScores;
    }

    /**
     * Get sorted team transactions
     * @param {string} teamId - Team ID
     * @returns {Array} Sorted transactions
     */
    getTeamTransactions(teamId) {
        const transactions = this.transactions.filter(t =>
            t.teamId === teamId &&
            t.stationMode === 'blackmarket'
        );

        // Sort by group, value, then timestamp
        transactions.sort((a, b) => {
            const groupCompare = a.group.localeCompare(b.group);
            if (groupCompare !== 0) return groupCompare;

            const valueCompare = (b.valueRating || 0) - (a.valueRating || 0);
            if (valueCompare !== 0) return valueCompare;

            return new Date(a.timestamp) - new Date(b.timestamp);
        });

        return transactions;
    }

    /**
     * Get completed groups for a team
     * @param {string} teamId - Team ID
     * @returns {Array} Completed groups
     */
    getTeamCompletedGroups(teamId) {
        const groupInventory = this.tokenManager?.getGroupInventory() || {};

        const teamTokens = new Set(
            this.transactions
                .filter(t =>
                    t.teamId === teamId &&
                    t.stationMode === 'blackmarket' &&
                    !t.isUnknown
                )
                .map(t => t.rfid)
        );

        const completedGroups = [];

        Object.entries(groupInventory).forEach(([normalizedName, groupData]) => {
            // Skip single-token groups and no-bonus groups
            if (groupData.tokens.size <= 1 || groupData.multiplier <= 1) {
                return;
            }

            // Check if team has ALL tokens in this group
            const groupTokenArray = [...groupData.tokens];
            const hasAllTokens = groupTokenArray.every(tokenId => teamTokens.has(tokenId));

            if (hasAllTokens) {
                completedGroups.push({
                    name: groupData.displayName,
                    normalizedName: normalizedName,
                    multiplier: groupData.multiplier,
                    tokenCount: groupData.tokens.size,
                    tokens: groupTokenArray
                });
            }
        });

        return completedGroups;
    }

    /**
     * Get enhanced team transactions with grouping
     * @param {string} teamId - Team ID
     * @returns {Object} Grouped transaction data
     */
    getEnhancedTeamTransactions(teamId) {
        const transactions = this.getTeamTransactions(teamId);
        const groupInventory = this.tokenManager?.getGroupInventory() || {};
        const completedGroups = this.getTeamCompletedGroups(teamId);
        const completedGroupNames = new Set(completedGroups.map(g => g.normalizedName));

        // Calculate bonus values
        const groupBonusData = {};
        completedGroups.forEach(group => {
            groupBonusData[group.normalizedName] = {
                displayName: group.name,
                multiplier: group.multiplier,
                tokens: [],
                totalBaseValue: 0,
                bonusValue: 0
            };
        });

        // Organize transactions
        const completedGroupTokens = {};
        const incompleteGroupTokens = {};
        const ungroupedTokens = [];
        const unknownTokens = [];

        transactions.forEach(t => {
            if (t.isUnknown) {
                unknownTokens.push(t);
                return;
            }

            const groupInfo = this.parseGroupInfo(t.group);
            const normalizedGroupName = this.normalizeGroupName(groupInfo.name);
            const groupData = groupInventory[normalizedGroupName];

            if (!groupData || groupData.tokens.size <= 1) {
                ungroupedTokens.push(t);
                return;
            }

            const tokenValue = this.calculateTokenValue(t);

            if (completedGroupNames.has(normalizedGroupName)) {
                // Completed group
                if (!completedGroupTokens[normalizedGroupName]) {
                    completedGroupTokens[normalizedGroupName] = [];
                }
                completedGroupTokens[normalizedGroupName].push(t);

                if (groupBonusData[normalizedGroupName]) {
                    groupBonusData[normalizedGroupName].tokens.push(t);
                    groupBonusData[normalizedGroupName].totalBaseValue += tokenValue;
                    groupBonusData[normalizedGroupName].bonusValue += tokenValue * (groupInfo.multiplier - 1);
                }
            } else {
                // Incomplete group
                if (!incompleteGroupTokens[normalizedGroupName]) {
                    incompleteGroupTokens[normalizedGroupName] = {
                        displayName: groupData.displayName,
                        multiplier: groupData.multiplier,
                        tokens: [],
                        totalTokens: groupData.tokens.size,
                        collectedTokens: 0
                    };
                }
                incompleteGroupTokens[normalizedGroupName].tokens.push(t);
            }
        });

        // Calculate progress
        Object.keys(incompleteGroupTokens).forEach(normalizedName => {
            const group = incompleteGroupTokens[normalizedName];
            group.collectedTokens = group.tokens.length;
            group.progress = `${group.collectedTokens}/${group.totalTokens}`;
            group.percentage = Math.round((group.collectedTokens / group.totalTokens) * 100);
        });

        // Convert to arrays and sort
        const completedGroupsArray = Object.entries(completedGroupTokens).map(([normalizedName, tokens]) => ({
            ...groupBonusData[normalizedName],
            normalizedName,
            tokens
        })).sort((a, b) => b.bonusValue - a.bonusValue);

        const incompleteGroupsArray = Object.values(incompleteGroupTokens)
            .sort((a, b) => b.percentage - a.percentage);

        return {
            completedGroups: completedGroupsArray,
            incompleteGroups: incompleteGroupsArray,
            ungroupedTokens,
            unknownTokens,
            hasCompletedGroups: completedGroupsArray.length > 0,
            hasIncompleteGroups: incompleteGroupsArray.length > 0,
            hasUngroupedTokens: ungroupedTokens.length > 0,
            hasUnknownTokens: unknownTokens.length > 0
        };
    }

    /**
     * Export data in specified format
     * @param {string} format - 'json' or 'csv'
     */
    exportData(format) {
        if (this.transactions.length === 0) {
            alert('No transactions to export');
            return;
        }

        let data, filename, type;

        if (format === 'json') {
            data = JSON.stringify(this.transactions, null, 2);
            filename = `transactions_${Date.now()}.json`;
            type = 'application/json';
        } else {
            // CSV format
            const headers = ['timestamp', 'deviceId', 'stationMode', 'teamId', 'rfid', 'memoryType', 'group', 'valueRating'];
            const rows = [headers.join(',')];

            this.transactions.forEach(t => {
                const row = [
                    t.timestamp,
                    t.deviceId,
                    t.stationMode,
                    t.teamId,
                    t.rfid,
                    `"${t.memoryType}"`,
                    `"${t.group}"`,
                    t.valueRating || 0
                ];
                rows.push(row.join(','));
            });

            data = rows.join('\n');
            filename = `transactions_${Date.now()}.csv`;
            type = 'text/csv';
        }

        const blob = new Blob([data], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Clear all data with confirmation
     */
    clearData() {
        if (confirm('Clear all transaction data? This cannot be undone.')) {
            this.transactions = [];
            this.currentSession = [];
            this.scannedTokens.clear();
            localStorage.removeItem('transactions');
            localStorage.removeItem('scannedTokens');
            this.uiManager?.updateHistoryBadge();
            alert('All data cleared');
            location.reload();
        }
    }
}

// Export class for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataManager;
}

// Create singleton instance for browser usage (backward compatibility)
if (typeof window !== 'undefined') {
    // Dependencies will be injected from global scope when available
    const createDataManagerInstance = () => {
        return new DataManager({
            tokenManager: window.TokenManager,
            settings: window.Settings,
            debug: window.Debug,
            uiManager: window.UIManager,
            app: window.App
        });
    };

    // Create instance when DOM is ready (ensures dependencies are loaded)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.DataManager = createDataManagerInstance();
        });
    } else {
        // DOM already loaded
        window.DataManager = createDataManagerInstance();
    }
}
