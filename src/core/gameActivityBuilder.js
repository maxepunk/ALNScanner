import { calculateTokenValue } from './scoring.js';

/**
 * Build unified game activity from transactions and player scans.
 * Shared implementation for LocalStorage and NetworkedStorage.
 *
 * @param {Object} params
 * @param {Array} params.transactions - GM transaction records
 * @param {Array} params.playerScans - Player scanner discovery records
 * @param {Object} params.tokenManager - TokenManager for token lookup
 * @param {Object} [params.options] - Mode-specific options
 * @param {Function} [params.options.transactionFilter] - Filter function for transactions (networked: exclude non-accepted)
 * @param {Function} [params.options.pointsFallback] - Fallback for missing tx.points (networked: recalculate)
 * @returns {Object} { tokens: Array, stats: Object }
 */
export function buildGameActivity({ transactions, playerScans, tokenManager, options = {} }) {
  const { transactionFilter, pointsFallback } = options;
  const tokenMap = new Map();

  // Process player scans (discoveries)
  playerScans.forEach(scan => {
    if (!tokenMap.has(scan.tokenId)) {
      const tokenData = scan.tokenData || {};
      tokenMap.set(scan.tokenId, {
        tokenId: scan.tokenId,
        tokenData,
        potentialValue: calculateTokenValue({
          valueRating: tokenData.SF_ValueRating,
          memoryType: tokenData.SF_MemoryType
        }),
        events: [{
          type: 'discovery',
          timestamp: scan.timestamp,
          deviceId: scan.deviceId
        }],
        status: 'available',
        discoveredByPlayers: true
      });
    } else {
      tokenMap.get(scan.tokenId).events.push({
        type: 'scan',
        timestamp: scan.timestamp,
        deviceId: scan.deviceId
      });
    }
  });

  // Process GM transactions (claims)
  transactions.forEach(tx => {
    if (transactionFilter && !transactionFilter(tx)) return;

    let activity = tokenMap.get(tx.tokenId);

    if (!activity) {
      const lookedUpToken = tokenManager?.findToken(tx.tokenId);
      const tokenData = lookedUpToken ? {
        SF_MemoryType: lookedUpToken.SF_MemoryType,
        SF_ValueRating: lookedUpToken.SF_ValueRating,
        SF_Group: lookedUpToken.SF_Group || null,
        summary: lookedUpToken.summary || null
      } : {
        SF_MemoryType: tx.memoryType,
        SF_ValueRating: tx.valueRating
      };

      activity = {
        tokenId: tx.tokenId,
        tokenData,
        potentialValue: calculateTokenValue({
          valueRating: tokenData.SF_ValueRating,
          memoryType: tokenData.SF_MemoryType
        }),
        events: [],
        status: 'claimed',
        discoveredByPlayers: false
      };
      tokenMap.set(tx.tokenId, activity);
    }

    const points = pointsFallback && !tx.points
      ? pointsFallback(tx)
      : (tx.points || 0);

    activity.events.push({
      type: 'claim',
      timestamp: tx.timestamp,
      mode: tx.mode,
      teamId: tx.teamId,
      points,
      summary: tx.summary || activity.tokenData?.summary || null
    });
    activity.status = 'claimed';
  });

  // Sort events chronologically within each token
  tokenMap.forEach(activity => {
    activity.events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  });

  const tokens = Array.from(tokenMap.values());

  return {
    tokens,
    stats: {
      totalTokens: tokens.length,
      available: tokens.filter(t => t.status === 'available').length,
      claimed: tokens.filter(t => t.status === 'claimed').length,
      claimedWithoutDiscovery: tokens.filter(t => t.status === 'claimed' && !t.discoveredByPlayers).length,
      totalPlayerScans: playerScans.length
    }
  };
}
