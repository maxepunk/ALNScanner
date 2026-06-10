/**
 * UI Manager Module
 * Manages all UI rendering and screen navigation
 * ES6 Module - Pure Rendering Layer (does NOT extend EventTarget)
 *
 * Responsibilities:
 * - Screen navigation
 * - DOM updates and rendering
 * - Error/toast notifications
 * - Mode display management
 * - Scoreboard and team details rendering
 */

import { escapeHtml } from '../utils/escapeHtml.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDuration } from '../utils/formatDuration.js';
import { GameOpsRenderer } from './renderers/GameOpsRenderer.js';
import { GameAdminRenderer } from './renderers/GameAdminRenderer.js';

/**
 * UIManager - Shared-infra shell + domain renderer coordination
 *
 * Responsibilities:
 * - Screen navigation (showScreen, previousScreen)
 * - Error/toast notifications (showError, showToast)
 * - Mode display, navigation buttons, stats badges
 * - Delegates domain rendering to per-domain renderers:
 *   - GameOpsRenderer: scoreboard, team details, game activity
 *   - GameAdminRenderer: session status (standalone admin panel)
 *
 * Phase-2 structural split (decision C1): domain renderer classes own the
 * rendering logic; UIManager keeps the public surface for existing callers.
 */
class UIManager {
  /**
   * Create UIManager instance
   * @param {Object} options - Dependency injection options
   * @param {Object} options.settings - Settings instance (for mode checking)
   * @param {Object} options.dataManager - UnifiedDataManager instance
   * @param {Object} options.sessionModeManager - SessionModeManager instance (for mode check)
   * @param {Object} options.app - App instance (for callbacks like showTeamDetails, deleteTeamTransaction)
   */
  constructor({ settings, dataManager, sessionModeManager, app } = {}) {
    this.settings = settings;
    this.dataManager = dataManager;
    this.sessionModeManager = sessionModeManager;
    this.app = app;

    this.screens = {};
    this.previousScreen = null;
    this.errorContainer = null;

    // Domain renderers — instantiated here so they can be injected/replaced in tests
    this._gameOpsRenderer = new GameOpsRenderer({ dataManager, sessionModeManager, app });
    this._gameAdminRenderer = new GameAdminRenderer({ dataManager });
  }

  /**
   * Sync renderer dependencies to current UIManager state.
   * Called before each domain render delegation to pick up any post-construction
   * mutations (e.g. tests that reassign uiManager.dataManager directly).
   * @private
   */
  _syncRendererDeps() {
    this._gameOpsRenderer.dataManager = this.dataManager;
    this._gameOpsRenderer.sessionModeManager = this.sessionModeManager;
    this._gameOpsRenderer.app = this.app;
    this._gameAdminRenderer.dataManager = this.dataManager;
  }

  /**
   * Initialize UI elements
   * Caches screen references and sets up error container
   */
  init() {
    this.screens = {
      loading: document.getElementById('loadingScreen'),
      gameModeScreen: document.getElementById('gameModeScreen'),
      teamEntry: document.getElementById('teamEntryScreen'),
      scan: document.getElementById('scanScreen'),
      result: document.getElementById('resultScreen'),
      history: document.getElementById('historyScreen'),
      scoreboard: document.getElementById('scoreboardScreen'),
      teamDetails: document.getElementById('teamDetailsScreen')
    };

    // Initialize error display container
    this.initErrorDisplay();
  }

  /**
   * Initialize error display container
   */
  initErrorDisplay() {
    // Create error container if doesn't exist
    if (!document.getElementById('error-container')) {
      const container = document.createElement('div');
      container.id = 'error-container';
      container.className = 'error-container';
      document.body.appendChild(container);
    }
    this.errorContainer = document.getElementById('error-container');
  }

