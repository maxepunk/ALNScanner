/**
 * DataManagerUtils - Shared utilities for data management
 * Extracted from DataManager and StandaloneDataManager to eliminate duplication
 *
 * @module core/dataManagerUtils
 */

export class DataManagerUtils {
  /**
   * Check if token has been scanned (duplicate detection)
   * @param {Set} scannedTokens - Set of scanned token IDs
   * @param {string} tokenId - Token ID to check
   * @returns {boolean} True if token already scanned
   */
  static isTokenScanned(scannedTokens, tokenId) {
    return scannedTokens.has(tokenId);
  }

  /**
   * Mark token as scanned (for duplicate detection)
   * @param {Set} scannedTokens - Set of scanned token IDs
   * @param {string} tokenId - Token ID to mark
   */
  static markTokenAsScanned(scannedTokens, tokenId) {
    scannedTokens.add(tokenId);
  }

  /**
   * Unmark token as scanned (allow re-scanning after delete)
   * @param {Set} scannedTokens - Set of scanned token IDs
   * @param {string} tokenId - Token ID to unmark
   * @returns {boolean} True if token was removed, false if not present
   */
  static unmarkTokenAsScanned(scannedTokens, tokenId) {
    return scannedTokens.delete(tokenId);
  }

  /**
   * Calculate global statistics from transactions
   * @param {Array} transactions - Array of transaction objects
   * @param {Function} calculateTokenValue - Function to calculate token value
   * @returns {Object} Global stats object
   */
  static calculateGlobalStats(transactions, calculateTokenValue) {
    const total = transactions.length;
    const teams = [...new Set(transactions.map(t => t.teamId))].length;
    const known = transactions.filter(t => !t.isUnknown);

    const blackMarketTransactions = known.filter(t => t.mode === 'blackmarket');

    const blackMarketScore = blackMarketTransactions.reduce((sum, t) => {
      return sum + calculateTokenValue(t);
    }, 0);

    // totalValue derived from blackMarketScore only - detective mode has no scoring
    const totalValue = Math.floor(blackMarketScore / 1000);
    const avgValue = known.length > 0 ? parseFloat((totalValue / known.length).toFixed(1)) : 0;

    return { total, teams, totalValue, avgValue, blackMarketScore };
  }
}
