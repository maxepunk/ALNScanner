/**
 * Token Manager - Token Database and Group Inventory
 * ES6 Module Export
 *
 * Responsibilities:
 * - Load token database from external JSON
 * - Fuzzy token ID matching (case-insensitive, with/without colons)
 * - Build group inventory for bonus calculations
 * - Demo data fallback
 */

import Debug from '../utils/debug.js';
import defaultPackLoader from './packLoader.js';
import { applyPackScoring, applyPackGroups, parseGroupInfo } from './scoring.js';
import { applyPackModes } from './modeSemantics.js';

/**
 * TokenManager Class
 * Manages token database and provides lookup functionality
 */
class TokenManagerClass {
  constructor() {
    this.database = {};
    this.groupInventory = null;
    this._dataManagerHelpers = null; // Injected dependency
    this._packLoader = defaultPackLoader; // Injectable for tests
  }

  /**
   * Inject DataManager helper methods (dependency injection)
   * @param {Object} helpers - Object with parseGroupInfo and normalizeGroupName methods
   */
  setDataManagerHelpers(helpers) {
    this._dataManagerHelpers = helpers;
  }

  /**
   * Load the token database via the game-pack loader (Phase 3 A2).
   *
   * The packLoader owns the load order (network → cache → bundled), the
   * staged atomic refresh, and the HTTP-3/HTTP-4 hardening the old direct
   * fetch chain carried. Runtime scoring is applied here from the pack's
   * game.json — replacing the build-time bake (F-TOOL-05).
   * @returns {Promise<boolean>} Success status
   */
  async loadDatabase() {
    try {
      const pack = await this._packLoader.loadPack();

      this.database = pack.tokens;
      const info = pack.info;
      Debug.log(`✅ Loaded ${Object.keys(this.database).length} tokens — pack ${info.packId || 'unknown'} v${info.version || '?'} (${info.source})`);
      Debug.log(`Sample keys: ${Object.keys(this.database).slice(0, 3).join(', ')}`);

      // Runtime scoring from the pack's rules artifact (game.json). When
      // absent (older published pack), the baked legacy shim stays active
      // and warns loudly (transitional-debt ledger L2).
      applyPackScoring(pack.gameConfig?.scoring);
      applyPackGroups(pack.gameConfig?.groups);

      // Runtime mode table from the same artifact (slice 1). Same shim
      // doctrine: no modes block → baked ALN table + loud warn (ledger L6).
      applyPackModes(pack.gameConfig);

      // Build group inventory for bonus calculations
      this.groupInventory = this.buildGroupInventory();
      this.logGroupStats();

      return true;
    } catch (error) {
      Debug.log(`Token database error: ${error.message}`, true);
      // CRITICAL: Fail hard if database cannot be loaded.
      // Do NOT load demo data.
      return false;
    }
  }

  /**
   * Build inventory of all groups and their tokens
   * @returns {Object} Group inventory map
   */
  buildGroupInventory() {
    const groups = {};
    const issues = [];

    Object.entries(this.database).forEach(([rfid, token]) => {
      // Use injected helpers or fallback to inline parsing
      const groupInfo = this._dataManagerHelpers
        ? this._dataManagerHelpers.parseGroupInfo(token.SF_Group)
        : this._parseGroupInfoFallback(token.SF_Group);

      const normalizedName = this._dataManagerHelpers
        ? this._dataManagerHelpers.normalizeGroupName(groupInfo.name)
        : this._normalizeGroupNameFallback(groupInfo.name);

      if (!groups[normalizedName]) {
        groups[normalizedName] = {
          displayName: groupInfo.name,
          normalizedName: normalizedName,
          multiplier: groupInfo.multiplier,
          tokens: new Set(),
          rawGroupNames: new Set(),
          memoryTypes: new Set()
        };
      }

      // Add token to group
      groups[normalizedName].tokens.add(rfid);
      groups[normalizedName].rawGroupNames.add(token.SF_Group);
      groups[normalizedName].memoryTypes.add(token.SF_MemoryType);

      // Check for multiplier consistency
      if (groups[normalizedName].multiplier !== groupInfo.multiplier) {
        issues.push(`Group "${groupInfo.name}" has inconsistent multipliers`);
        // Keep the higher multiplier
        groups[normalizedName].multiplier = Math.max(
          groups[normalizedName].multiplier,
          groupInfo.multiplier
        );
      }

      // Update display name if this one is "better"
      if (groupInfo.name.length > groups[normalizedName].displayName.length ||
        (groupInfo.name.length === groups[normalizedName].displayName.length &&
          groupInfo.name > groups[normalizedName].displayName)) {
        groups[normalizedName].displayName = groupInfo.name;
      }
    });

    // Log any issues found
    if (issues.length > 0) {
      Debug.log('=== Group Inventory Issues ===', true);
      issues.forEach(issue => Debug.log(issue, true));
    }

    return groups;
  }