  /**
   * Show error message to user
   * @param {string} message - Error message to display
   * @param {number} duration - Duration in milliseconds (default 5000)
   */
  showError(message, duration = 5000) {
    if (!this.errorContainer) {
      this.initErrorDisplay();
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;

    this.errorContainer.appendChild(errorDiv);

    // Auto-dismiss after duration
    setTimeout(() => {
      errorDiv.style.animation = 'slideOut 0.3s ease-out forwards';
      setTimeout(() => errorDiv.remove(), 300);
    }, duration);
  }

  /**
   * Show toast notification to user
   * @param {string} message - Notification message
   * @param {string} type - Toast type: 'info', 'success', 'warning', 'error'
   * @param {number} duration - Duration in milliseconds (default 3000)
   */
  showToast(message, type = 'info', duration = 3000) {
    if (!this.errorContainer) {
      this.initErrorDisplay();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    this.errorContainer.appendChild(toast);

    // Auto-dismiss after duration
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-out forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /**
   * Show specified screen
   * @param {string} screenName - Name of screen to show
   */
  showScreen(screenName) {
    // Track previous screen for back navigation
    const current = document.querySelector('.screen.active');
    if (current && current.id !== 'historyScreen' &&
      current.id !== 'scoreboardScreen' &&
      current.id !== 'teamDetailsScreen' &&
      current.id !== 'gameModeScreen' &&
      current.id !== 'loadingScreen' &&
      screenName !== 'history' &&
      screenName !== 'scoreboard' &&
      screenName !== 'teamDetails') {
      this.previousScreen = current.id.replace('Screen', '');
    }

    // Hide all screens
    Object.values(this.screens).forEach(screen => {
      if (screen) {
        screen.classList.remove('active');
      }
    });

    // Show requested screen
    if (this.screens[screenName]) {
      this.screens[screenName].classList.add('active');
    }

    // Screen-specific initialization callbacks
    if (screenName === 'teamEntry' && this.app?.initTeamEntryUI) {
      this.app.initTeamEntryUI();
    }
    if (screenName === 'scoreboard') {
      this.renderScoreboard();
    }
    if (screenName === 'result') {
      this._enableResultScreenQuickDismiss();
    }
  }

  /**
   * Enable quick-dismiss behavior on result screen
   * Tap anywhere (except buttons) returns to scan screen
   * @private
   */
  _enableResultScreenQuickDismiss() {
    const resultScreen = this.screens.result;
    if (!resultScreen) return;

    const dismissHandler = (event) => {
      // Don't dismiss if clicking any button (let data-action handlers handle navigation)
      if (event.target.closest('button')) {
        return;
      }
      resultScreen.removeEventListener('click', dismissHandler);
      this.showScreen('scan');
    };

    // Remove any existing handler first (prevents stacking)
    if (resultScreen._quickDismissHandler) {
      resultScreen.removeEventListener('click', resultScreen._quickDismissHandler);
    }
    resultScreen._quickDismissHandler = dismissHandler;
    resultScreen.addEventListener('click', dismissHandler);
  }

  /**
   * Update mode display elements
   * @param {string} mode - 'detective' or 'blackmarket'
   */
  updateModeDisplay(mode) {
    const indicator = document.getElementById('modeIndicator');
    const modeText = document.getElementById('modeText');
    const toggle = document.getElementById('modeToggle');

    if (!indicator) return;

    if (mode === 'blackmarket') {
      indicator.className = 'mode-indicator mode-blackmarket';
      indicator.textContent = 'Black Market Mode';
      if (modeText) modeText.textContent = 'Black Market Mode';
      if (toggle) toggle.checked = true;
    } else {
      indicator.className = 'mode-indicator mode-detective';
      indicator.textContent = 'Detective Mode';
      if (modeText) modeText.textContent = 'Detective Mode';
      if (toggle) toggle.checked = false;
    }

    this.updateNavigationButtons();
  }

  /**
   * Update navigation button visibility
   */
  updateNavigationButtons() {
    const scoreboardButton = document.getElementById('scoreboardButton');
    if (scoreboardButton && this.settings) {
      scoreboardButton.style.display =
        this.settings.mode === 'blackmarket' ? 'block' : 'none';
    }
  }

  /**
   * Update team display
   * @param {string} teamId - Team ID to display
   */
  updateTeamDisplay(teamId) {
    const display = document.getElementById('teamDisplay');
    if (display) {
      display.textContent = teamId || '_';
    }
  }

  /**
   * Update session statistics display
   */
  updateSessionStats() {
    const dataSource = this.dataManager;
    if (!dataSource || !this.settings) return;

    const stats = dataSource.getSessionStats();
    const tokenCount = document.getElementById('teamTokenCount');
    const valueElement = document.getElementById('teamTotalValue');
    const labelElement = document.getElementById('teamValueLabel');

    if (tokenCount) {
      tokenCount.textContent = stats.count;
    }

    if (valueElement) {
      if (this.settings.mode === 'blackmarket') {
        valueElement.textContent = formatCurrency(stats.totalScore);
        if (labelElement) labelElement.textContent = 'Score';
      } else {
        valueElement.textContent = stats.totalValue;
        if (labelElement) labelElement.textContent = 'Total Value';
      }
    }
  }

  /**
   * Update history badge count
   */
  updateHistoryBadge() {
    const dataSource = this.dataManager;
    if (!dataSource) return;

    const badge = document.getElementById('historyBadge');
    if (!badge) return;

    // Check if strategy is initialized before accessing transactions
    if (!dataSource.getActiveStrategyType()) {
      badge.style.display = 'none';
      return;
    }

    const count = dataSource.getTransactions().length;
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }

  /**
   * Update history statistics
   */
  updateHistoryStats() {
    const dataSource = this.dataManager;
    if (!dataSource) return;

    const stats = dataSource.getGlobalStats();
    const totalScans = document.getElementById('totalScans');
    const uniqueTeams = document.getElementById('uniqueTeams');
    const totalValue = document.getElementById('totalValue');
    const avgValue = document.getElementById('avgValue');

    if (totalScans) totalScans.textContent = stats.total;
    if (uniqueTeams) uniqueTeams.textContent = stats.teams;
    if (totalValue) totalValue.textContent = stats.totalValue;
    if (avgValue) avgValue.textContent = stats.avgValue;
  }

  /**
   * Render scoreboard
   * @param {HTMLElement|null} container - Optional container element. Defaults to #scoreboardContainer
   */
  renderScoreboard(container = null) {
    this._syncRendererDeps();
    this._gameOpsRenderer.renderScoreboard(container);
  }

  /**
   * Render session status display (mode-agnostic)
   * Used by standalone mode admin panel
   * @param {HTMLElement} container - Container element
   */
  renderSessionStatus(container) {
    this._syncRendererDeps();
    this._gameAdminRenderer.renderSessionStatus(container);
  }

  /**
   * Format duration in milliseconds to human readable
   * Delegates to shared formatDuration utility (F-GMS-14 consolidation).
   * @private
   */
  _formatDuration(ms) {
    return formatDuration(ms, { fallback: '0m' });
  }

  /**
   * Render team details with enhanced grouping
   * @param {string} teamId - Team ID
   * @param {Array} transactions - Team transactions
   */
  renderTeamDetails(teamId, transactions) {
    this._syncRendererDeps();
    this._gameOpsRenderer.renderTeamDetails(teamId, transactions);
  }

  /**
   * Render individual token card
   * @param {Object} token - Token data (transaction object)
   * @param {boolean} hasBonus - Whether token has group bonus
   * @param {boolean} isUnknown - Whether token is unknown
   * @param {boolean} showDelete - Show delete button (both networked and standalone modes)
   * @returns {string} HTML string
   */
  renderTokenCard(token, hasBonus = false, isUnknown = false, showDelete = false) {
    this._syncRendererDeps();
    return this._gameOpsRenderer.renderTokenCard(token, hasBonus, isUnknown, showDelete);
  }

  /**
   * Show notification for group completion (from backend event)
   * @param {Object} data - Group completion data
   */
  showGroupCompletionNotification(data) {
    this._gameOpsRenderer.showGroupCompletionNotification(data);
  }

  /**
   * Show token scan result
   * @param {Object} token - Token data
   * @param {string} tokenId - Token ID
   * @param {boolean} isUnknown - Whether token is unknown
   */
  showTokenResult(token, tokenId, isUnknown) {
    const dataSource = this.dataManager;
    if (!dataSource || !this.settings) return;

    const statusEl = document.getElementById('resultStatus');
    const rfidEl = document.getElementById('resultRfid');
    const typeEl = document.getElementById('resultType');
    const groupEl = document.getElementById('resultGroup');
    const valueEl = document.getElementById('resultValue');
    const summaryContainer = document.getElementById('resultSummaryContainer');
    const summaryEl = document.getElementById('resultSummary');

    if (!statusEl || !rfidEl || !typeEl || !groupEl || !valueEl) return;

    if (isUnknown) {
      statusEl.className = 'status-message error';
      statusEl.innerHTML = `
        <h2>Unknown Token</h2>
        <p style="font-size: 14px;">Not in database</p>
      `;
      rfidEl.textContent = tokenId;
      typeEl.textContent = 'UNKNOWN';
      typeEl.style.color = '#FF5722';
      groupEl.textContent = `Raw ID: ${tokenId}`;

      if (this.settings.mode === 'blackmarket') {
        valueEl.textContent = '$0';
      } else {
        valueEl.textContent = 'No Value';
      }

      // Hide summary for unknown tokens
      if (summaryContainer) {
        summaryContainer.style.display = 'none';
      }
    } else {
      statusEl.className = 'status-message success';
      statusEl.innerHTML = '<h2>Transaction Complete!</h2>';
      rfidEl.textContent = tokenId;
      typeEl.textContent = token.SF_MemoryType;
      typeEl.style.color = '#333';
      groupEl.textContent = token.SF_Group;

      if (this.settings.mode === 'blackmarket') {
        const tokenScore = dataSource.calculateTokenValue({
          valueRating: token.SF_ValueRating,
          memoryType: token.SF_MemoryType,
          isUnknown: false
        });
        valueEl.textContent = formatCurrency(tokenScore);
      } else {
        valueEl.textContent = '⭐'.repeat(token.SF_ValueRating || 0);
      }

      // Show summary if available (all modes - gives GM visibility on token content)
      if (token.summary && summaryContainer && summaryEl) {
        summaryContainer.style.display = 'flex';
        summaryEl.textContent = token.summary;
      } else if (summaryContainer) {
        summaryContainer.style.display = 'none';
      }
    }

    this.showScreen('result');
    // Quick-dismiss is now handled by showScreen('result') -> _enableResultScreenQuickDismiss()
  }

  /**
   * Format timestamp to time string (HH:MM)
   * @param {string} timestamp - ISO timestamp
   * @returns {string} Formatted time
   */
  _formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Unified game activity renderer — used by BOTH admin panel AND historyScreen
   * @param {HTMLElement} container - Target container
   * @param {Object} options - Rendering options
   */
  renderGameActivity(container, options = {}) {
    this._syncRendererDeps();
    this._gameOpsRenderer.renderGameActivity(container, options);
  }
}

// Export class (not pre-created instance)
// Instance created in main.js with proper dependency injection
export default UIManager;
export { UIManager };
