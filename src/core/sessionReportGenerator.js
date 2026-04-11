/**
 * Session Report Generator
 * Assembles a downloadable markdown report from session data.
 *
 * Data sources (all from sync:full payload + local token DB):
 * - session: id, name, startTime, endTime, teams
 * - scores: [{teamId, score}]
 * - transactions (recentTransactions): enriched with memoryType, valueRating
 * - playerScans: [{tokenId, deviceId, timestamp}]
 * - tokenDatabase: local tokens.json (has character field)
 *
 * @module core/sessionReportGenerator
 */

import { SCORING_CONFIG } from './scoring.js';

export class SessionReportGenerator {
  /**
   * @param {Object} tokenDatabase - Token database keyed by tokenId
   */
  constructor(tokenDatabase) {
    this.tokenDatabase = tokenDatabase || {};
  }

  /**
   * Generate a full markdown session report.
   *
   * @param {Object} data
   * @param {Object} data.session - Session object (id, name, startTime, endTime, teams)
   * @param {Array} data.scores - Team scores [{teamId, score}]
   * @param {Array} data.transactions - Enriched transactions from sync:full
   * @param {Array} data.playerScans - Player scan records
   * @returns {string} Markdown report
   */
  generate({ session, scores, transactions, playerScans }) {
    const duration = this._formatDuration(session.startTime, session.endTime);
    const date = this._formatDate(session.startTime);
    const teamCount = (session.teams || []).length;

    const sections = [
      `# Session Report: ${session.name}`,
      `**${date} | Duration: ${duration} | Teams: ${teamCount}**`,
      '',
      this._buildSessionSummary(session, scores, transactions, playerScans),
      this._buildDetectiveSection(transactions),
      this._buildScoringTimeline(transactions, scores),
      this._buildPlayerActivitySection(playerScans, transactions),
    ];

    return sections.join('\n');
  }

  /**
   * Build the session summary section.
   */
  _buildSessionSummary(session, scores, transactions, playerScans) {
    const accepted = transactions.filter(tx => tx.status === 'accepted');
    const detective = accepted.filter(tx => tx.mode === 'detective');
    const blackmarket = accepted.filter(tx => tx.mode === 'blackmarket');
    const uniqueTokens = new Set(accepted.map(tx => tx.tokenId));

    // Sort scores descending
    const sortedScores = [...scores].sort((a, b) => b.score - a.score);
    const hasAnyAdjustments = sortedScores.some(s => s.adminAdjustments?.length > 0);
    const leaderboard = sortedScores
      .map((s, i) => {
        let line = `${i + 1}. **${s.teamId}** — ${this._formatCurrency(s.score)}`;
        if (hasAnyAdjustments && s.adminAdjustments?.length > 0) {
          const adjTotal = s.adminAdjustments.reduce((sum, adj) => sum + adj.delta, 0);
          const txScore = s.score - adjTotal;
          const sign = adjTotal >= 0 ? '+' : '';
          line += ` (${this._formatCurrency(txScore)} transactions ${sign}${this._formatCurrency(adjTotal)} adjustments)`;
        }
        return line;
      })
      .join('\n');

    const lines = [
      '## Session Summary',
      '',
      `- **Teams:** ${(session.teams || []).join(', ')}`,
      `- **Total Transactions:** ${accepted.length} (${detective.length} detective, ${blackmarket.length} black market)`,
      `- **Player Scans:** ${playerScans.length}`,
      `- **Unique Tokens Processed:** ${uniqueTokens.size}`,
      '',
      '### Final Standings',
      '',
      leaderboard,
      '',
      '---',
      '',
    ];

    return lines.join('\n');
  }

