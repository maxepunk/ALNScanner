/**
 * showToast - Shared toast notification utility (F-GMS-14 consolidation)
 *
 * Consolidates the two previously separate toast implementations:
 * UIManager.showToast and MonitoringDisplay.showToast. Both callers
 * now delegate here.
 *
 * Uses CSS class-based styling (toast, toast-{type}) so toast appearance
 * is controlled by the stylesheet, not inline styles.
 *
 * @module utils/showToast
 */

/**
 * Show a toast notification.
 *
 * @param {string} message - Notification message
 * @param {string} [type='info'] - Toast type: 'info' | 'success' | 'warning' | 'error'
 * @param {number} [duration=3000] - Auto-dismiss duration in milliseconds
 */
export function showToast(message, type = 'info', duration = 3000) {
  let container = document.getElementById('error-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'error-container';
    container.className = 'error-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
