/**
 * Show Control Domain
 *
 * Owns: video transport (play/pause/stop/skip), video queue management,
 * display mode control (idle loop / scoreboard / return-to-video),
 * and cue/sound surface-level app coordination (the controllers themselves
 * live in src/admin/).
 *
 * These were the "needs-owner-decision" lines in the Phase-2 blueprint.
 * Decision C1 assigns them to Show Control.
 *
 * @module app/domains/showControl
 */

export class ShowControlDomain {
  /**
   * @param {import('../app.js').App} app - The App instance (provides collaborators)
   */
  constructor(app) {
    this.app = app;
  }

  // ========== Video Transport ==========

  async _adminVideoAction(action) {
    const { viewController, uiManager } = this.app;
    if (!viewController.adminInstances?.videoController) {
      alert('Video controls not available.');
      return;
    }
    try {
      await viewController.adminInstances.videoController[action]();
    } catch (error) {
      const label = action.replace('Video', ' video');
      console.error(`Failed to ${label}:`, error);
      uiManager.showError(`Failed to ${label}.`);
    }
  }

  async adminPlayVideo() { return this._adminVideoAction('playVideo'); }
  async adminPauseVideo() { return this._adminVideoAction('pauseVideo'); }
  async adminStopVideo() { return this._adminVideoAction('stopVideo'); }
  async adminSkipVideo() { return this._adminVideoAction('skipVideo'); }

  // ========== Video Queue ==========

  async adminAddVideoToQueue() {
    const { viewController, uiManager } = this.app;
    if (!viewController.adminInstances?.videoController) {
      alert('Video controls not available.');
      return;
    }
    const input = document.getElementById('manual-video-input');
    const filename = input?.value;
    if (!filename) {
      alert('Enter a video filename (e.g., jaw001.mp4)');
      return;
    }
    try {
      await viewController.adminInstances.videoController.addToQueue(filename);
      uiManager.showToast(`Added ${filename} to queue`, 'success');
      if (input) input.value = '';
    } catch (error) {
      console.error('Failed to add video to queue:', error);
      uiManager.showError(`Failed to add video: ${error.message}`);
    }
  }

  async adminClearQueue() {
    const { viewController, uiManager } = this.app;
    if (!viewController.adminInstances?.videoController) {
      alert('Video controls not available.');
      return;
    }
    if (!confirm('Clear entire video queue?')) return;
    try {
      await viewController.adminInstances.videoController.clearQueue();
      uiManager.showToast('Queue cleared', 'success');
    } catch (error) {
      console.error('Failed to clear queue:', error);
      uiManager.showError(`Failed to clear queue: ${error.message}`);
    }
  }

  // ========== Display Mode ==========

  async _adminDisplayAction(action, label) {
    const { sessionModeManager, viewController, uiManager, debug } = this.app;
    if (!sessionModeManager?.isNetworked()) {
      debug.log('Display control only available in networked mode');
      return;
    }
    const displayController = viewController?.adminInstances?.displayController;
    if (!displayController) {
      debug.log('DisplayController not available - admin modules not initialized');
      uiManager.showError('Admin functions not available. Please ensure connection is established.');
      return;
    }
    try {
      const result = await displayController[action]();
      debug.log(`Display mode set to ${label}: ${JSON.stringify(result)}`);
    } catch (error) {
      console.error('Failed to set display mode:', error);
      uiManager.showError(`Failed to set display mode: ${error.message}`);
    }
  }

  async adminSetIdleLoop() { return this._adminDisplayAction('setIdleLoop', 'Idle Loop'); }
  async adminSetScoreboard() { return this._adminDisplayAction('setScoreboard', 'Scoreboard'); }
  async adminReturnToVideo() { return this._adminDisplayAction('returnToVideo', 'Return to Video'); }
}
