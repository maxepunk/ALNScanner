/**
 * Unit Test: GameOpsRenderer — Team Details against a REAL UnifiedDataManager
 *
 * A-1: Team Details used to read `dataManager.backendScores`, a property that
 * only ever existed on NetworkedStorage. Against the real facade the branch was
 * always falsy, so networked Base/Bonus/Total silently fell back to the local
 * recomputation and the Admin Adjustments panel never rendered. These tests
 * drive the real `getBackendTeamScore()` accessor so that regression cannot
 * return unnoticed.
 *
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GameOpsRenderer } from '../../../../src/ui/renderers/GameOpsRenderer.js';
import { UnifiedDataManager } from '../../../../src/core/unifiedDataManager.js';

const TEAM_DETAILS_DOM = `
  <div id="teamDetailsTitle"></div>
  <div id="teamDetailsSummary"></div>
  <div id="teamDetailsContainer"></div>
  <div id="teamBaseScore"></div>
  <div id="teamBonusScore"></div>
  <div id="teamTotalScore"></div>
  <div id="teamAdminAdjustmentsSection"></div>
  <div id="teamInterventionControls"></div>
`;

describe('GameOpsRenderer.renderTeamDetails (A-1)', () => {
  let renderer;
  let manager;
  let mockSocket;
  let mockTokenManager;
  let mockSessionModeManager;

  beforeEach(async () => {
    localStorage.clear();
    document.body.innerHTML = TEAM_DETAILS_DOM;

    mockSocket = { on: jest.fn(), off: jest.fn(), emit: jest.fn(), connected: true };
    mockTokenManager = {
      getAllTokens: jest.fn(() => []),
      findToken: jest.fn(() => null),
      getGroupInventory: jest.fn(() => ({}))
    };
    mockSessionModeManager = {
      isNetworked: jest.fn(() => true),
      isStandalone: jest.fn(() => false)
    };

    manager = new UnifiedDataManager({
      tokenManager: mockTokenManager,
      sessionModeManager: mockSessionModeManager
    });
    await manager.initializeNetworkedMode(mockSocket);

    renderer = new GameOpsRenderer({
      dataManager: manager,
      sessionModeManager: mockSessionModeManager,
      app: {}
    });
  });

  it('shows Base/Bonus/Total from the backend payload in networked mode', () => {
    manager._networkedStrategy.setBackendScores('001', {
      currentScore: 815000,
      baseScore: 165000,
      bonusPoints: 660000,
      tokensScanned: 4,
      completedGroups: ['Server Logs'],
      adminAdjustments: []
    });

    renderer.renderTeamDetails('001', []);

    expect(document.getElementById('teamBaseScore').textContent).toBe('$165,000');
    expect(document.getElementById('teamBonusScore').textContent).toBe('$660,000');
    expect(document.getElementById('teamTotalScore').textContent).toBe('$815,000');
  });

  it('renders the admin adjustments section when the backend reports adjustments', () => {
    manager._networkedStrategy.setBackendScores('001', {
      currentScore: 60000,
      baseScore: 50000,
      bonusPoints: 0,
      tokensScanned: 1,
      completedGroups: [],
      adminAdjustments: [
        { delta: 10000, reason: 'Puzzle assist', timestamp: '2026-01-01T00:00:00Z', gmStation: 'GM-1' }
      ]
    });

    renderer.renderTeamDetails('001', []);

    const section = document.getElementById('teamAdminAdjustmentsSection');
    expect(section.style.display).toBe('block');
    expect(section.innerHTML).toContain('Admin Adjustments');
    expect(section.innerHTML).toContain('Puzzle assist');
    expect(section.innerHTML).toContain('$10,000');
  });

  it('hides the admin adjustments section when the backend reports none', () => {
    manager._networkedStrategy.setBackendScores('001', {
      currentScore: 50000, baseScore: 50000, bonusPoints: 0,
      tokensScanned: 1, completedGroups: [], adminAdjustments: []
    });

    renderer.renderTeamDetails('001', []);

    expect(document.getElementById('teamAdminAdjustmentsSection').style.display).toBe('none');
  });

  it('falls back to the local score breakdown when the backend has no row for the team', () => {
    // No setBackendScores call → getBackendTeamScore('001') must be null.
    renderer.renderTeamDetails('001', []);

    expect(document.getElementById('teamBaseScore').textContent).toBe('$0');
    expect(document.getElementById('teamTotalScore').textContent).toBe('$0');
    expect(document.getElementById('teamAdminAdjustmentsSection').style.display).toBe('none');
  });

  it('ignores backend scores in standalone mode', async () => {
    mockSessionModeManager.isNetworked.mockReturnValue(false);
    mockSessionModeManager.isStandalone.mockReturnValue(true);
    manager._networkedStrategy.setBackendScores('001', {
      currentScore: 999000, baseScore: 999000, bonusPoints: 0,
      tokensScanned: 1, completedGroups: [], adminAdjustments: []
    });
    await manager.initializeStandaloneMode();

    renderer.renderTeamDetails('001', []);

    expect(document.getElementById('teamTotalScore').textContent).toBe('$0');
  });
});
