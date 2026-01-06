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
}
