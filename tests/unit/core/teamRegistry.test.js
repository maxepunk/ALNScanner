/**
 * TeamRegistry Unit Tests
 * Tests for unified team selection API (Phase 2 DataManager pattern)
 */

import TeamRegistry from '../../../src/core/teamRegistry.js';

describe('TeamRegistry', () => {
  let registry;
  let mockSessionModeManager;
  let mockOrchestratorClient;

  beforeEach(() => {
    registry = new TeamRegistry();

    mockSessionModeManager = {
      isStandalone: jest.fn(() => false),
      isNetworked: jest.fn(() => true)
    };

    mockOrchestratorClient = {
      sendCommand: jest.fn()
    };

    // Clear localStorage
    localStorage.clear();
  });

  describe('selectTeam() - Unified API', () => {
    it('should return error for empty team name', async () => {
      registry.sessionModeManager = mockSessionModeManager;

      const result = await registry.selectTeam('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Team name required');
    });

    it('should return error for whitespace-only team name', async () => {
      registry.sessionModeManager = mockSessionModeManager;

      const result = await registry.selectTeam('   ');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Team name required');
    });

    describe('Standalone Mode', () => {
      beforeEach(() => {
        mockSessionModeManager.isStandalone.mockReturnValue(true);
        registry.sessionModeManager = mockSessionModeManager;
      });

      it('should add team to recent history in localStorage', async () => {
        const result = await registry.selectTeam('Team Alpha');

        expect(result.success).toBe(true);

        const stored = JSON.parse(localStorage.getItem('aln_recent_teams') || '[]');
        expect(stored).toContain('Team Alpha');
      });

      it('should limit recent teams to 10', async () => {
        // Add 12 teams
        for (let i = 1; i <= 12; i++) {
          await registry.selectTeam(`Team ${i}`);
        }

        const stored = JSON.parse(localStorage.getItem('aln_recent_teams') || '[]');
        expect(stored.length).toBe(10);
        expect(stored[0]).toBe('Team 12'); // Most recent first
      });

      it('should move existing team to front of history', async () => {
        await registry.selectTeam('Team Alpha');
        await registry.selectTeam('Team Beta');
        await registry.selectTeam('Team Alpha'); // Re-select

        const stored = JSON.parse(localStorage.getItem('aln_recent_teams') || '[]');
        expect(stored[0]).toBe('Team Alpha');
        expect(stored.length).toBe(2); // No duplicates
      });
    });

    describe('Networked Mode', () => {
      beforeEach(() => {
        mockSessionModeManager.isStandalone.mockReturnValue(false);
        registry.sessionModeManager = mockSessionModeManager;
        registry.orchestratorClient = mockOrchestratorClient;
      });

      it('should call backend for new team', async () => {
        mockOrchestratorClient.sendCommand.mockResolvedValue({ success: true });

        const result = await registry.selectTeam('Team Alpha');

        expect(result.success).toBe(true);
        expect(mockOrchestratorClient.sendCommand).toHaveBeenCalledWith(
          'session:addTeam',
          { teamId: 'Team Alpha' }
        );
      });

      it('should NOT call backend for existing team', async () => {
        registry.addTeam('Team Alpha'); // Pre-existing

        const result = await registry.selectTeam('Team Alpha');

        expect(result.success).toBe(true);
        expect(mockOrchestratorClient.sendCommand).not.toHaveBeenCalled();
      });

      it('should return error if backend fails', async () => {
        mockOrchestratorClient.sendCommand.mockResolvedValue({
          success: false,
          message: 'Session not active'
        });

        const result = await registry.selectTeam('Team Alpha');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Session not active');
      });

      it('should return error if not connected', async () => {
        registry.orchestratorClient = null;

        const result = await registry.selectTeam('Team Alpha');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Not connected');
      });
    });
  });

  describe('getTeamsForDisplay() - Unified API', () => {
    it('should return recent teams from localStorage in standalone mode', async () => {
      mockSessionModeManager.isStandalone.mockReturnValue(true);
      registry.sessionModeManager = mockSessionModeManager;

      await registry.selectTeam('Team Alpha');
      await registry.selectTeam('Team Beta');

      const teams = registry.getTeamsForDisplay();

      expect(teams).toEqual(['Team Beta', 'Team Alpha']);
    });

    it('should return session teams in networked mode', () => {
      mockSessionModeManager.isStandalone.mockReturnValue(false);
      registry.sessionModeManager = mockSessionModeManager;

      registry.addTeam('Team Alpha');
      registry.addTeam('Team Beta');

      const teams = registry.getTeamsForDisplay();

      expect(teams).toContain('Team Alpha');
      expect(teams).toContain('Team Beta');
    });
  });

  describe('getTeamListLabel() - Unified API', () => {
    it('should return "Recent Teams:" in standalone mode', () => {
      mockSessionModeManager.isStandalone.mockReturnValue(true);
      registry.sessionModeManager = mockSessionModeManager;

      expect(registry.getTeamListLabel()).toBe('Recent Teams:');
    });

    it('should return "Session Teams:" in networked mode', () => {
      mockSessionModeManager.isStandalone.mockReturnValue(false);
      registry.sessionModeManager = mockSessionModeManager;

      expect(registry.getTeamListLabel()).toBe('Session Teams:');
    });
  });
});
