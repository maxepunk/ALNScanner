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
        this.saveLocalSession();

        // Update local scores
        this.updateLocalScores(transaction);
    }

    updateLocalScores(transaction) {
        const teamId = transaction.teamId;
        if (!this.sessionData.teams[teamId]) {
            this.sessionData.teams[teamId] = {
                teamId: teamId,
                score: 0,
                tokensScanned: 0,
                lastScanTime: null
            };
        }

        const team = this.sessionData.teams[teamId];

        // Only update score for blackmarket mode
        if (transaction.stationMode === 'blackmarket' && transaction.points) {
            team.score += transaction.points;
        }

        team.tokensScanned++;
        team.lastScanTime = transaction.timestamp;

        // Trigger UI update
        if (window.UIManager) {
            window.UIManager.updateScoreboard(this.getTeamScores());
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
