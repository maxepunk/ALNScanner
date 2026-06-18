/**
 * GameOpsRenderer - Game Operations Domain Renderer
 *
 * Owns: scoreboard, team details (with group progress), token cards,
 * game activity (discovery/claim timeline), group completion notification.
 *
 * These methods were extracted from UIManager as part of the Phase-2
 * four-domain structural split (decision C1). UIManager delegates to this
 * renderer; all existing UIManager callers continue to work unchanged.
 *
 * @module ui/renderers/GameOpsRenderer
 */

import { escapeHtml } from '../../utils/escapeHtml.js';
import { formatCurrency } from '../../utils/formatCurrency.js';

export class GameOpsRenderer {
  /**
   * @param {Object} deps - Injected dependencies
   * @param {Object} deps.dataManager - UnifiedDataManager instance
   * @param {Object} deps.sessionModeManager - SessionModeManager instance
   * @param {Object} deps.app - App instance (for callbacks)
   */
  constructor({ dataManager, sessionModeManager, app } = {}) {
    this.dataManager = dataManager;
    this.sessionModeManager = sessionModeManager;
    this.app = app;
  }

  /**
   * Render scoreboard into a container.
   * @param {HTMLElement|null} container - Defaults to #scoreboardContainer
   */
  renderScoreboard(container = null) {
    const dataSource = this.dataManager;
    if (!dataSource || !this.app) return;

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

    const scoreSource = teamScores[0]?.isFromBackend
      ? '<div class="score-source" style="text-align: center; margin: 10px 0; padding: 10px; background: rgba(103,126,234,0.1); border-radius: 8px; font-size: 14px;">🔗 Live from Orchestrator</div>'
      : '<div class="score-source" style="text-align: center; margin: 10px 0; padding: 10px; background: rgba(255,152,0,0.1); border-radius: 8px; font-size: 14px;">📱 Local Calculation</div>';

    targetContainer.innerHTML = scoreSource + teamScores.map((team, index) => {
      const rank = index + 1;
      const rankClass = rank <= 3 ? `rank-${rank}` : '';
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

      // F-GMS-04: teamId is unvalidated free text — escape in BOTH the text
      // node and the data-arg attribute (escapeHtml escapes quotes too)
      const safeTeamId = escapeHtml(team.teamId);
      return `
        <div class="scoreboard-entry ${rankClass}" data-action="app.showTeamDetails" data-arg="${safeTeamId}" style="cursor: pointer;">
          <div class="scoreboard-rank">${medal}</div>
          <div class="scoreboard-team">
            Team ${safeTeamId}
            <span class="scoreboard-tokens">(${team.tokenCount} tokens)</span>
          </div>
          <div class="scoreboard-score">${formatCurrency(team.score)}</div>
        </div>
      `;
    }).join('');
  }

  /**
   * Show notification for group completion (from backend event).
   * @param {Object} data - Group completion data
   */
  showGroupCompletionNotification(data) {
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
          <div style="font-size: 14px;">Team ${escapeHtml(data.teamId)} - ${escapeHtml(data.groupId)}</div>
          <div style="font-size: 14px;">Bonus: +${formatCurrency(data.bonus)} (${data.multiplier}x)</div>
        </div>
      </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'fadeOut 0.3s ease-out forwards';
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  }

