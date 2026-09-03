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
 * Wording vs structure (A3 slice 7, program §13.4): the section headings,
 * table header rows, `---` separators, the H1/metadata line FORMATS and
 * the ★ Detail-cell format are ENGINE-FIXED — they are the external
 * pipeline's parse anchors (docs/session-report-contract.md, Change Rules
 * #1–#5) and never move to pack data. Everything else the reader sees is
 * pack-declared WORDING, resolved through strings.report.* (baked
 * defaults = ALN's exact voice, so the golden masters pin the shipped
 * tier byte-for-byte) — plus the per-mode `verbNoun` for the Scoring
 * Timeline Type cell. Every pack-declared leaf passes through _rt()
 * (escape `|`, newlines to spaces, strip control/bidi) so no wording can
 * split a table row or forge the metadata line.
 *
 * @module core/sessionReportGenerator
 */

import { SCORING_CONFIG } from './scoring.js';
import { isScoringMode, isEvidenceMode, resolveMode } from './modeSemantics.js';
import { getString, getPackString } from './strings.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import Debug from '../utils/debug.js';

// The engine-generic Type-cell noun for a scoring-mode claim whose mode
// declares no verbNoun (benign-wording class; ALN's 'Sale' arrives from
// the declared/baked mode table, never from here).
const GENERIC_VERB_NOUN = 'Claim';