  /**
   * Build the detective evidence log section.
   */
  _buildDetectiveSection(transactions) {
    const detective = transactions
      .filter(tx => tx.status === 'accepted' && tx.mode === 'detective')
      .sort((a, b) => a.tokenId.localeCompare(b.tokenId));

    const lines = [
      '## Detective Evidence Log',
      '',
    ];

    if (detective.length === 0) {
      lines.push('*No detective transactions this session.*');
      lines.push('');
      lines.push('---');
      lines.push('');
      return lines.join('\n');
    }

    lines.push('| Token | Owner | Exposed By | Time | Evidence |');
    lines.push('|-------|-------|------------|------|----------|');

    for (const tx of detective) {
      const owner = this._getTokenOwner(tx.tokenId);
      const time = this._formatTimestamp(tx.timestamp);
      const evidence = (tx.summary || '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(`| ${tx.tokenId} | ${owner} | ${tx.teamId} | ${time} | ${evidence} |`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
    return lines.join('\n');
  }

  /**
   * Build a unified scoring timeline merging black market sales and admin adjustments.
   */
  _buildScoringTimeline(transactions, scores) {
    const sales = transactions
      .filter(tx => tx.status === 'accepted' && tx.mode === 'blackmarket')
      .map(tx => ({
        timestamp: tx.timestamp,
        type: 'Sale',
        detail: this._formatSaleDetail(tx),
        team: tx.teamId,
        amount: tx.points,
        isSale: true
      }));

    const adjustments = (scores || [])
      .filter(s => s.adminAdjustments?.length > 0)
      .flatMap(s => s.adminAdjustments.map(adj => ({
        timestamp: adj.timestamp,
        type: 'Adjustment',
        detail: this._formatAdjustmentDetail(adj),
        team: s.teamId,
        amount: adj.delta,
        isSale: false
      })));

    const timeline = [...sales, ...adjustments]
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const lines = [
      '## Scoring Timeline',
      '',
    ];

    if (timeline.length === 0) {
      lines.push('*No scoring events this session.*');
      lines.push('');
      lines.push('---');
      lines.push('');
      return lines.join('\n');
    }

    lines.push('| Time | Type | Detail | Team | Amount |');
    lines.push('|------|------|--------|------|--------|');

    for (const event of timeline) {
      const time = this._formatTimestamp(event.timestamp);
      const amount = this._formatSignedCurrency(event.amount);
      lines.push(`| ${time} | ${event.type} | ${event.detail} | ${event.team} | ${amount} |`);
    }

    // Final Totals with breakdown
    const salesTotals = {};
    const adjustmentTotals = {};
    for (const event of timeline) {
      if (event.isSale) {
        salesTotals[event.team] = (salesTotals[event.team] || 0) + event.amount;
      } else {
        adjustmentTotals[event.team] = (adjustmentTotals[event.team] || 0) + event.amount;
      }
    }

    const allTeams = new Set([...Object.keys(salesTotals), ...Object.keys(adjustmentTotals)]);
    const teamFinals = [...allTeams].map(team => {
      const salesTotal = salesTotals[team] || 0;
      const adjTotal = adjustmentTotals[team] || 0;
      return { team, salesTotal, adjTotal, final: salesTotal + adjTotal };
    }).sort((a, b) => b.final - a.final);

    lines.push('');
    lines.push('### Final Totals');
    lines.push('');
    for (const t of teamFinals) {
      const adjSign = t.adjTotal >= 0 ? '+' : '-';
      const adjAbs = Math.abs(t.adjTotal);
      const finalDisplay = t.final >= 0
        ? this._formatCurrency(t.final)
        : `-${this._formatCurrency(Math.abs(t.final))}`;
      lines.push(`- **${t.team}:** ${finalDisplay} (${this._formatCurrency(t.salesTotal)} sales ${adjSign} ${this._formatCurrency(adjAbs)} adjustments)`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
    return lines.join('\n');
  }

  /**
   * Format sale detail with parenthetical scoring breakdown.
   */
  _formatSaleDetail(tx) {
    const owner = this._getTokenOwner(tx.tokenId);
    const rating = tx.valueRating || 0;
    const type = tx.memoryType || 'UNKNOWN';
    const baseValue = SCORING_CONFIG.BASE_VALUES[rating] || 0;
    const multiplier = SCORING_CONFIG.TYPE_MULTIPLIERS[type]
      ?? SCORING_CONFIG.TYPE_MULTIPLIERS.UNKNOWN ?? 0;
    return `${tx.tokenId}/${owner} (${rating}★ ${type}, ${this._formatCurrency(baseValue)} × ${multiplier}x)`
      .replace(/\|/g, '\\|');
  }

  /**
   * Format adjustment detail with reason and GM station.
   */
  _formatAdjustmentDetail(adj) {
    const reason = (adj.reason || '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const station = adj.gmStation;
    return station ? `${reason} (${station})` : reason;
  }

  /**
   * Build the player activity section.
   */
  _buildPlayerActivitySection(playerScans, transactions) {
    const lines = [
      '## Player Activity',
      '',
    ];

    if (playerScans.length === 0) {
      lines.push('*No player scans this session.*');
      lines.push('');
      return lines.join('\n');
    }

    // Scan log table
    const sorted = [...playerScans].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );

    lines.push('| Token | Owner | Device | Time |');
    lines.push('|-------|-------|--------|------|');

    for (const scan of sorted) {
      const owner = this._getTokenOwner(scan.tokenId);
      const time = this._formatTimestamp(scan.timestamp);
      lines.push(`| ${scan.tokenId} | ${owner} | ${scan.deviceId} | ${time} |`);
    }

    // Stats
    lines.push('');
    lines.push('### Activity Stats');
    lines.push('');

    // Most active devices
    const deviceCounts = {};
    for (const scan of playerScans) {
      deviceCounts[scan.deviceId] = (deviceCounts[scan.deviceId] || 0) + 1;
    }
    const sortedDevices = Object.entries(deviceCounts).sort((a, b) => b[1] - a[1]);
    lines.push('**Most Active Devices:**');
    for (const [deviceId, count] of sortedDevices) {
      lines.push(`- ${deviceId}: ${count} scan${count !== 1 ? 's' : ''}`);
    }

    // Most scanned tokens
    lines.push('');
    const tokenCounts = {};
    for (const scan of playerScans) {
      tokenCounts[scan.tokenId] = (tokenCounts[scan.tokenId] || 0) + 1;
    }
    const sortedTokens = Object.entries(tokenCounts).sort((a, b) => b[1] - a[1]);
    const topTokens = sortedTokens.filter(([, count]) => count > 1);
    if (topTokens.length > 0) {
      lines.push('**Most Scanned Tokens:**');
      for (const [tokenId, count] of topTokens) {
        const owner = this._getTokenOwner(tokenId);
        lines.push(`- ${tokenId} (${owner}): ${count} scans`);
      }
      lines.push('');
    }

    // Tokens scanned but never turned in
    const processedTokenIds = new Set(
      transactions
        .filter(tx => tx.status === 'accepted')
        .map(tx => tx.tokenId)
    );
    const scannedTokenIds = new Set(playerScans.map(ps => ps.tokenId));
    const neverTurnedIn = [...scannedTokenIds].filter(id => !processedTokenIds.has(id));

    if (neverTurnedIn.length > 0) {
      lines.push('**Tokens Scanned but Never Turned In:**');
      for (const tokenId of neverTurnedIn.sort()) {
        const owner = this._getTokenOwner(tokenId);
        lines.push(`- ${tokenId} (${owner})`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }

  // --- Utility methods ---

  /**
   * Look up the character owner name for a token.
   * @param {string} tokenId
   * @returns {string} Character name or 'Unknown'
   */
  _getTokenOwner(tokenId) {
    const token = this.tokenDatabase[tokenId];
    return token?.owner || 'Unknown';
  }

  /**
   * Format a number as currency with dollar sign and commas.
   * @param {number} amount
   * @returns {string}
   */
  _formatCurrency(amount) {
    return '$' + (amount ?? 0).toLocaleString('en-US');
  }

  /**
   * Format a number as signed currency (+$50,000 or -$25,000).
   * @param {number} amount
   * @returns {string}
   */
  _formatSignedCurrency(amount) {
    const val = amount ?? 0;
    if (val >= 0) return `+${this._formatCurrency(val)}`;
    return `-${this._formatCurrency(Math.abs(val))}`;
  }

  /**
   * Format an ISO timestamp to local readable time (HH:MM).
   * @param {string} isoTimestamp
   * @returns {string}
   */
  _formatTimestamp(isoTimestamp) {
    if (!isoTimestamp) return '—';
    const date = new Date(isoTimestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Format an ISO timestamp to a readable date string.
   * @param {string} isoTimestamp
   * @returns {string}
   */
  _formatDate(isoTimestamp) {
    if (!isoTimestamp) return 'Unknown Date';
    const date = new Date(isoTimestamp);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Format duration between two ISO timestamps as "Xh Ym".
   * @param {string} startTime
   * @param {string} endTime
   * @returns {string}
   */
  _formatDuration(startTime, endTime) {
    if (!startTime || !endTime) return 'Unknown';
    const ms = new Date(endTime) - new Date(startTime);
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  }
}