  /**
   * Render team details with enhanced grouping.
   * @param {string} teamId - Team ID
   * @param {Array} transactions - Team transactions
   */
  renderTeamDetails(teamId, transactions) {
    const dataSource = this.dataManager;
    if (!dataSource) return;

    const enhancedData = dataSource.getEnhancedTeamTransactions(teamId);
    const scoreData = dataSource.calculateTeamScoreWithBonuses(teamId);
    const isNetworked = this.sessionModeManager?.isNetworked();

    const titleEl = document.getElementById('teamDetailsTitle');
    const summaryEl = document.getElementById('teamDetailsSummary');

    if (titleEl) titleEl.textContent = `Team ${teamId}`;
    if (summaryEl) {
      summaryEl.textContent = `${transactions.length} token${transactions.length !== 1 ? 's' : ''} collected`;
    }

    let html = '';

    if (enhancedData.hasCompletedGroups) {
      html += '<div class="section-divider">✅ Completed Groups</div>';
      enhancedData.completedGroups.forEach(group => {
        html += `
          <div class="group-section">
            <div class="group-header completed">
              <div class="group-title">
                <span class="completion-badge">🏆</span>
                <span class="group-name">${escapeHtml(group.displayName)}</span>
                <span class="completion-text">COMPLETE</span>
              </div>
              <div class="bonus-amount">
                +${formatCurrency(group.bonusValue)} bonus (${group.multiplier}x)
              </div>
            </div>`;
        const hasActiveSession = this.sessionModeManager?.isNetworked() || this.sessionModeManager?.isStandalone();
        group.tokens.forEach(token => {
          html += this.renderTokenCard(token, true, false, hasActiveSession);
        });
        html += '</div>';
      });
    }

    if (enhancedData.hasIncompleteGroups) {
      html += '<div class="section-divider">🔶 In Progress Groups</div>';
      enhancedData.incompleteGroups.forEach(group => {
        html += `
          <div class="group-section">
            <div class="group-header in-progress">
              <div class="group-title">
                <span class="progress-badge">⏳</span>
                <span class="group-name">${escapeHtml(group.displayName)}</span>
                <span class="progress-text">${group.progress}</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${group.percentage}%"></div>
              </div>
            </div>`;
        const hasActiveSession = this.sessionModeManager?.isNetworked() || this.sessionModeManager?.isStandalone();
        group.tokens.forEach(token => {
          html += this.renderTokenCard(token, false, false, hasActiveSession);
        });
        html += '</div>';
      });
    }

    if (enhancedData.hasUngroupedTokens) {
      html += '<div class="section-divider">📦 Individual Tokens</div>';
      const hasActiveSession = this.sessionModeManager?.isNetworked() || this.sessionModeManager?.isStandalone();
      enhancedData.ungroupedTokens.forEach(token => {
        html += this.renderTokenCard(token, false, false, hasActiveSession);
      });
    }

    if (enhancedData.hasUnknownTokens) {
      html += '<div class="section-divider">❓ Unknown Tokens</div>';
      enhancedData.unknownTokens.forEach(token => {
        html += this.renderTokenCard(token, false, true, isNetworked);
      });
    }

    if (html === '') {
      html = `
        <div class="empty-state">
          <h3>No Tokens</h3>
          <p>This team hasn't scanned any tokens yet</p>
        </div>
      `;
    }

    const container = document.getElementById('teamDetailsContainer');
    if (container) container.innerHTML = html;

    const backendScore = isNetworked && this.dataManager?.backendScores?.get(teamId);

    let displayBaseScore = scoreData.baseScore;
    let displayBonusScore = scoreData.bonusScore;
    let displayTotalScore = scoreData.totalScore;

    if (isNetworked && backendScore) {
      displayBaseScore = backendScore.baseScore;
      displayBonusScore = backendScore.bonusPoints;
      displayTotalScore = backendScore.currentScore;
    }

    const baseScoreEl = document.getElementById('teamBaseScore');
    const bonusScoreEl = document.getElementById('teamBonusScore');
    const totalScoreEl = document.getElementById('teamTotalScore');

    if (baseScoreEl) baseScoreEl.textContent = formatCurrency(displayBaseScore);
    if (bonusScoreEl) bonusScoreEl.textContent = formatCurrency(displayBonusScore);
    if (totalScoreEl) totalScoreEl.textContent = formatCurrency(displayTotalScore);

    const adjustmentsSection = document.getElementById('teamAdminAdjustmentsSection');
    if (adjustmentsSection && isNetworked && backendScore?.adminAdjustments?.length > 0) {
      const adjustments = backendScore.adminAdjustments;
      const totalAdjustment = adjustments.reduce((sum, adj) => sum + adj.delta, 0);

      let adjHtml = `
        <div class="transaction-detail" style="margin: 8px 0; padding: 12px; background: rgba(255, 193, 7, 0.1); border-left: 4px solid #ffc107; border-radius: 4px;">
          <label style="color: #856404; font-weight: bold;">⚠️ Admin Adjustments:</label>
          <span class="value" style="color: ${totalAdjustment >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">
            ${totalAdjustment >= 0 ? '+' : ''}${formatCurrency(Math.abs(totalAdjustment))}
          </span>
        </div>
        <div style="margin-left: 20px; font-size: 12px; color: #666;">
      `;

      adjustments.forEach(adj => {
        const date = new Date(adj.timestamp).toLocaleString();
        adjHtml += `
          <div style="margin: 4px 0; padding: 6px; background: #f8f9fa; border-radius: 3px;">
            <span style="color: ${adj.delta >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">
              ${adj.delta >= 0 ? '+' : ''}${formatCurrency(Math.abs(adj.delta))}
            </span>
            - ${escapeHtml(adj.reason || 'No reason provided')}
            <br><span style="font-size: 10px; color: #999;">${date} by ${escapeHtml(adj.gmStation || '')}</span>
          </div>
        `;
      });

      adjHtml += '</div>';
      adjustmentsSection.innerHTML = adjHtml;
      adjustmentsSection.style.display = 'block';
    } else if (adjustmentsSection) {
      adjustmentsSection.style.display = 'none';
    }

    const interventionControls = document.getElementById('teamInterventionControls');
    if (interventionControls) {
      const hasActiveSession = this.sessionModeManager?.isNetworked() || this.sessionModeManager?.isStandalone();
      interventionControls.style.display = hasActiveSession ? 'block' : 'none';
    }

    if (this.app) {
      this.app.currentInterventionTeamId = teamId;
    }
  }