  /**
   * Fallback group info parser (when no DataManager helpers injected).
   * v2 cutover: delegates to the canonical scoring.parseGroupInfo — the
   * second inline "(xN)" regex died with the suffix format (D3b); pure
   * names + the pack groups block are the only multiplier source.
   */
  _parseGroupInfoFallback(groupString) {
    if (!groupString) {
      return { name: '', multiplier: 1 };
    }
    return parseGroupInfo(groupString);
  }

  /**
   * Fallback group name normalizer (until DataManager is converted)
   * Lowercase, trim, remove extra whitespace
   */
  _normalizeGroupNameFallback(name) {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Log group statistics for debugging
   */
  logGroupStats() {
    if (!this.groupInventory) return;

    Debug.log('=== Group Inventory Summary ===');
    const groups = Object.values(this.groupInventory);

    Debug.log(`Total Groups: ${groups.length}`);

    const completableGroups = groups.filter(g => g.multiplier > 1 && g.tokens.size > 1);
    const singleTokenGroups = groups.filter(g => g.tokens.size === 1);

    Debug.log(`Completable Groups: ${completableGroups.length}`);
    Debug.log(`Single Token Groups: ${singleTokenGroups.length}`);

    // Log details for each group
    groups.sort((a, b) => b.tokens.size - a.tokens.size).forEach(group => {
      Debug.log(`"${group.displayName}": ${group.tokens.size} tokens, ${group.multiplier}x`);

      if (group.tokens.size === 1 && group.multiplier > 1) {
        Debug.log(`  ⚠️ Only 1 token but ${group.multiplier}x multiplier`, true);
      }
    });
  }

  /**
   * Get group inventory with caching
   * @returns {Object} Group inventory
   */
  getGroupInventory() {
    if (!this.groupInventory) {
      this.groupInventory = this.buildGroupInventory();
    }
    return this.groupInventory;
  }

  /**
   * Get all tokens from database
   * @returns {Array} Array of all token objects
   */
  getAllTokens() {
    return Object.values(this.database);
  }

  /**
   * Find token in database with fuzzy matching
   * Handles: case variations, with/without colons, with/without hyphens
   * @param {string} id - Token ID to find
   * @returns {Object|null} Token data and matched ID, or null if not found
   */
  findToken(id) {
    Debug.log(`🔍 findToken called with: "${id}"`);
    Debug.log(`Database has ${Object.keys(this.database).length} tokens`);
    Debug.log(`First 5 keys: ${Object.keys(this.database).slice(0, 5).join(', ')}`);

    // Direct match
    if (this.database[id]) {
      Debug.log(`✅ Direct match: ${id}`);
      return { token: this.database[id], matchedId: id };
    }

    // Normalize input: remove colons/hyphens, lowercase
    const normalizedInput = id.replace(/[:-]/g, '').toLowerCase();

    // Try matching against normalized database keys
    for (const [dbKey, token] of Object.entries(this.database)) {
      const normalizedDbKey = dbKey.replace(/[:-]/g, '').toLowerCase();

      if (normalizedInput === normalizedDbKey) {
        Debug.log(`✅ Fuzzy match: "${id}" -> "${dbKey}"`);
        return { token, matchedId: dbKey };
      }
    }

    Debug.log(`No match found for: ${id}`, true);
    return null;
  }
}

// Create singleton instance
const TokenManager = new TokenManagerClass();

export default TokenManager;
export { TokenManagerClass };
