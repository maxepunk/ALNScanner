/**
 * DOM Event Bindings
 * Replaces HTML onclick handlers with proper event listeners
 *
 * This module implements event delegation to handle button clicks without
 * exposing global window.App, window.DataManager, etc.
 */

export function bindDOMEvents(app, dataManager, settings, debug, uiManager, connectionWizard, queueStatusManager) {

  /**
   * Handle admin.* actions — routes to AdminController modules
   * AdminController is accessed lazily via networkedSession (created after connection)
   */
  function handleAdminAction(method, actionElement) {
    const adminController = app.networkedSession?.getService('adminController');
    if (!adminController?.initialized) {
      debug.log('Admin action ignored: admin not initialized', true);
      return;
    }

    switch (method) {
      case 'startGame':
        adminController.getModule('sessionManager').startGame();
        break;
      case 'fireCue': {
        const cueId = actionElement.dataset.cueId;
        if (cueId) {
          adminController.getModule('cueController').fireCue(cueId);
        }
        break;
      }
      case 'enableCue': {
        const cueId = actionElement.dataset.cueId;
        if (cueId) {
          adminController.getModule('cueController').enableCue(cueId);
        }
        break;
      }
      case 'disableCue': {
        const cueId = actionElement.dataset.cueId;
        if (cueId) {
          adminController.getModule('cueController').disableCue(cueId);
        }
        break;
      }
      case 'pauseCue': {
        const cueId = actionElement.dataset.cueId;
        if (cueId) {
          adminController.getModule('cueController').pauseCue(cueId);
        }
        break;
      }
      case 'stopCue': {
        const cueId = actionElement.dataset.cueId;
        if (cueId) {
          adminController.getModule('cueController').stopCue(cueId);
        }
        break;
      }
      case 'resumeCue': {
        const cueId = actionElement.dataset.cueId;
        if (cueId) {
          adminController.getModule('cueController').resumeCue(cueId);
        }
        break;
      }
      case 'spotifyPlay':
        adminController.getModule('spotifyController').play();
        break;
      case 'spotifyPause':
        adminController.getModule('spotifyController').pause();
        break;
      case 'spotifyNext':
        adminController.getModule('spotifyController').next();
        break;
      case 'spotifyPrevious':
        adminController.getModule('spotifyController').previous();
        break;
      case 'startBtScan':
        adminController.getModule('bluetoothController').startScan();
        break;
      case 'stopBtScan':
        adminController.getModule('bluetoothController').stopScan();
        break;
      case 'setAudioRoute': {
        const stream = actionElement.dataset.stream || 'video';
        const sink = actionElement.value;
        adminController.getModule('audioController').setVideoOutput(sink, stream);
        break;
      }
      case 'lightingRetry':
        adminController.getModule('lightingController').refreshScenes();
        break;
      case 'activateScene': {
        const sceneId = actionElement.dataset.sceneId;
        if (sceneId) {
          adminController.getModule('lightingController').activateScene(sceneId);
        }
        break;
      }
      default:
        debug.log(`Unknown admin action: ${method}`, true);
    }
  }

  // Event delegation for data-action attributes
  document.addEventListener('click', (event) => {
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;

    // Prevent default action for links (e.g., <a href="#" data-action="...">)
    if (actionElement.tagName === 'A') {
      event.preventDefault();
    }

    const action = actionElement.dataset.action;
    const arg = actionElement.dataset.arg;

    // Split action into target and method
    const [target, method] = action.split('.');

    try {
      switch(target) {
        case 'app':
          if (typeof app[method] === 'function') {
            app[method](arg);
          } else {
            debug.log(`Action method not found: app.${method}`, true);
          }
          break;

        case 'dataManager':
          if (typeof dataManager[method] === 'function') {
            dataManager[method](arg);
          } else {
            debug.log(`Action method not found: dataManager.${method}`, true);
          }
          break;

        case 'settings':
          if (typeof settings[method] === 'function') {
            settings[method](arg);
          } else {
            debug.log(`Action method not found: settings.${method}`, true);
          }
          break;

        case 'debug':
          if (typeof debug[method] === 'function') {
            debug[method](arg);
          } else {
            debug.log(`Action method not found: debug.${method}`, true);
          }
          break;

        case 'uiManager':
          if (typeof uiManager[method] === 'function') {
            uiManager[method](arg);
          } else {
            debug.log(`Action method not found: uiManager.${method}`, true);
          }
          break;

        case 'connectionWizard':
          if (typeof connectionWizard[method] === 'function') {
            connectionWizard[method](arg);
          } else {
            debug.log(`Action method not found: connectionWizard.${method}`, true);
          }
          break;

        case 'queueStatusManager':
          if (typeof queueStatusManager[method] === 'function') {
            queueStatusManager[method](arg);
          } else {
            debug.log(`Action method not found: queueStatusManager.${method}`, true);
          }
          break;

        case 'admin':
          handleAdminAction(method, actionElement);
          break;

        default:
          debug.log(`Unknown action target: ${target}`, true);
      }
    } catch (error) {
      debug.log(`Action handler error: ${action} - ${error.message}`, true);
      console.error(`Action handler error: ${action}`, error);
    }
  });

  // Handle change events for radio/checkbox inputs with data-action
  // (clicking label text triggers change on the input, but click event
  // targets the label/span — closest('[data-action]') won't find the input)
  document.addEventListener('change', (event) => {
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;

    const action = actionElement.dataset.action;
    const [target, method] = action.split('.');

    try {
      if (target === 'admin') {
        handleAdminAction(method, actionElement);
      }
    } catch (error) {
      debug.log(`Action handler error: ${action} - ${error.message}`, true);
      console.error(`Action handler error: ${action}`, error);
    }
  });
}
