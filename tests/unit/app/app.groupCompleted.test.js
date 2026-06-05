/**
 * Unit Test: App group:completed toast (CC-1)
 * Verifies the toast surfaces bonusPoints (the AsyncAPI field), not the
 * legacy `bonus` name. networkedSession forwards the raw backend payload.
 */
import { App } from '../../../src/app/app.js';

describe('App - group:completed toast', () => {
  let app;
  let mockDependencies;

  beforeEach(() => {
    mockDependencies = {
      debug: { log: jest.fn() },
      uiManager: { showError: jest.fn(), showScreen: jest.fn(), showToast: jest.fn() },
      settings: { deviceId: 'TEST_001', stationName: 'Test', save: jest.fn() },
      sessionModeManager: {
        setMode: jest.fn(),
        isNetworked: jest.fn(() => true),
        isStandalone: jest.fn(() => false),
      },
      tokenManager: {},
      dataManager: { resetForNewSession: jest.fn() },
      standaloneDataManager: { sessionData: {}, scannedTokens: new Set() },
    };
    Storage.prototype.getItem = jest.fn();
    Storage.prototype.setItem = jest.fn();
    Storage.prototype.removeItem = jest.fn();

    app = new App(mockDependencies);
    // Drive the real listener wiring against a live EventTarget
    app.networkedSession = new EventTarget();
    app._wireNetworkedSessionEvents();
  });

  afterEach(() => jest.clearAllMocks());

  it('renders the bonusPoints amount in the toast', () => {
    app.networkedSession.dispatchEvent(new CustomEvent('group:completed', {
      detail: { teamId: 'Team Alpha', group: 'jaw_group', bonusPoints: 60000, completedAt: '2026-05-29T00:00:00.000Z' },
    }));

    expect(mockDependencies.uiManager.showToast).toHaveBeenCalledWith(
      'Group completed by Team Alpha +$60,000'
    );
  });

  it('omits the amount gracefully when bonusPoints is absent', () => {
    app.networkedSession.dispatchEvent(new CustomEvent('group:completed', {
      detail: { teamId: 'Team Beta' },
    }));

    expect(mockDependencies.uiManager.showToast).toHaveBeenCalledWith(
      'Group completed by Team Beta'
    );
  });
});
