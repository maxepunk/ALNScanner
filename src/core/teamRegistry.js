/**
 * TeamRegistry - Unified Team Management
 * ES6 Module Export
 *
 * Provides a unified interface for team management across both networked
 * and standalone modes. This enables UI PARITY - identical team selection
 * experience regardless of mode.
 *
 * Architecture:
 * - Networked mode: populated from sync:full / session:update WebSocket events
 * - Standalone mode: populated from StandaloneDataManager.sessionData.teams
 *
 * Events:
 * - 'teams:updated' - Team list changed (add/remove/clear)
 * - 'team:added' - Single team added
 *
 * @module core/teamRegistry
 */

class TeamRegistry extends EventTarget {
    constructor() {
        super();

        /**
         * Map of team ID to team info
         * @type {Map<string, {teamId: string, score: number, tokensScanned: number}>}
         */
        this.teams = new Map();

        /**
         * Current mode for context
         * @type {'networked'|'standalone'|null}
         */
        this.mode = null;
    }

    /**
     * Set the current mode
     * @param {'networked'|'standalone'} mode
     */
    setMode(mode) {
        this.mode = mode;
    }

    /**
     * Get all teams as an array
     * @returns {Array<{teamId: string, score: number, tokensScanned: number}>}
     */
    getTeams() {
        return Array.from(this.teams.values());
    }

    /**
     * Get a single team by ID
     * @param {string} teamId
     * @returns {Object|undefined}
     */
    getTeam(teamId) {
        return this.teams.get(teamId);
    }

    /**
     * Check if a team exists
     * @param {string} teamId
     * @returns {boolean}
     */
    hasTeam(teamId) {
        return this.teams.has(teamId);
    }

    /**
     * Add a team to the registry
     * Does NOT send to backend - that's the caller's responsibility
     * @param {string} teamId - Team identifier
     * @param {Object} [teamInfo={}] - Optional team metadata
     */
    addTeam(teamId, teamInfo = {}) {
        if (!teamId || typeof teamId !== 'string') {
            console.warn('[TeamRegistry] Invalid teamId:', teamId);
            return false;
        }

        const normalizedId = teamId.trim();
        if (!normalizedId) {
            console.warn('[TeamRegistry] Empty teamId after trim');
            return false;
        }

        const existingTeam = this.teams.get(normalizedId);
        if (existingTeam) {
            // Update existing team info
            this.teams.set(normalizedId, { ...existingTeam, ...teamInfo, teamId: normalizedId });
        } else {
            // Add new team
            this.teams.set(normalizedId, {
                teamId: normalizedId,
                score: 0,
                tokensScanned: 0,
                ...teamInfo
            });

            // Emit team:added for new teams only
            this.dispatchEvent(new CustomEvent('team:added', {
                detail: { teamId: normalizedId, teamInfo: this.teams.get(normalizedId) }
            }));
        }

        // Always emit teams:updated
        this.dispatchEvent(new CustomEvent('teams:updated', {
            detail: { teams: this.getTeams() }
        }));

        return true;
    }

    /**
     * Remove a team from the registry
     * @param {string} teamId
     * @returns {boolean} True if team was removed
     */
    removeTeam(teamId) {
        const removed = this.teams.delete(teamId);
        if (removed) {
            this.dispatchEvent(new CustomEvent('teams:updated', {
                detail: { teams: this.getTeams() }
            }));
        }
        return removed;
    }

    /**
     * Clear all teams (e.g., on session end)
     */
    clear() {
        this.teams.clear();
        this.dispatchEvent(new CustomEvent('teams:updated', {
            detail: { teams: [] }
        }));
    }

    /**
     * Populate from session data (networked mode)
     * Called on sync:full or session:update
     * @param {Object} sessionData - Session object from backend
     */
    populateFromSession(sessionData) {
        if (!sessionData) return;

        // Clear existing and repopulate
        this.teams.clear();

        // Extract teams from session scores
        if (sessionData.scores && Array.isArray(sessionData.scores)) {
            sessionData.scores.forEach(scoreData => {
                this.teams.set(scoreData.teamId, {
                    teamId: scoreData.teamId,
                    score: scoreData.currentScore || scoreData.score || 0,
                    tokensScanned: scoreData.tokensScanned || 0,
                    baseScore: scoreData.baseScore || 0,
                    bonusPoints: scoreData.bonusPoints || 0
                });
            });
        }

        // Also check for teams array (some events have this)
        if (sessionData.teams && Array.isArray(sessionData.teams)) {
            sessionData.teams.forEach(teamId => {
                if (!this.teams.has(teamId)) {
                    this.teams.set(teamId, {
                        teamId,
                        score: 0,
                        tokensScanned: 0
                    });
                }
            });
        }

        this.dispatchEvent(new CustomEvent('teams:updated', {
            detail: { teams: this.getTeams() }
        }));
    }

    /**
     * Populate from standalone session data
     * Called when StandaloneDataManager loads session
     * @param {Object} standaloneSessionData - Session object from localStorage
     */
    populateFromStandaloneSession(standaloneSessionData) {
        if (!standaloneSessionData?.teams) return;

        this.teams.clear();

        Object.entries(standaloneSessionData.teams).forEach(([teamId, teamData]) => {
            this.teams.set(teamId, {
                teamId,
                score: teamData.score || 0,
                tokensScanned: teamData.tokensScanned || 0,
                baseScore: teamData.baseScore || 0,
                bonusPoints: teamData.bonusPoints || 0
            });
        });

        this.dispatchEvent(new CustomEvent('teams:updated', {
            detail: { teams: this.getTeams() }
        }));
    }

    /**
     * Populate a select element with team options
     * Used for dropdown UI
     * @param {HTMLSelectElement} selectElement - Select element to populate
     * @param {Object} [options={}] - Options
     * @param {string} [options.placeholder='Select Team...'] - Placeholder text
     * @param {string} [options.selectedTeamId] - Currently selected team ID
     */
    populateDropdown(selectElement, options = {}) {
        if (!selectElement) return;

        const { placeholder = 'Select Team...', selectedTeamId = null } = options;

        // Clear existing options
        selectElement.innerHTML = '';

        // Add placeholder option
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = placeholder;
        placeholderOption.disabled = true;
        placeholderOption.selected = !selectedTeamId;
        selectElement.appendChild(placeholderOption);

        // Add team options
        const teams = this.getTeams().sort((a, b) =>
            a.teamId.localeCompare(b.teamId)
        );

        teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team.teamId;
            option.textContent = team.teamId;
            if (team.teamId === selectedTeamId) {
                option.selected = true;
            }
            selectElement.appendChild(option);
        });
    }
}

// Export class (instance created in main.js)
export default TeamRegistry;
export { TeamRegistry };
