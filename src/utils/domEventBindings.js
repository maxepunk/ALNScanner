/**
 * DOM Event Bindings
 * Replaces HTML onclick handlers with proper event listeners
 *
 * This module implements event delegation to handle button clicks without
 * exposing global window.App, window.DataManager, etc.
 */

export function bindDOMEvents(app, dataManager, settings, debug, uiManager, connectionWizard, queueStatusManager) {
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

        default:
          debug.log(`Unknown action target: ${target}`, true);
      }
    } catch (error) {
      debug.log(`Action handler error: ${action} - ${error.message}`, true);
      console.error(`Action handler error: ${action}`, error);
    }
  });
}
