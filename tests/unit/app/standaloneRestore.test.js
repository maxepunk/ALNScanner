/**
 * @jest-environment jsdom
 *
 * F-GMS-01 / C7 — Standalone restore after page reload (P0)
 *
 * A mid-show reload of a standalone station must restore a FULLY functional
 * scanner: storage strategy initialized, sessionModeManager wired onto
 * dataManager + teamRegistry, standalone-mode body class set, and the
 * persisted standalone session preserved. The old restore path only did
 * setMode + showScreen, leaving addTransaction throwing 'No active strategy'
 * and teamRegistry falling into the networked branch.
 *
 * This is an integration-level test: REAL App + SessionModeManager +
 * UnifiedDataManager + LocalStorage + TeamRegistry against jsdom localStorage.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { App } from '../../../src/app/app.js';
import { SessionModeManager } from '../../../src/app/sessionModeManager.js';
import { UnifiedDataManager } from '../../../src/core/unifiedDataManager.js';
import TeamRegistry from '../../../src/core/teamRegistry.js';
import {
  determineInitialScreen,
  applyInitialScreenDecision
} from '../../../src/app/initializationSteps.js';

describe('Standalone restore after reload (F-GMS-01)', () => {
  let app;
  let sessionModeManager;
  let dataManager;
  let teamRegistry;
  let mockUIManager;
  let mockTokenManager;
  let mockSettings;

  const TEST_TOKEN = {
    SF_RFID: 'tac001',
    SF_ValueRating: 3,
    SF_MemoryType: 'Technical',
    SF_Group: ''
  };

  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    document.body.innerHTML = '';

    // Simulate a previous standalone session persisted before the reload
    localStorage.setItem('gameSessionMode', 'standalone');
    localStorage.setItem('standaloneSession', JSON.stringify({
      sessionId: 'LOCAL_PRESERVED_SESSION',
      startTime: new Date().toISOString(),
      transactions: [{
        id: 'tx-1',
        tokenId: 'pre001',
        rfid: 'pre001',
        teamId: 'Team Alpha',
        mode: 'blackmarket',
        points: 10000,
        memoryType: 'Personal',
        group: '',
        timestamp: new Date().toISOString()
      }],
      teams: {
        'Team Alpha': {
          teamId: 'Team Alpha', score: 10000, baseScore: 10000,
          bonusPoints: 0, tokensScanned: 1, completedGroups: [], lastScanTime: null
        }
      },
      mode: 'standalone'
    }));

    mockTokenManager = {
      findToken: jest.fn((id) => (id === 'tac001'
        ? { token: TEST_TOKEN, matchedId: 'tac001' }
        : null)),
      getAllTokens: jest.fn(() => [TEST_TOKEN])
    };

    mockUIManager = {
      init: jest.fn(),
      showScreen: jest.fn(),
      showError: jest.fn(),
      showToast: jest.fn(),
      updateHistoryBadge: jest.fn(),
      updateSessionStats: jest.fn(),
      updateTeamDisplay: jest.fn(),
      showTokenResult: jest.fn(),
      renderSessionStatus: jest.fn()
    };

    mockSettings = {
      deviceId: 'GM_TEST_STATION',
      stationName: 'Test Station',
      mode: 'blackmarket',
      load: jest.fn(),
      save: jest.fn()
    };

    sessionModeManager = new SessionModeManager();
    teamRegistry = new TeamRegistry();
    dataManager = new UnifiedDataManager({
      tokenManager: mockTokenManager,
      sessionModeManager
    });

    app = new App({
      uiManager: mockUIManager,
      settings: mockSettings,
      tokenManager: mockTokenManager,
      dataManager,
      teamRegistry,
      nfcHandler: { stopScan: jest.fn(), startScan: jest.fn() },
      showConnectionWizard: jest.fn()
    });
    app.sessionModeManager = sessionModeManager;
  });

  async function restoreAfterReload() {
    const decision = determineInitialScreen(sessionModeManager);
    expect(decision.action).toBe('initStandalone');
    await applyInitialScreenDecision(
      decision,
      sessionModeManager,
      mockUIManager,
      jest.fn(),
      null,
      app._initializeStandaloneMode.bind(app)
    );
  }

  it('restores everything fresh selection does: strategy, wiring, body class', async () => {
    await restoreAfterReload();

    // (a) Storage strategy initialized — addTransaction will not throw
    expect(dataManager.getActiveStrategyType()).toBe('local');
    expect(dataManager.isReady()).toBe(true);

    // (b) sessionModeManager wired onto dataManager
    expect(dataManager.sessionModeManager).toBe(sessionModeManager);

    // (c) sessionModeManager wired onto teamRegistry (standalone branch)
    expect(teamRegistry.sessionModeManager).toBe(sessionModeManager);

    // (d) standalone-mode body class (hides networked-only admin sections)
    expect(document.body.classList.contains('standalone-mode')).toBe(true);
    expect(document.body.classList.contains('networked-mode')).toBe(false);

    // Mode locked + team entry shown
    expect(sessionModeManager.isStandalone()).toBe(true);
    expect(sessionModeManager.isLocked()).toBe(true);
    expect(mockUIManager.showScreen).toHaveBeenCalledWith('teamEntry');
  });

  it('preserves the persisted standalone session across reload (C7)', async () => {
    await restoreAfterReload();

    // The pre-reload session was NOT cleared as phantom data
    const session = dataManager.getCurrentSession();
    expect(session.sessionId).toBe('LOCAL_PRESERVED_SESSION');
    expect(dataManager.getTransactions()).toHaveLength(1);
    // Duplicate registry restored from persisted transactions
    expect(dataManager.isTokenScanned('pre001')).toBe(true);
  });

  it('fresh selection (selectGameMode) still clears phantom session data', async () => {
    await app.selectGameMode('standalone');

    expect(dataManager.getActiveStrategyType()).toBe('local');
    // Phantom session cleared — new LOCAL_ session id generated
    expect(dataManager.getCurrentSession().sessionId).not.toBe('LOCAL_PRESERVED_SESSION');
    expect(dataManager.getTransactions()).toHaveLength(0);
  });

  it('reload → team select → scan completes end-to-end', async () => {
    await restoreAfterReload();

    // Team selection goes through the STANDALONE branch (no backend call)
    const result = await teamRegistry.selectTeam('Team Alpha');
    expect(result).toEqual({ success: true });

    // Scan a token — must record a transaction, not throw 'No active strategy'
    app.currentTeamId = 'Team Alpha';
    await app.processNFCRead({ id: 'tac001', source: 'manual', raw: 'tac001' });

    const transactions = dataManager.getTransactions();
    expect(transactions).toHaveLength(2); // preserved tx + new scan
    const newTx = transactions.find(tx => tx.tokenId === 'tac001');
    expect(newTx).toBeDefined();
    expect(newTx.teamId).toBe('Team Alpha');
    // 3-star Technical = $50,000 x 5 = $250,000
    expect(newTx.points).toBe(250000);
    expect(mockUIManager.showTokenResult).toHaveBeenCalled();
    expect(mockUIManager.showError).not.toHaveBeenCalled();
  });
});
