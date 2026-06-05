/**
 * DOM Event Bindings
 * Replaces HTML onclick handlers with proper event listeners
 *
 * This module implements event delegation to handle button clicks without
 * exposing global window.App, window.DataManager, etc.
 */

/** Trailing debounce — fires after `delayMs` of no calls */
function debounce(fn, delayMs) {
  let timer = null;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delayMs);
  };
}

export function bindDOMEvents(app, dataManager, settings, debug, uiManager, connectionWizard, queueStatusManager) {

  /** Catch rejected promises from fire-and-forget admin actions */
  function safeAdminAction(actionPromise, actionName) {
    if (actionPromise && typeof actionPromise.catch === 'function') {
      actionPromise.catch(err => {
        debug.log(`Command failed: ${actionName} — ${err.message}`, true);
        // AC-2: surface to the operator, not just the debug panel.
        // Guarded for test harnesses that may not inject a uiManager.
        if (uiManager && typeof uiManager.showError === 'function') {
          uiManager.showError(`Command failed: ${err.message}`);
        }
      });
    }
  }

  // Debounced volume setter for the music (MPD) slider.
  // Prevents pile-up of D-Bus calls and slider DOM destruction during drag
  // (renderer replaces innerHTML on state push). 150ms trailing debounce.
  const debouncedMusicVolume = debounce((volume) => {
    const adminController = app.networkedSession?.getService('adminController');
    if (adminController?.initialized) {
      safeAdminAction(adminController.getModule('musicController').setVolume(volume), 'musicSetVolume');
    }
  }, 150);

  // Debounced stream volume setter (video, music, sound via PipeWire)
  const debouncedStreamVolume = debounce((stream, volume) => {
    const adminController = app.networkedSession?.getService('adminController');
    if (adminController?.initialized) {
      safeAdminAction(adminController.getModule('audioController').setVolume(stream, volume), 'setStreamVolume');
    }
  }, 150);

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
        safeAdminAction(adminController.getModule('sessionManager').startGame(), 'startGame');
        break;
      case 'fireCue': {
        const cueId = actionElement.dataset.cueId;
        if (cueId) {
          safeAdminAction(adminController.getModule('cueController').fireCue(cueId), 'fireCue');
        }
        break;
      }
      case 'enableCue': {
        const cueId = actionElement.dataset.cueId;
        if (cueId) {
          safeAdminAction(adminController.getModule('cueController').enableCue(cueId), 'enableCue');
        }
        break;
      }
      case 'disableCue': {
        const cueId = actionElement.dataset.cueId;
        if (cueId) {
          safeAdminAction(adminController.getModule('cueController').disableCue(cueId), 'disableCue');
        }
        break;
      }
      case 'pauseCue': {
        const cueId = actionElement.dataset.cueId;
        if (cueId) {
          safeAdminAction(adminController.getModule('cueController').pauseCue(cueId), 'pauseCue');
        }
        break;
      }
      case 'stopCue': {
        const cueId = actionElement.dataset.cueId;
        if (cueId) {
          safeAdminAction(adminController.getModule('cueController').stopCue(cueId), 'stopCue');
        }
        break;
      }
      case 'resumeCue': {
        const cueId = actionElement.dataset.cueId;
        if (cueId) {
          safeAdminAction(adminController.getModule('cueController').resumeCue(cueId), 'resumeCue');
        }
        break;
      }
      case 'releaseHeld': {
        const heldId = actionElement.dataset.heldId;
        if (heldId) {
          safeAdminAction(adminController.getModule('cueController').releaseHeld(heldId), 'releaseHeld');
        }
        break;
      }
      case 'discardHeld': {
        const heldId = actionElement.dataset.heldId;
        if (heldId) {
          safeAdminAction(adminController.getModule('cueController').discardHeld(heldId), 'discardHeld');
        }
        break;
      }
      case 'releaseAllHeld':
        safeAdminAction(adminController.getModule('cueController').releaseAllHeld(), 'releaseAllHeld');
        break;
      case 'discardAllHeld':
        safeAdminAction(adminController.getModule('cueController').discardAllHeld(), 'discardAllHeld');
        break;
      case 'serviceCheck': {
        const serviceId = actionElement.getAttribute('data-service-id');
        safeAdminAction(adminController.getModule('adminOperations').checkService(serviceId), 'serviceCheck');
        break;
      }
      case 'musicPlay':
        safeAdminAction(adminController.getModule('musicController').play(), 'musicPlay');
        break;
      case 'musicPause':
        safeAdminAction(adminController.getModule('musicController').pause(), 'musicPause');
        break;
      case 'musicStop':
        safeAdminAction(adminController.getModule('musicController').stop(), 'musicStop');
        break;
      case 'musicNext':
        safeAdminAction(adminController.getModule('musicController').next(), 'musicNext');
        break;
      case 'musicPrevious':
        safeAdminAction(adminController.getModule('musicController').previous(), 'musicPrevious');
        break;
      case 'musicSetVolume': {
        const volume = parseInt(actionElement.value, 10);
        if (!isNaN(volume)) {
          debouncedMusicVolume(volume);
        }
        break;
      }
      case 'musicSetShuffle': {
        const enabled = !!actionElement.checked;
        safeAdminAction(adminController.getModule('musicController').setShuffle(enabled), 'musicSetShuffle');
        break;
      }
      case 'musicSetLoop': {
        const enabled = !!actionElement.checked;
        safeAdminAction(adminController.getModule('musicController').setLoop(enabled), 'musicSetLoop');
        break;
      }
      case 'musicLoadPlaylist': {
        const playlistId = actionElement.value;
        if (playlistId) {
          safeAdminAction(adminController.getModule('musicController').loadPlaylist(playlistId), 'musicLoadPlaylist');
        }
        break;
      }
      case 'startBtScan':
        safeAdminAction(adminController.getModule('bluetoothController').startScan(), 'startBtScan');
        break;
      case 'stopBtScan':
        safeAdminAction(adminController.getModule('bluetoothController').stopScan(), 'stopBtScan');
        break;
      case 'pairBtDevice': {
        const address = actionElement.dataset.btAddress;
        if (address) safeAdminAction(adminController.getModule('bluetoothController').pairDevice(address), 'pairBtDevice');
        break;
      }
      case 'connectBtDevice': {
        const address = actionElement.dataset.btAddress;
        if (address) safeAdminAction(adminController.getModule('bluetoothController').connectDevice(address), 'connectBtDevice');
        break;
      }
      case 'disconnectBtDevice': {
        const address = actionElement.dataset.btAddress;
        if (address) safeAdminAction(adminController.getModule('bluetoothController').disconnectDevice(address), 'disconnectBtDevice');
        break;
      }
      case 'setAudioRoute': {
        const stream = actionElement.dataset.stream || 'video';
        const sink = actionElement.value;
        safeAdminAction(adminController.getModule('audioController').setVideoOutput(sink, stream), 'setAudioRoute');
        break;
      }
      case 'activateScene': {
        const sceneId = actionElement.dataset.sceneId;
        if (sceneId) {
          safeAdminAction(adminController.getModule('lightingController').activateScene(sceneId), 'activateScene');
        }
        break;
      }
      case 'setStreamVolume': {
        const stream = actionElement.dataset.stream;
        const volume = parseInt(actionElement.value, 10);
        if (stream && !isNaN(volume)) {
          // Update label immediately for responsive UI
          const label = actionElement.parentElement?.querySelector('.volume-label');
          if (label) label.textContent = `${volume}%`;
          debouncedStreamVolume(stream, volume);
        }
        break;
      }
      case 'scoreboardNext':
        safeAdminAction(adminController.getModule('scoreboardController').scrollNext(), 'scoreboardNext');
        break;
      case 'scoreboardPrev':
        safeAdminAction(adminController.getModule('scoreboardController').scrollPrev(), 'scoreboardPrev');
        break;
      case 'scoreboardJumpToOwner': {
        const dropdown = document.getElementById('scoreboard-owner-dropdown');
        const owner = dropdown?.value;
        if (owner) {
          safeAdminAction(adminController.getModule('scoreboardController').jumpToOwner(owner), 'scoreboardJumpToOwner');
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

    // Skip range inputs — handled by 'input' event listener
    if (actionElement.type === 'range') return;
    // Skip checkboxes and radios — handled by 'change' listener (avoids
    // double-firing because click on these toggles state then fires change).
    if (actionElement.type === 'checkbox' || actionElement.type === 'radio') return;

    // Prevent default action for links (e.g., <a href="#" data-action="...">)
    if (actionElement.tagName === 'A') {
      event.preventDefault();
    }

    const action = actionElement.dataset.action;
    const arg = actionElement.dataset.arg;

    // Split action into target and method
    const [target, method] = action.split('.');

    try {
      switch (target) {
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

  // Handle input events for range sliders with data-action (real-time volume feedback)
  document.addEventListener('input', (event) => {
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement || actionElement.type !== 'range') return;

    const action = actionElement.dataset.action;
    const [target, method] = action.split('.');

    try {
      if (target === 'admin') {
        handleAdminAction(method, actionElement);
      }
    } catch (error) {
      debug.log(`Action handler error: ${action} - ${error.message}`, true);
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
