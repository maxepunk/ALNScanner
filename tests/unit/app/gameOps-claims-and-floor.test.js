/**
 * GameOpsDomain — the D2s2/D3s2 branches added in the slice-2 closers
 * (through the App facade, the same pattern as app-nfc-errors):
 *
 * - D3s2 claims gates: a NON-CONSUMING current mode skips the pre-submit
 *   duplicate block and never optimistically marks the token (both the
 *   networked and standalone paths); consuming behavior unchanged.
 * - D2s2 floor surfacing: a standalone adjustTeamScore refusal
 *   ({success:false}) shows an error, never a success toast.
 *
 * These branches live in gameOps.js — the CI coverage ratchet caught
 * them untested at the domain level (floor 60% branches, dropped to
 * 59.04% when the closers added the gates).
 */

import { App } from '../../../src/app/app.js';
import { applyPackModes, _resetForTesting } from '../../../src/core/modeSemantics.js';

const CLAIMS_MODES = {
  modes: [
    { id: 'sell', label: 'Sell', scoringPolicy: 'standard', entityRole: 'ledger', countsTowardGroups: true, displayBehavior: { surface: 'scoreboard-rankings' } },
    { id: 'inspect', label: 'Inspect', scoringPolicy: 'none', entityRole: 'ledger', countsTowardGroups: false, claims: 'non-consuming', displayBehavior: { surface: 'none' } },
  ],
};

describe('GameOpsDomain — claims gates + floor surfacing (slice-2 closers)', () => {
  let app;
  let deps;
  let queueTransaction;

  beforeEach(() => {
    applyPackModes(CLAIMS_MODES);
    queueTransaction = jest.fn(() => 'tx-queued-1');

    deps = {
      debug: { log: jest.fn() },
      uiManager: {
        showError: jest.fn(),
        showScreen: jest.fn(),
        showToast: jest.fn(),
        updateSessionStats: jest.fn(),
        showTokenResult: jest.fn(),
        updateTeamDisplay: jest.fn(),
        renderTeamDetails: jest.fn(),
      },
      settings: { deviceId: 'TEST_001', mode: 'sell', save: jest.fn() },
      sessionModeManager: {
        setMode: jest.fn(),
        isNetworked: jest.fn(() => false),
        isStandalone: jest.fn(() => true),
      },
      tokenManager: {
        findToken: jest.fn((id) => ({
          matchedId: id,
          token: { SF_RFID: id, SF_ValueRating: 1, SF_MemoryType: 'Personal', SF_Group: '' },
        })),
      },
      dataManager: {
        isTokenScanned: jest.fn(() => false),
        markTokenAsScanned: jest.fn(),
        addTransaction: jest.fn().mockResolvedValue({ success: true }),
        adjustTeamScore: jest.fn().mockResolvedValue({ success: true }),
        getTeamTransactions: jest.fn(() => []),
        calculateTokenValue: jest.fn(() => 10000),
        sessionState: { status: 'active' },
      },
      networkedSession: { getService: jest.fn(() => ({ queueTransaction })) },
      nfcHandler: { startScan: jest.fn(), stopScan: jest.fn() },
      config: { SCAN_SIMULATION_DELAY: 1000 },
    };

    document.body.innerHTML = `
      <div id="scanButton"></div><div id="scanStatus"></div><div id="currentTeam"></div>
      <input id="scoreAdjustmentInput" value="-500" />
      <input id="scoreAdjustmentReason" value="test penalty" />
      <div id="resultStatus"></div>
    `;

    app = new App(deps);
    app.currentTeamId = 'Team Alpha';
  });

  afterEach(() => {
    _resetForTesting();
    jest.clearAllMocks();
  });

  describe('D3s2 — pre-submit duplicate gate consults the mode claims', () => {
    it('a NON-CONSUMING mode scan of an already-scanned token is NOT blocked and is recorded unmarked', async () => {
      deps.settings.mode = 'inspect';
      deps.dataManager.isTokenScanned.mockReturnValue(true);

      await app.processNFCRead({ id: 'tok1', source: 'manual' });

      // Not blocked: the transaction was recorded…
      expect(deps.dataManager.addTransaction).toHaveBeenCalledTimes(1);
      // …and never marked (a non-consuming action registers nothing)
      expect(deps.dataManager.markTokenAsScanned).not.toHaveBeenCalled();
    });

    it('a CONSUMING mode scan of an already-scanned token is still blocked', async () => {
      deps.settings.mode = 'sell';
      deps.dataManager.isTokenScanned.mockReturnValue(true);

      await app.processNFCRead({ id: 'tok1', source: 'manual' });

      expect(deps.dataManager.addTransaction).not.toHaveBeenCalled();
      expect(deps.uiManager.showScreen).toHaveBeenCalledWith('result'); // duplicate screen
    });

    it('a CONSUMING standalone scan marks the token (unchanged behavior)', async () => {
      deps.settings.mode = 'sell';

      await app.processNFCRead({ id: 'tok1', source: 'manual' });

      expect(deps.dataManager.addTransaction).toHaveBeenCalledTimes(1);
      expect(deps.dataManager.markTokenAsScanned).toHaveBeenCalledWith('tok1');
    });

    it('NETWORKED: a non-consuming scan queues but never optimistically marks; consuming marks', async () => {
      deps.sessionModeManager.isNetworked.mockReturnValue(true);
      deps.sessionModeManager.isStandalone.mockReturnValue(false);

      deps.settings.mode = 'inspect';
      await app.processNFCRead({ id: 'tok1', source: 'manual' });
      expect(queueTransaction).toHaveBeenCalledTimes(1);
      expect(deps.dataManager.markTokenAsScanned).not.toHaveBeenCalled();

      deps.settings.mode = 'sell';
      await app.processNFCRead({ id: 'tok2', source: 'manual' });
      expect(deps.dataManager.markTokenAsScanned).toHaveBeenCalledWith('tok2');
    });
  });

  describe('D2s2 — standalone score-adjustment refusal surfaces honestly', () => {
    it('a {success:false} refusal shows an error and NEVER a success toast', async () => {
      app.currentInterventionTeamId = 'Team Alpha';
      deps.dataManager.adjustTeamScore.mockResolvedValue({
        success: false,
        error: 'Score adjustment refused: -500 would take Team Alpha to -500',
      });

      await app.adjustTeamScore();

      expect(deps.uiManager.showError).toHaveBeenCalledWith(
        expect.stringContaining('Score adjustment refused')
      );
      expect(deps.uiManager.showToast).not.toHaveBeenCalled();
    });

    it('a successful adjustment still toasts and refreshes team details', async () => {
      app.currentInterventionTeamId = 'Team Alpha';

      await app.adjustTeamScore();

      expect(deps.uiManager.showToast).toHaveBeenCalledWith(
        expect.stringContaining('Score adjusted'), 'success'
      );
      expect(deps.uiManager.renderTeamDetails).toHaveBeenCalled();
      expect(deps.uiManager.showError).not.toHaveBeenCalled();
    });
  });
});
