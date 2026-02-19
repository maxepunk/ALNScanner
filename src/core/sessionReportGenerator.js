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
      this._buildBlackMarketSection(transactions),
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
    const leaderboard = sortedScores
      .map((s, i) => `${i + 1}. **${s.teamId}** — ${this._formatCurrency(s.score)}`)
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
   * Build the black market transactions section.
   */
  _buildBlackMarketSection(transactions) {
    const blackmarket = transactions
      .filter(tx => tx.status === 'accepted' && tx.mode === 'blackmarket')
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const lines = [
      '## Black Market Transactions',
      '',
    ];

    if (blackmarket.length === 0) {
      lines.push('*No black market transactions this session.*');
      lines.push('');
      lines.push('---');
      lines.push('');
      return lines.join('\n');
    }

    lines.push('| Token | Owner | Buried By | Points | Rating | Type | Breakdown |');
    lines.push('|-------|-------|-----------|--------|--------|------|-----------|');

    for (const tx of blackmarket) {
      const owner = this._getTokenOwner(tx.tokenId);
      const rating = tx.valueRating || 0;
      const type = tx.memoryType || 'UNKNOWN';
      const baseValue = SCORING_CONFIG.BASE_VALUES[rating] || 0;
      const multiplier = SCORING_CONFIG.TYPE_MULTIPLIERS[type]
        ?? SCORING_CONFIG.TYPE_MULTIPLIERS.UNKNOWN ?? 0;
      const breakdown = `${this._formatCurrency(baseValue)} × ${multiplier}x`;
      lines.push(
        `| ${tx.tokenId} | ${owner} | ${tx.teamId} | ${this._formatCurrency(tx.points)} | ${rating}★ | ${type} | ${breakdown} |`
      );
    }

    // Per-team subtotals
    const teamTotals = {};
    for (const tx of blackmarket) {
      teamTotals[tx.teamId] = (teamTotals[tx.teamId] || 0) + tx.points;
    }

    lines.push('');
    lines.push('### Team Subtotals');
    lines.push('');
    const sortedTeams = Object.entries(teamTotals).sort((a, b) => b[1] - a[1]);
    for (const [teamId, total] of sortedTeams) {
      lines.push(`- **${teamId}:** ${this._formatCurrency(total)}`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
    return lines.join('\n');
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
