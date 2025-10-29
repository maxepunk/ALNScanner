/**
 * Standalone Data Manager
 * Local data management for standalone mode
 * Handles permanent local storage when operating without orchestrator
 * Extracted from monolith per Phase 4.2.3
 */

class StandaloneDataManager {
    constructor() {
        this.sessionData = {
            sessionId: this.generateLocalSessionId(),
            startTime: new Date().toISOString(),
            transactions: [],
            teams: {},
            mode: 'standalone'
        };

        // Load any previous incomplete session
        this.loadLocalSession();
    }

    generateLocalSessionId() {
        return `LOCAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    addTransaction(transaction) {
        // Add to permanent local storage, not temporary queue
        this.sessionData.transactions.push(transaction);

        // Update local scores (calculates team scores from transaction)
        this.updateLocalScores(transaction);

        // Save to localStorage AFTER scoring calculations complete
        // This ensures the calculated scores are persisted along with transaction data
        this.saveLocalSession();
    }

    updateLocalScores(transaction) {
        const teamId = transaction.teamId;

        // DIAGNOSTIC: Log transaction being processed
        console.log('[StandaloneDataManager] updateLocalScores() called', {
            tokenId: transaction.tokenId,
            teamId: transaction.teamId,
            mode: transaction.mode,
            points: transaction.points,
            tokenGroup: transaction.tokenGroup,
            valueRating: transaction.valueRating,
            memoryType: transaction.memoryType
        });

        if (!this.sessionData.teams[teamId]) {
            this.sessionData.teams[teamId] = {
                teamId: teamId,
                score: 0,
                baseScore: 0,
                bonusPoints: 0,
                tokensScanned: 0,
                completedGroups: [],
                lastScanTime: null
            };
            console.log('[StandaloneDataManager] Created new team:', teamId);
        }

        const team = this.sessionData.teams[teamId];

        // DIAGNOSTIC: Log team state BEFORE scoring
        console.log('[StandaloneDataManager] Team state BEFORE scoring:', {
            teamId,
            baseScore: team.baseScore,
            bonusPoints: team.bonusPoints,
            score: team.score,
            tokensScanned: team.tokensScanned
        });

        // Only update score for blackmarket mode
        if (transaction.mode === 'blackmarket' && transaction.points) {
            console.log(`[StandaloneDataManager] Adding ${transaction.points} points to team ${teamId}`);
            team.baseScore += transaction.points;
            team.score = team.baseScore + team.bonusPoints;
        } else {
            console.log('[StandaloneDataManager] Score NOT updated. Reason:', {
                mode: transaction.mode,
                isBlackmarket: transaction.mode === 'blackmarket',
                points: transaction.points,
                hasPoints: !!transaction.points
            });
        }

        team.tokensScanned++;
        team.lastScanTime = transaction.timestamp;

        // DIAGNOSTIC: Log team state AFTER base scoring, BEFORE group check
        console.log('[StandaloneDataManager] Team state AFTER base scoring:', {
            teamId,
            baseScore: team.baseScore,
            bonusPoints: team.bonusPoints,
            score: team.score,
            tokensScanned: team.tokensScanned
        });

        // Check for group completion (only for blackmarket mode)
        if (transaction.mode === 'blackmarket' && transaction.tokenGroup) {
            console.log(`[StandaloneDataManager] Checking group completion for: ${transaction.tokenGroup}`);
            this.checkGroupCompletion(teamId, transaction.tokenGroup);
        } else {
            console.log('[StandaloneDataManager] Group completion check SKIPPED. Reason:', {
                mode: transaction.mode,
                isBlackmarket: transaction.mode === 'blackmarket',
                tokenGroup: transaction.tokenGroup,
                hasTokenGroup: !!transaction.tokenGroup
            });
        }

        // DIAGNOSTIC: Log FINAL team state
        console.log('[StandaloneDataManager] Team state FINAL:', {
            teamId,
            baseScore: team.baseScore,
            bonusPoints: team.bonusPoints,
            score: team.score,
            tokensScanned: team.tokensScanned,
            completedGroups: team.completedGroups
        });

        // Trigger UI update
        if (window.UIManager) {
            window.UIManager.updateScoreboard(this.getTeamScores());
        }
    }

    /**
     * Check if team completed a token group and award bonus
     * @param {string} teamId - Team ID
     * @param {string} groupName - Group name with multiplier (e.g., "Marcus Sucks (x2)")
     */
    checkGroupCompletion(teamId, groupName) {
        // Extract group ID and multiplier from group name
        const groupMatch = groupName.match(/^(.+?)\s*\(x(\d+)\)\s*$/);
        if (!groupMatch) return; // No multiplier, no group bonus

        const groupId = groupMatch[1].trim();
        const multiplier = parseInt(groupMatch[2], 10);

        const team = this.sessionData.teams[teamId];

        // Skip if group already completed
        if (team.completedGroups.includes(groupId)) {
            return;
        }

        // Get all transactions for this team in blackmarket mode
        const teamTransactions = this.sessionData.transactions.filter(tx =>
            tx.teamId === teamId && tx.mode === 'blackmarket'
        );

        // Get unique groups from team's transactions
        const scannedGroups = {};
        teamTransactions.forEach(tx => {
            if (tx.tokenGroup) {
                const txGroupMatch = tx.tokenGroup.match(/^(.+?)\s*\(x\d+\)\s*$/);
                if (txGroupMatch) {
                    const txGroupId = txGroupMatch[1].trim();
                    if (!scannedGroups[txGroupId]) {
                        scannedGroups[txGroupId] = [];
                    }
                    scannedGroups[txGroupId].push(tx);
                }
            }
        });

        // Check if we need to determine group size
        // For now, we need to know all tokens in this group
        // This requires token metadata - we'll need TokenManager access
        if (!window.TokenManager) {
            console.warn('TokenManager not available for group completion check');
            return;
        }

        // Get all tokens in this group
        const allTokens = window.TokenManager.getAllTokens();
        const groupTokens = allTokens.filter(token => {
            if (!token.SF_Group) return false;
            const tokenGroupMatch = token.SF_Group.match(/^(.+?)\s*\(x\d+\)\s*$/);
            return tokenGroupMatch && tokenGroupMatch[1].trim() === groupId;
        });

        // Check if all group tokens have been scanned by this team
        const scannedTokenIds = scannedGroups[groupId] ? scannedGroups[groupId].map(tx => tx.tokenId) : [];
        const allGroupTokenIds = groupTokens.map(t => t.SF_RFID);

        const allScanned = allGroupTokenIds.every(tokenId => scannedTokenIds.includes(tokenId));

        if (allScanned && groupTokens.length > 0) {
            // Calculate bonus: (multiplier - 1) × sum of group token values
            const groupBaseScore = scannedGroups[groupId].reduce((sum, tx) => sum + (tx.points || 0), 0);
            const bonus = (multiplier - 1) * groupBaseScore;

            // Award bonus
            team.bonusPoints += bonus;
            team.score = team.baseScore + team.bonusPoints;
            team.completedGroups.push(groupId);

            console.log(`Group completed: ${groupId}, bonus: ${bonus} points`);

            // Save session
            this.saveLocalSession();
        }
    }

    getTeamScores() {
        return Object.values(this.sessionData.teams)
            .sort((a, b) => b.score - a.score);
    }

    saveLocalSession() {
        localStorage.setItem('standaloneSession', JSON.stringify(this.sessionData));
    }

    loadLocalSession() {
        const saved = localStorage.getItem('standaloneSession');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Only load if it's from today
                const sessionDate = new Date(parsed.startTime).toDateString();
                const today = new Date().toDateString();

                if (sessionDate === today) {
                    this.sessionData = parsed;
                    console.log('Loaded previous session:', parsed.sessionId);
                } else {
                    console.log('Previous session is from a different day, starting fresh');
                }
            } catch (error) {
                console.error('Failed to load previous session:', error);
            }
        }
    }

    exportSession() {
        // Generate downloadable file
        const blob = new Blob([JSON.stringify(this.sessionData, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ALN_Session_${this.sessionData.sessionId}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    clearSession() {
        if (confirm('Export session data before clearing?')) {
            this.exportSession();
        }
        localStorage.removeItem('standaloneSession');
        this.sessionData = {
            sessionId: this.generateLocalSessionId(),
            startTime: new Date().toISOString(),
            transactions: [],
            teams: {},
            mode: 'standalone'
        };
    }

    getSessionStats() {
        return {
            sessionId: this.sessionData.sessionId,
            startTime: this.sessionData.startTime,
            totalTransactions: this.sessionData.transactions.length,
            totalTeams: Object.keys(this.sessionData.teams).length,
            mode: this.sessionData.mode
        };
    }
}

// Export for Node.js testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandaloneDataManager;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.StandaloneDataManager = StandaloneDataManager;
}