  /**
   * Render individual token card.
   * @param {Object} token - Token data (transaction object)
   * @param {boolean} hasBonus - Whether token has group bonus
   * @param {boolean} isUnknown - Whether token is unknown
   * @param {boolean} showDelete - Show delete button
   * @returns {string} HTML string
   */
  renderTokenCard(token, hasBonus = false, isUnknown = false, showDelete = false) {
    const dataSource = this.dataManager;
    if (!dataSource) return '';

    const tokenValue = dataSource.calculateTokenValue(token);
    const isDuplicate = token.status === 'duplicate';
    let cardClass = isUnknown ? 'unknown' : (hasBonus ? 'bonus-applied' : '');
    if (isDuplicate) cardClass += ' duplicate';

    // F-GMS-04: group/rfid/memoryType are NFC-controlled — escape every site
    const safeMemoryType = escapeHtml(token.memoryType);

    let calculationText = '';
    if (!isUnknown && !token.isUnknown) {
      const baseValue = dataSource.SCORING_CONFIG.BASE_VALUES[token.valueRating] || 0;
      const multiplier = dataSource.SCORING_CONFIG.TYPE_MULTIPLIERS[token.memoryType] ?? 0;

      if (hasBonus) {
        const groupInfo = dataSource.parseGroupInfo(token.group);
        const finalValue = tokenValue * groupInfo.multiplier;
        calculationText = `
          <strong>${baseValue.toLocaleString()}</strong> ×
          <strong>${multiplier}x</strong> ${safeMemoryType} ×
          <strong>${groupInfo.multiplier}x</strong> group =
          <strong>${formatCurrency(finalValue)}</strong>`;
      } else {
        calculationText = `
          <strong>${baseValue.toLocaleString()}</strong> ×
          <strong>${multiplier}x</strong> ${safeMemoryType} =
          <strong>${formatCurrency(tokenValue)}</strong>`;
      }
    } else {
      calculationText = 'Unknown token - No value';
    }

    const deleteButton = showDelete && token.id ? `
      <button class="btn" data-action="app.deleteTeamTransaction" data-arg="${escapeHtml(token.id)}"
              style="background: #dc3545; color: white; padding: 4px 8px; font-size: 12px; margin-left: 8px; cursor: pointer;">
        🗑️ Delete
      </button>
    ` : '';

    const groupInfo = dataSource.parseGroupInfo(token.group);
    const displayValue = hasBonus ? tokenValue * groupInfo.multiplier : tokenValue;

    return `
      <div class="token-detail-card ${cardClass}">
        <div class="token-detail-header">
          <span>${escapeHtml(token.group)}</span>
          <span class="token-detail-value" style="display: flex; align-items: center;">
            <span style="margin-right: 8px;">${formatCurrency(displayValue)}</span>
            ${deleteButton}
          </span>
        </div>
        <div class="token-detail-grid">
          <div class="token-detail-item">
            <span class="token-detail-label">RFID</span>
            <span class="token-detail-info">${escapeHtml(token.rfid)}</span>
          </div>
          <div class="token-detail-item">
            <span class="token-detail-label">Memory Type</span>
            <span class="token-detail-info">${safeMemoryType}</span>
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
   * Unified game activity renderer — used by BOTH admin panel AND historyScreen.
   * @param {HTMLElement} container - Target container
   * @param {Object} options - Rendering options
   * @param {boolean} options.showSummary - Show stats bar (default: true)
   * @param {boolean} options.showFilters - Show search/filter controls (default: true)
   */
  renderGameActivity(container, options = {}) {
    if (!container) return;

    const { showSummary = true, showFilters = true } = options;
    const dataSource = this.dataManager;
    if (!dataSource) return;

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

    html += '<div class="activity-grid">';

    if (tokens.length === 0) {
      html += '<div class="empty-state">No token activity yet</div>';
    } else {
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

    this._attachActivityFilterHandlers(container);
  }

  /**
   * Render a single token card for game activity.
   * @param {Object} token - Token activity data
   * @returns {string} HTML string
   */
  _renderActivityTokenCard(token) {
    const { tokenId, tokenData, events, status, discoveredByPlayers, potentialValue } = token;
    const memoryType = tokenData?.SF_MemoryType || 'Unknown';
    const rating = tokenData?.SF_ValueRating || 0;

    const scanEvents = events.filter(e => e.type === 'scan');
    const hasMultipleScans = scanEvents.length > 0;
    const claimEvent = events.find(e => e.type === 'claim');

    let statusContent;
    if (status === 'claimed' && claimEvent?.mode === 'blackmarket') {
      statusContent = `<span class="status-icon">💰</span> SOLD to ${escapeHtml(claimEvent?.teamId || 'Unknown')}
        <span class="points">${formatCurrency(claimEvent?.points)}</span>`;
    } else if (status === 'claimed' && claimEvent?.mode === 'detective') {
      statusContent = `<span class="status-icon">🔍</span> EXPOSED by ${escapeHtml(claimEvent?.teamId || 'Unknown')}
        <span class="points potential">Worth: ${formatCurrency(potentialValue)}</span>`;
    } else {
      statusContent = `○ AVAILABLE
        <span class="points potential">Worth: ${formatCurrency(potentialValue)}</span>`;
    }

    return `
      <div class="token-card ${status}" data-token-id="${escapeHtml(tokenId)}">
        <div class="token-card__header">
          <span class="token-id">${escapeHtml(tokenId)}</span>
          <span class="token-type type-${escapeHtml(memoryType.toLowerCase())}">${escapeHtml(memoryType)}</span>
        </div>
        <div class="token-card__rating">${'★'.repeat(rating)}${'☆'.repeat(5-rating)}</div>

        <div class="token-card__status status-${status} ${claimEvent?.mode || ''}">
          ${statusContent}
        </div>

        ${tokenData?.summary ? `
          <div class="token-card__summary">
            <button class="summary-toggle" onclick="this.parentElement.classList.toggle('expanded')">Intel</button>
            <div class="summary-content">${escapeHtml(tokenData.summary)}</div>
          </div>
        ` : ''}

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
   * Render a single timeline event.
   * @param {Object} event - Event data
   * @param {number} index - Event index
   * @param {number} totalEvents - Total events count
   * @returns {string} HTML string
   */
  _renderTimelineEvent(event, _index, _totalEvents) {
    const time = this._formatTime(event.timestamp);

    switch (event.type) {
      case 'discovery':
        return `
          <div class="event discovery">
            <span class="icon">👁</span>
            <span class="label">Discovered</span>
            <span class="device">${escapeHtml(event.deviceId)}</span>
            <span class="time">${time}</span>
          </div>
        `;

      case 'scan':
        return `
          <div class="event scan collapsible">
            <span class="icon">👁</span>
            <span class="label">Scanned</span>
            <span class="device">${escapeHtml(event.deviceId)}</span>
            <span class="time">${time}</span>
          </div>
        `;

      case 'claim':
        return `
          <div class="event claim ${event.mode}">
            <span class="icon">${event.mode === 'blackmarket' ? '💰' : '🔍'}</span>
            <span class="label">${event.mode === 'blackmarket' ? 'Black Market' : 'Detective'}</span>
            <span class="team">${escapeHtml(event.teamId)}</span>
            <span class="time">${time}</span>
            <span class="points">${formatCurrency(event.points)}</span>
            ${event.groupProgress ? `
              <div class="group-progress">
                ${escapeHtml(event.groupProgress.name)} (${event.groupProgress.found}/${event.groupProgress.total})
              </div>
            ` : ''}
            ${event.summary ? `
              <div class="exposed-summary">
                <span class="summary-label">Intel:</span>
                <span class="summary-text">${escapeHtml(event.summary)}</span>
              </div>
            ` : ''}
          </div>
        `;

      default:
        return '';
    }
  }

  /**
   * Attach filter handlers for game activity.
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
   * Filter game activity based on search and filter controls.
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

  /**
   * Format timestamp to time string (HH:MM).
   * @param {string} timestamp - ISO timestamp
   * @returns {string} Formatted time
   */
  _formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