// C0 controls + DEL + bidi controls — same class the mode resolvers
// strip. Kept local: modeSemantics does not export its copy, and the two
// uses guard different sinks (DOM there, markdown here).
const CONTROL_AND_BIDI = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

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
    const detective = accepted.filter(tx => isEvidenceMode(tx.mode));
    const blackmarket = accepted.filter(tx => isScoringMode(tx.mode));
    const uniqueTokens = new Set(accepted.map(tx => tx.tokenId));

    // Claims in a mode that is neither evidence- nor scoring-class would
    // otherwise vanish from this count line (toy 'appraise' is the shipped
    // case). The residue term renders ONLY when non-zero, so ALN's
    // two-class bytes never change; the warn makes the residue loud.
    const unclassified = Math.max(0, accepted.length - detective.length - blackmarket.length);
    let classCounts = `${detective.length} ${this._rt('report.classLabels.evidence')}, `
      + `${blackmarket.length} ${this._rt('report.classLabels.scoring')}`;
    if (unclassified > 0) {
      classCounts += `, ${unclassified} ${this._rt('report.classLabels.other')}`;
      Debug.log(`report: ${unclassified} accepted claim(s) fall in neither the evidence nor the scoring class — rendered under the '${this._rt('report.classLabels.other')}' term`, true);
    }

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
          line += ` (${this._formatCurrency(txScore)} ${this._rt('report.breakdown.transactions')} ${sign}${this._formatCurrency(adjTotal)} ${this._rt('report.breakdown.adjustments')})`;
        }
        return line;
      })
      .join('\n');

    const lines = [
      '## Session Summary',
      '',
      `- **${this._rt('report.labels.teams')}:** ${(session.teams || []).join(', ')}`,
      `- **${this._rt('report.labels.totalTransactions')}:** ${accepted.length} (${classCounts})`,
      `- **${this._rt('report.labels.playerScans')}:** ${playerScans.length}`,
      `- **${this._rt('report.labels.uniqueTokens')}:** ${uniqueTokens.size}`,
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
      .filter(tx => tx.status === 'accepted' && isEvidenceMode(tx.mode))
      .sort((a, b) => a.tokenId.localeCompare(b.tokenId));

    const lines = [
      '## Detective Evidence Log',
      '',
    ];

    if (detective.length === 0) {
      lines.push(`*${this._rt('report.empty.evidence')}*`);
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
      const evidence = this._cell(tx.summary || this._rt('report.fallback.dash'));
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
      .filter(tx => tx.status === 'accepted' && isScoringMode(tx.mode))
      .map(tx => ({
        timestamp: tx.timestamp,
        type: resolveMode(tx.mode)?.verbNoun ?? GENERIC_VERB_NOUN,
        detail: this._formatSaleDetail(tx),
        team: tx.teamId,
        amount: tx.points,
        isSale: true
      }));

    const adjustments = (scores || [])
      .filter(s => s.adminAdjustments?.length > 0)
      .flatMap(s => s.adminAdjustments.map(adj => ({
        timestamp: adj.timestamp,
        type: this._rt('report.adjustmentLabel'),
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
      lines.push(`*${this._rt('report.empty.scoring')}*`);
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
      lines.push(`| ${time} | ${this._cell(event.type)} | ${event.detail} | ${event.team} | ${amount} |`);
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
      lines.push(`- **${t.team}:** ${finalDisplay} (${this._formatCurrency(t.salesTotal)} ${this._rt('report.breakdown.sales')} ${adjSign} ${this._formatCurrency(adjAbs)} ${this._rt('report.breakdown.adjustments')})`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
    return lines.join('\n');
  }

  /**
   * Format sale detail with parenthetical scoring breakdown. The format
   * itself — `{tokenId}/{owner} ({rating}★ {type}, {base} × {mult}x)` —
   * is a CONTRACTED shape (the ★ is a contracted delimiter,
   * session-report-contract.md:64); the money affixes ride the pack's
   * scoring.display.format like every other scanner surface (slice 3b's
   * recorded slice-7 deferral, completed here).
   */
  _formatSaleDetail(tx) {
    const owner = this._getTokenOwner(tx.tokenId);
    const rating = tx.valueRating || 0;
    const type = tx.memoryType || 'UNKNOWN';
    const baseValue = SCORING_CONFIG.BASE_VALUES[rating] || 0;
    const multiplier = SCORING_CONFIG.TYPE_MULTIPLIERS[type]
      ?? SCORING_CONFIG.TYPE_MULTIPLIERS.UNKNOWN ?? 0;
    return this._cell(`${tx.tokenId}/${owner} (${rating}★ ${type}, ${this._formatCurrency(baseValue)} × ${multiplier}x)`);
  }

  /**
   * Format adjustment detail with reason and GM station.
   */
  _formatAdjustmentDetail(adj) {
    const reason = this._cell(adj.reason || this._rt('report.fallback.dash'));
    const station = adj.gmStation;
    return station ? `${reason} (${this._cell(station)})` : reason;
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
      lines.push(`*${this._rt('report.empty.playerScans')}*`);
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
    lines.push(`**${this._rt('report.labels.mostActiveDevices')}:**`);
    for (const [deviceId, count] of sortedDevices) {
      const noun = count !== 1 ? this._rt('report.scanNounPlural') : this._rt('report.scanNoun');
      lines.push(`- ${deviceId}: ${count} ${noun}`);
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
      lines.push(`**${this._rt('report.labels.mostScannedTokens')}:**`);
      for (const [tokenId, count] of topTokens) {
        const owner = this._getTokenOwner(tokenId);
        lines.push(`- ${tokenId} (${owner}): ${count} ${this._rt('report.scanNounPlural')}`);
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
      lines.push(`**${this._rt('report.labels.neverTurnedIn')}:**`);
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
   * Resolve one pack-declared report wording leaf, sanitized for every
   * report sink: control/bidi stripped, `|` escaped, newlines to spaces.
   * ONE boundary instead of per-site judgement calls — byte-neutral for
   * the baked/ALN wording, so the golden masters prove the identity.
   * @param {string} path - dotted strings path under report.*
   * @returns {string}
   */
  _rt(path) {
    return this._cell(getString(path) ?? '');
  }

  /**
   * Sanitize free text bound for a markdown sink (table cells, the
   * metadata line's interpolations): no wording — pack-declared or
   * data-carried — may split a row, add a column, or smuggle controls.
   * @param {string} text
   * @returns {string}
   */
  _cell(text) {
    return String(text)
      .replace(CONTROL_AND_BIDI, ' ')
      .replace(/\|/g, '\\|');
  }

  /**
   * Look up the character owner name for a token. The unattributed
   * fallback resolves in layers: a declared report.fallback.unknownOwner
   * wins; else the pack's scoreboard.unknownOwner (one concept, one
   * declaration — the toy's 'Unattributed' reaches its report without a
   * second key); else the baked 'Unknown'. The scoreboard key is read
   * PACK-tier only — it has no baked default and must never leak null.
   * @param {string} tokenId
   * @returns {string}
   */
  _getTokenOwner(tokenId) {
    const token = this.tokenDatabase[tokenId];
    if (token?.owner) return this._cell(token.owner);
    const declared = getPackString('report.fallback.unknownOwner')
      ?? getPackString('scoreboard.unknownOwner');
    return this._cell(declared ?? getString('report.fallback.unknownOwner') ?? '');
  }

  /**
   * Format a number under the ACTIVE pack's money spec (slice 3b) — the
   * baked ALN spec renders byte-identical to the legacy '$' + en-US
   * grouping, including the $-25,000 negative quirk the golden pins.
   * @param {number} amount
   * @returns {string}
   */
  _formatCurrency(amount) {
    return formatCurrency(amount ?? 0);
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
    if (!isoTimestamp) return this._rt('report.fallback.dash');
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
    if (!isoTimestamp) return this._rt('report.fallback.unknownDate');
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
    if (!startTime || !endTime) return this._rt('report.fallback.unknownDuration');
    const ms = new Date(endTime) - new Date(startTime);
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}${this._rt('report.duration.hours')} ${minutes}${this._rt('report.duration.minutes')}`;
  }
}
