/**
 * Unit Test: App scoreboard:page confirmation toast (P0.4)
 * The GM scanner consumes the scoreboard:page echo (its own navigation command,
 * rebroadcast by the backend) and surfaces a transient, parity-free confirmation
 * that the wall displays acted on it. No embedded scoreboard view, no page index.
 */
import { App } from '../../../src/app/app.js';

describe('App - scoreboard:page confirmation toast', () => {
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
    app.networkedSession = new EventTarget();
    app._wireNetworkedSessionEvents();
  });

  afterEach(() => jest.clearAllMocks());

  it('confirms a jump-to-owner navigation by character name', () => {
    app.networkedSession.dispatchEvent(new CustomEvent('scoreboard:page', {
      detail: { action: 'owner', owner: 'Ashe Motoko' },
    }));

    expect(mockDependencies.uiManager.showToast).toHaveBeenCalledWith('Displays → Ashe Motoko');
  });

  it('confirms next-page navigation', () => {
    app.networkedSession.dispatchEvent(new CustomEvent('scoreboard:page', {
      detail: { action: 'next' },
    }));

    expect(mockDependencies.uiManager.showToast).toHaveBeenCalledWith('Displays → next page');
  });

  it('confirms prev-page navigation', () => {
    app.networkedSession.dispatchEvent(new CustomEvent('scoreboard:page', {
      detail: { action: 'prev' },
    }));

    expect(mockDependencies.uiManager.showToast).toHaveBeenCalledWith('Displays → prev page');
  });
});
