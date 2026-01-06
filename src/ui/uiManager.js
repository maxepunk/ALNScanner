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
  }

  /**
   * Initialize UI elements
   * Caches screen references and sets up error container
   */
  init() {
    this.screens = {
      loading: document.getElementById('loadingScreen'),
      settings: document.getElementById('settingsScreen'),
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
        valueElement.textContent = `$${stats.totalScore.toLocaleString()}`;
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
    const dataSource = this.dataManager;
    if (!dataSource || !this.app) return;

    // Use provided container or default to scoreboardContainer
    const targetContainer = container || document.getElementById('scoreboardContainer');
    if (!targetContainer) return;

    const teamScores = dataSource.getTeamScores();

    if (teamScores.length === 0) {
      targetContainer.innerHTML = `
        <div class="empty-state">
          <h3>No Teams Yet</h3>
          <p>Teams will appear here after scanning tokens</p>
        </div>
      `;
      return;
    }

    // Add score source indicator
    const scoreSource = teamScores[0]?.isFromBackend ?
      '<div class="score-source" style="text-align: center; margin: 10px 0; padding: 10px; background: rgba(103,126,234,0.1); border-radius: 8px; font-size: 14px;">🔗 Live from Orchestrator</div>' :
      '<div class="score-source" style="text-align: center; margin: 10px 0; padding: 10px; background: rgba(255,152,0,0.1); border-radius: 8px; font-size: 14px;">📱 Local Calculation</div>';

    targetContainer.innerHTML = scoreSource + teamScores.map((team, index) => {
      const rank = index + 1;
      const rankClass = rank <= 3 ? `rank-${rank}` : '';
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

      return `
        <div class="scoreboard-entry ${rankClass}" data-action="app.showTeamDetails" data-arg="${team.teamId}" style="cursor: pointer;">
          <div class="scoreboard-rank">${medal}</div>
          <div class="scoreboard-team">
            Team ${team.teamId}
            <span class="scoreboard-tokens">(${team.tokenCount} tokens)</span>
          </div>
          <div class="scoreboard-score">$${team.score.toLocaleString()}</div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render session status display (mode-agnostic)
   * Used by standalone mode admin panel
   * @param {HTMLElement} container - Container element
   */
  renderSessionStatus(container) {
    if (!container) return;

    const session = this.dataManager?.getCurrentSession?.();

    // No session
    if (!session) {
      container.innerHTML = `
        <div class="session-status session-status--empty">
          <p class="session-status__message">No Active Session</p>
          <p class="session-status__hint">Create a new session to begin tracking gameplay</p>
          <button class="btn btn-primary" data-action="app.adminCreateSession">
            Create New Session
          </button>
        </div>
      `;
      return;
    }

    // Calculate duration
    const startTime = new Date(session.startTime);
    const duration = this._formatDuration(Date.now() - startTime.getTime());

    // Paused session
    if (session.status === 'paused') {
      container.innerHTML = `
        <div class="session-status session-status--paused">
          <h4 class="session-status__header">
            <span class="session-status__icon">⏸️</span>
            <span>${this.escapeHtml(session.name || 'Session')}</span>
            <span class="session-status__badge session-status__badge--paused">Paused</span>
          </h4>
          <div class="session-status__details">
            <span>Started: ${startTime.toLocaleTimeString()}</span>
            <span>Duration: ${duration}</span>
          </div>
          <div class="session-status__actions">
            <button class="btn btn-primary" data-action="app.adminResumeSession">
              Resume Session
            </button>
            <button class="btn btn-danger" data-action="app.adminEndSession">
              End Session
            </button>
          </div>
        </div>
      `;
      return;
    }

    // Active session (default)
    container.innerHTML = `
      <div class="session-status session-status--active">
        <h4 class="session-status__header">
          <span class="session-status__icon">🎮</span>
          <span>${this.escapeHtml(session.name || 'Session')}</span>
          <span class="session-status__badge session-status__badge--active">Active</span>
        </h4>
        <div class="session-status__details">
          <span>Started: ${startTime.toLocaleTimeString()}</span>
          <span>Duration: ${duration}</span>
        </div>
        <div class="session-status__actions">
          <button class="btn btn-secondary" data-action="app.adminPauseSession">
            Pause Session
          </button>
          <button class="btn btn-danger" data-action="app.adminEndSession">
            End Session
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Format duration in milliseconds to human readable
   * @private
   */
  _formatDuration(ms) {
    if (!ms || ms < 0) return '0m';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Render team details with enhanced grouping
   * @param {string} teamId - Team ID
   * @param {Array} transactions - Team transactions
   */
  renderTeamDetails(teamId, transactions) {
    const dataSource = this.dataManager;
    if (!dataSource) return;

    // Get enhanced data structure
    const enhancedData = dataSource.getEnhancedTeamTransactions(teamId);
    const scoreData = dataSource.calculateTeamScoreWithBonuses(teamId);

    // Check if networked mode for intervention controls
    const isNetworked = this.sessionModeManager?.isNetworked();

    // Update header
    const titleEl = document.getElementById('teamDetailsTitle');
    const summaryEl = document.getElementById('teamDetailsSummary');

    if (titleEl) {
      titleEl.textContent = `Team ${teamId}`;
    }
    if (summaryEl) {
      summaryEl.textContent = `${transactions.length} token${transactions.length !== 1 ? 's' : ''} collected`;
    }

    // Build HTML with grouped sections
    let html = '';

    // Completed Groups Section
    if (enhancedData.hasCompletedGroups) {
      html += '<div class="section-divider">✅ Completed Groups</div>';

      enhancedData.completedGroups.forEach(group => {
        html += `
          <div class="group-section">
            <div class="group-header completed">
              <div class="group-title">
                <span class="completion-badge">🏆</span>
                <span class="group-name">${group.displayName}</span>
                <span class="completion-text">COMPLETE</span>
              </div>
              <div class="bonus-amount">
                +$${group.bonusValue.toLocaleString()} bonus (${group.multiplier}x)
              </div>
            </div>`;

        // Add tokens in this group
        const hasActiveSession = this.sessionModeManager?.isNetworked() || this.sessionModeManager?.isStandalone();
        group.tokens.forEach(token => {
          html += this.renderTokenCard(token, true, false, hasActiveSession);
        });

        html += '</div>';
      });
    }

    // In-progress Groups Section
    if (enhancedData.hasIncompleteGroups) {
      html += '<div class="section-divider">🔶 In Progress Groups</div>';

      enhancedData.incompleteGroups.forEach(group => {
        html += `
          <div class="group-section">
            <div class="group-header in-progress">
              <div class="group-title">
                <span class="progress-badge">⏳</span>
                <span class="group-name">${group.displayName}</span>
                <span class="progress-text">${group.progress}</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${group.percentage}%"></div>
              </div>
            </div>`;

        // Add tokens in this group
        const hasActiveSession = this.sessionModeManager?.isNetworked() || this.sessionModeManager?.isStandalone();
        group.tokens.forEach(token => {
          html += this.renderTokenCard(token, false, false, hasActiveSession);
        });

        html += '</div>';
      });
    }

    // Ungrouped Tokens Section
    if (enhancedData.hasUngroupedTokens) {
      html += '<div class="section-divider">📦 Individual Tokens</div>';

      const hasActiveSession = this.sessionModeManager?.isNetworked() || this.sessionModeManager?.isStandalone();
      enhancedData.ungroupedTokens.forEach(token => {
        html += this.renderTokenCard(token, false, false, hasActiveSession);
      });
    }

    // Unknown Tokens Section
    if (enhancedData.hasUnknownTokens) {
      html += '<div class="section-divider">❓ Unknown Tokens</div>';

      enhancedData.unknownTokens.forEach(token => {
        html += this.renderTokenCard(token, false, true, isNetworked);
      });
    }

    // Handle empty state
    if (html === '') {
      html = `
        <div class="empty-state">
          <h3>No Tokens</h3>
          <p>This team hasn't scanned any tokens yet</p>
        </div>
      `;
    }

    // Update container
    const container = document.getElementById('teamDetailsContainer');
    if (container) {
      container.innerHTML = html;
    }

    // Check if backend has authoritative score (networked mode only)
    // backendScores only exists in networked mode
    const backendScore = isNetworked && this.dataManager?.backendScores?.get(teamId);

    // Use backend scores if available (authoritative in networked mode)
    let displayBaseScore = scoreData.baseScore;
    let displayBonusScore = scoreData.bonusScore;
    let displayTotalScore = scoreData.totalScore;

    if (isNetworked && backendScore) {
      displayBaseScore = backendScore.baseScore;
      displayBonusScore = backendScore.bonusPoints;
      displayTotalScore = backendScore.currentScore;
    }

    // Update score breakdown with authoritative values
    const baseScoreEl = document.getElementById('teamBaseScore');
    const bonusScoreEl = document.getElementById('teamBonusScore');
    const totalScoreEl = document.getElementById('teamTotalScore');

    if (baseScoreEl) baseScoreEl.textContent = `$${displayBaseScore.toLocaleString()}`;
    if (bonusScoreEl) bonusScoreEl.textContent = `$${displayBonusScore.toLocaleString()}`;
    if (totalScoreEl) totalScoreEl.textContent = `$${displayTotalScore.toLocaleString()}`;

    // Display admin adjustments if present
    const adjustmentsSection = document.getElementById('teamAdminAdjustmentsSection');
    if (adjustmentsSection && isNetworked && backendScore?.adminAdjustments?.length > 0) {
      const adjustments = backendScore.adminAdjustments;
      const totalAdjustment = adjustments.reduce((sum, adj) => sum + adj.delta, 0);

      let adjHtml = `
        <div class="transaction-detail" style="margin: 8px 0; padding: 12px; background: rgba(255, 193, 7, 0.1); border-left: 4px solid #ffc107; border-radius: 4px;">
          <label style="color: #856404; font-weight: bold;">⚠️ Admin Adjustments:</label>
          <span class="value" style="color: ${totalAdjustment >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">
            ${totalAdjustment >= 0 ? '+' : ''}$${Math.abs(totalAdjustment).toLocaleString()}
          </span>
        </div>
        <div style="margin-left: 20px; font-size: 12px; color: #666;">
      `;

      adjustments.forEach(adj => {
        const date = new Date(adj.timestamp).toLocaleString();
        adjHtml += `
          <div style="margin: 4px 0; padding: 6px; background: #f8f9fa; border-radius: 3px;">
            <span style="color: ${adj.delta >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">
              ${adj.delta >= 0 ? '+' : ''}$${Math.abs(adj.delta).toLocaleString()}
            </span>
            - ${adj.reason || 'No reason provided'}
            <br><span style="font-size: 10px; color: #999;">${date} by ${adj.gmStation}</span>
          </div>
        `;
      });

      adjHtml += '</div>';
      adjustmentsSection.innerHTML = adjHtml;
      adjustmentsSection.style.display = 'block';
    } else if (adjustmentsSection) {
      adjustmentsSection.style.display = 'none';
    }

    // Show intervention controls in both networked and standalone modes
    const interventionControls = document.getElementById('teamInterventionControls');
    if (interventionControls) {
      // Show controls if we have an active game session (networked or standalone)
      const hasActiveSession = this.sessionModeManager?.isNetworked() || this.sessionModeManager?.isStandalone();
      interventionControls.style.display = hasActiveSession ? 'block' : 'none';
    }

    // Store team ID for intervention handlers
    if (this.app) {
      this.app.currentInterventionTeamId = teamId;
    }
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
    const dataSource = this.dataManager;
    if (!dataSource) return '';

    const tokenValue = dataSource.calculateTokenValue(token);

    // Add duplicate marker
    const isDuplicate = token.status === 'duplicate';
    let cardClass = isUnknown ? 'unknown' : (hasBonus ? 'bonus-applied' : '');
    if (isDuplicate) cardClass += ' duplicate';

    let calculationText = '';
    if (!isUnknown && !token.isUnknown) {
      const baseValue = dataSource.SCORING_CONFIG.BASE_VALUES[token.valueRating] || 0;
      const multiplier = dataSource.SCORING_CONFIG.TYPE_MULTIPLIERS[token.memoryType] || 1;

      if (hasBonus) {
        const groupInfo = dataSource.parseGroupInfo(token.group);
        const finalValue = tokenValue * groupInfo.multiplier;
        calculationText = `
          <strong>${baseValue.toLocaleString()}</strong> ×
          <strong>${multiplier}x</strong> ${token.memoryType} ×
          <strong>${groupInfo.multiplier}x</strong> group =
          <strong>$${finalValue.toLocaleString()}</strong>`;
      } else {
        calculationText = `
          <strong>${baseValue.toLocaleString()}</strong> ×
          <strong>${multiplier}x</strong> ${token.memoryType} =
          <strong>$${tokenValue.toLocaleString()}</strong>`;
      }
    } else {
      calculationText = 'Unknown token - No value';
    }

    // Delete button (both modes)
    const deleteButton = showDelete && token.id ? `
      <button class="btn" data-action="app.deleteTeamTransaction" data-arg="${token.id}"
              style="background: #dc3545; color: white; padding: 4px 8px; font-size: 12px; margin-left: 8px; cursor: pointer;">
        🗑️ Delete
      </button>
    ` : '';

    const groupInfo = dataSource.parseGroupInfo(token.group);
    const displayValue = hasBonus ? tokenValue * groupInfo.multiplier : tokenValue;

    return `
      <div class="token-detail-card ${cardClass}">
        <div class="token-detail-header">
          <span>${token.group}</span>
          <span class="token-detail-value" style="display: flex; align-items: center;">
            <span style="margin-right: 8px;">$${displayValue.toLocaleString()}</span>
            ${deleteButton}
          </span>
        </div>
        <div class="token-detail-grid">
          <div class="token-detail-item">
            <span class="token-detail-label">RFID</span>
            <span class="token-detail-info">${token.rfid}</span>
          </div>
          <div class="token-detail-item">
            <span class="token-detail-label">Memory Type</span>
            <span class="token-detail-info">${token.memoryType}</span>
          </div>
          <div class="token-detail-item">
            <span class="token-detail-label">Base Rating</span>
            <span class="token-detail-info">
              ${isUnknown ? 'N/A' : `⭐${'⭐'.repeat(Math.max(0, token.valueRating - 1))}`}
            </span>
          </div>
          <div class="token-detail-item">
            <span class="token-detail-label">Status</span>
            <span class="token-detail-info">
              ${isDuplicate ? '⚠️ Duplicate' : hasBonus ? '✅ Bonus Applied' : isUnknown ? '❓ Unknown' : '⏳ No Bonus'}
            </span>
          </div>
          <div class="token-calculation">
            ${calculationText}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Show notification for group completion (from backend event)
   * @param {Object} data - Group completion data
   */
  showGroupCompletionNotification(data) {
    // Create a temporary notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: white;
      padding: 15px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
      max-width: 350px;
    `;

    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 24px;">🏆</span>
        <div>
          <div style="font-weight: bold; margin-bottom: 5px;">Group Completed!</div>
          <div style="font-size: 14px;">Team ${data.teamId} - ${data.groupId}</div>
          <div style="font-size: 14px;">Bonus: +$${data.bonus.toLocaleString()} (${data.multiplier}x)</div>
        </div>
      </div>
    `;

    document.body.appendChild(notification);

    // Remove after 5 seconds
    setTimeout(() => {
      notification.style.animation = 'fadeOut 0.3s ease-out forwards';
      setTimeout(() => notification.remove(), 300);
    }, 5000);
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
        valueEl.textContent = `$${tokenScore.toLocaleString()}`;
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
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
   * Unified game activity renderer - used by BOTH admin panel AND historyScreen
   * @param {HTMLElement} container - Target container
   * @param {Object} options - Rendering options
   * @param {boolean} options.showSummary - Show stats bar (default: true)
   * @param {boolean} options.showFilters - Show search/filter controls (default: true)
   * @param {string} options.defaultFilter - 'all' | 'available' | 'claimed'
   */
  renderGameActivity(container, options = {}) {
    if (!container) return;

    const { showSummary = true, showFilters = true } = options;
    const dataSource = this.dataManager;
    if (!dataSource) return;

    // UnifiedDataManager delegates to strategy - both modes support this now
    // Defensive check in case dataManager doesn't have the method
    if (typeof dataSource.getGameActivity !== 'function') {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Game Activity</h3>
          <p>No activity data available</p>
        </div>
      `;
      return;
    }

    const { tokens, stats } = dataSource.getGameActivity();

    let html = '';

    // Summary bar - includes GM-only claims for observability
    if (showSummary) {
      html += `
        <div class="activity-summary">
          <span class="stat">${stats.totalTokens} tokens</span>
          <span class="stat available">${stats.available} available</span>
          <span class="stat claimed">${stats.claimed} claimed</span>
          ${stats.claimedWithoutDiscovery > 0 ? `
            <span class="stat warning" title="Tokens claimed by GM without player discovery">
              ${stats.claimedWithoutDiscovery} GM-only
            </span>
          ` : ''}
        </div>
      `;
    }

    // Filter controls
    if (showFilters) {
      html += `
        <div class="activity-filters">
          <input type="text" id="activitySearch" placeholder="Search tokens..." class="search-input">
          <select id="activityFilter" class="filter-select">
            <option value="all">All Tokens</option>
            <option value="available">Available Only</option>
            <option value="claimed">Claimed Only</option>
          </select>
        </div>
      `;
    }

    // Token cards - sorted by MOST RECENT activity (not just discovery)
    html += '<div class="activity-grid">';

    if (tokens.length === 0) {
      html += '<div class="empty-state">No token activity yet</div>';
    } else {
      // Sort by most recent event per token (last event timestamp)
      const getLatestTimestamp = (token) => {
        if (!token.events || !token.events.length) return 0;
        return new Date(token.events[token.events.length - 1].timestamp);
      };

      tokens
        .sort((a, b) => getLatestTimestamp(b) - getLatestTimestamp(a))
        .forEach(token => {
          html += this._renderActivityTokenCard(token);
        });
    }

    html += '</div>';
    container.innerHTML = html;

    // Attach filter handlers
    this._attachActivityFilterHandlers(container);
  }

  /**
   * Render a single token card for game activity
   * @param {Object} token - Token activity data
   * @returns {string} HTML string
   */
  _renderActivityTokenCard(token) {
    const { tokenId, tokenData, events, status, discoveredByPlayers, potentialValue } = token;
    const memoryType = tokenData?.SF_MemoryType || 'Unknown';
    const rating = tokenData?.SF_ValueRating || 0;

    // Count scan events for collapse logic
    const scanEvents = events.filter(e => e.type === 'scan');
    const hasMultipleScans = scanEvents.length > 0;
    const claimEvent = events.find(e => e.type === 'claim');

    // Generate status bar content based on state
    let statusContent;
    if (status === 'claimed' && claimEvent?.mode === 'blackmarket') {
      // Black Market: Show earned value
      statusContent = `<span class="status-icon">💰</span> SOLD to ${this.escapeHtml(claimEvent?.teamId || 'Unknown')}
        <span class="points">$${(claimEvent?.points || 0).toLocaleString()}</span>`;
    } else if (status === 'claimed' && claimEvent?.mode === 'detective') {
      // Detective: Show what they gave up
      statusContent = `<span class="status-icon">🔍</span> EXPOSED by ${this.escapeHtml(claimEvent?.teamId || 'Unknown')}
        <span class="points potential">Worth: $${(potentialValue || 0).toLocaleString()}</span>`;
    } else {
      // Available: Show potential value
      statusContent = `○ AVAILABLE
        <span class="points potential">Worth: $${(potentialValue || 0).toLocaleString()}</span>`;
    }

    return `
      <div class="token-card ${status}" data-token-id="${tokenId}">
        <!-- Header: Token ID + Type + Rating -->
        <div class="token-card__header">
          <span class="token-id">${this.escapeHtml(tokenId)}</span>
          <span class="token-type type-${memoryType.toLowerCase()}">${memoryType}</span>
        </div>
        <div class="token-card__rating">${'★'.repeat(rating)}${'☆'.repeat(5-rating)}</div>

        <!-- Status Bar: Quick-glance current state with mode-specific styling -->
        <div class="token-card__status status-${status} ${claimEvent?.mode || ''}">
          ${statusContent}
        </div>

        ${tokenData?.summary ? `
          <div class="token-card__summary">
            <button class="summary-toggle" onclick="this.parentElement.classList.toggle('expanded')">Intel</button>
            <div class="summary-content">${this.escapeHtml(tokenData.summary)}</div>
          </div>
        ` : ''}

        <!-- Timeline: Full event history (expandable) -->
        <div class="token-card__timeline ${hasMultipleScans ? 'expandable' : ''}"
             data-expanded="false">

          ${!discoveredByPlayers && status === 'claimed' ? `
            <div class="event warning">
              <span class="icon">⚠️</span>
              <span class="label">Not discovered by players</span>
            </div>
          ` : ''}

          ${events.map((event, idx) => this._renderTimelineEvent(event, idx, events.length)).join('')}

          ${status === 'available' ? `
            <div class="event status-available">
              <span class="status-badge">AWAITING CLAIM</span>
            </div>
          ` : ''}
        </div>

        ${hasMultipleScans ? `
          <button class="timeline-toggle" onclick="this.parentElement.querySelector('.token-card__timeline').dataset.expanded =
            this.parentElement.querySelector('.token-card__timeline').dataset.expanded === 'true' ? 'false' : 'true'">
            <span class="expand-text">Show ${scanEvents.length} more scans</span>
            <span class="collapse-text">Collapse</span>
          </button>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render a single timeline event
   * @param {Object} event - Event data
   * @param {number} index - Event index
   * @param {number} totalEvents - Total events count
   * @returns {string} HTML string
   */
  _renderTimelineEvent(event, index, totalEvents) {
    const time = this._formatTime(event.timestamp);

    switch (event.type) {
      case 'discovery':
        return `
          <div class="event discovery">
            <span class="icon">👁</span>
            <span class="label">Discovered</span>
            <span class="device">${this.escapeHtml(event.deviceId)}</span>
            <span class="time">${time}</span>
          </div>
        `;

      case 'scan':
        // Additional scans - collapsible by default
        return `
          <div class="event scan collapsible">
            <span class="icon">👁</span>
            <span class="label">Scanned</span>
            <span class="device">${this.escapeHtml(event.deviceId)}</span>
            <span class="time">${time}</span>
          </div>
        `;

      case 'claim':
        return `
          <div class="event claim ${event.mode}">
            <span class="icon">${event.mode === 'blackmarket' ? '💰' : '🔍'}</span>
            <span class="label">${event.mode === 'blackmarket' ? 'Black Market' : 'Detective'}</span>
            <span class="team">${this.escapeHtml(event.teamId)}</span>
            <span class="time">${time}</span>
            <span class="points">$${(event.points || 0).toLocaleString()}</span>
            ${event.groupProgress ? `
              <div class="group-progress">
                ${this.escapeHtml(event.groupProgress.name)} (${event.groupProgress.found}/${event.groupProgress.total})
              </div>
            ` : ''}
            ${event.summary ? `
              <div class="exposed-summary">
                <span class="summary-label">Intel:</span>
                <span class="summary-text">${this.escapeHtml(event.summary)}</span>
              </div>
            ` : ''}
          </div>
        `;

      default:
        return '';
    }
  }

  /**
   * Attach filter handlers for game activity
   * @param {HTMLElement} container - Container element
   */
  _attachActivityFilterHandlers(container) {
    const searchInput = container.querySelector('#activitySearch');
    const filterSelect = container.querySelector('#activityFilter');

    if (searchInput) {
      searchInput.addEventListener('input', () => this._filterGameActivity(container));
    }
    if (filterSelect) {
      filterSelect.addEventListener('change', () => this._filterGameActivity(container));
    }
  }

  /**
   * Filter game activity based on search and filter
   * @param {HTMLElement} container - Container element
   */
  _filterGameActivity(container) {
    const searchInput = container.querySelector('#activitySearch');
    const filterSelect = container.querySelector('#activityFilter');
    const cards = container.querySelectorAll('.token-card');

    const searchTerm = searchInput?.value?.toLowerCase() || '';
    const filterValue = filterSelect?.value || 'all';

    cards.forEach(card => {
      const tokenId = card.dataset.tokenId?.toLowerCase() || '';
      const status = card.classList.contains('claimed') ? 'claimed' : 'available';

      const matchesSearch = !searchTerm || tokenId.includes(searchTerm);
      const matchesFilter = filterValue === 'all' || status === filterValue;

      card.style.display = matchesSearch && matchesFilter ? 'block' : 'none';
    });
  }
}

// Export class (not pre-created instance)
// Instance created in main.js with proper dependency injection
export default UIManager;
export { UIManager };
