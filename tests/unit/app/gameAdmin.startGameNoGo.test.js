/**
 * Block 2 T1a D13 (ruling R12) — the typed "start anyway" dialog.
 *
 * The gate exists so a show does not begin with required equipment
 * missing. The override exists because sometimes the GM knows something the
 * profile does not — and the price of using it is typing WHY, once, where
 * it lands in the session record and the log. A blank reason is not an
 * override; it is a click-through, which is the thing the gate is for.
 */

import { GameAdminDomain } from '../../../src/app/domains/gameAdmin.js';

describe('adminStartGame — the NO-GO dialog (T1a D13 / R12)', () => {
  let startGame, app, promptSpy;

  const NO_GO = "NO-GO: required endpoint 'lighting.instruments' not installed at this venue";

  beforeEach(() => {
    startGame = jest.fn().mockResolvedValue({ success: true });
    app = {
      uiManager: { showError: jest.fn(), showToast: jest.fn() },
      debug: { log: jest.fn() },
      viewController: { adminInstances: { sessionManager: { startGame } } },
      sessionModeManager: { isStandalone: () => false },
    };
    promptSpy = jest.spyOn(global, 'prompt');
  });

  afterEach(() => jest.restoreAllMocks());

  it('starts with an empty payload and never prompts when the gate passes', async () => {
    await new GameAdminDomain(app).adminStartGame();

    expect(startGame).toHaveBeenCalledTimes(1);
    expect(startGame).toHaveBeenCalledWith({});
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it('on a NO-GO, prompts with the reasons and re-sends the typed override', async () => {
    startGame
      .mockRejectedValueOnce(new Error(NO_GO))
      .mockResolvedValueOnce({ success: true });
    promptSpy.mockReturnValue('the rig is in the van');

    await new GameAdminDomain(app).adminStartGame();

    const promptText = promptSpy.mock.calls[0][0];
    expect(promptText).toContain("required endpoint 'lighting.instruments' not installed at this venue");
    expect(promptText).toContain('Type a reason to start anyway, or Cancel:');

    expect(startGame).toHaveBeenCalledTimes(2);
    expect(startGame).toHaveBeenLastCalledWith({
      startAnyway: true, reason: 'the rig is in the van',
    });
  });

  it('CANCEL stops — no second send, and the NO-GO is surfaced', async () => {
    startGame.mockRejectedValueOnce(new Error(NO_GO));
    promptSpy.mockReturnValue(null);

    await new GameAdminDomain(app).adminStartGame();

    expect(startGame).toHaveBeenCalledTimes(1);
    expect(app.uiManager.showError).toHaveBeenCalledWith(expect.stringContaining('NO-GO'));
  });

  it('an EMPTY reason stops too — a click-through is not an override', async () => {
    startGame.mockRejectedValueOnce(new Error(NO_GO));
    promptSpy.mockReturnValue('   ');

    await new GameAdminDomain(app).adminStartGame();

    expect(startGame).toHaveBeenCalledTimes(1);
    expect(app.uiManager.showError).toHaveBeenCalledWith(expect.stringContaining('NO-GO'));
  });

  it('a NON-NO-GO failure never prompts — it is an error, not a decision', async () => {
    startGame.mockRejectedValueOnce(new Error('session:start timeout after 5000ms'));

    await new GameAdminDomain(app).adminStartGame();

    expect(promptSpy).not.toHaveBeenCalled();
    expect(startGame).toHaveBeenCalledTimes(1);
    expect(app.uiManager.showError).toHaveBeenCalledWith(expect.stringContaining('timeout'));
  });

  it('surfaces a failure of the OVERRIDE attempt itself', async () => {
    startGame
      .mockRejectedValueOnce(new Error(NO_GO))
      .mockRejectedValueOnce(new Error('startAnyway requires a reason'));
    promptSpy.mockReturnValue('because');

    await new GameAdminDomain(app).adminStartGame();

    expect(startGame).toHaveBeenCalledTimes(2);
    expect(app.uiManager.showError).toHaveBeenCalledWith(
      expect.stringContaining('startAnyway requires a reason')
    );
  });

  it('says so when the admin modules are not available', async () => {
    app.viewController.adminInstances = {};
    await new GameAdminDomain(app).adminStartGame();
    expect(startGame).not.toHaveBeenCalled();
    expect(app.uiManager.showError).toHaveBeenCalled();
  });
});
