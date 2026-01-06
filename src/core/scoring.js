/**
 * Scoring Module - Shared Scoring Configuration and Utilities
 * ES6 Module Export
 *
 * Loads scoring configuration from shared ALN-TokenData submodule.
 * This ensures frontend and backend use identical scoring values.
 *
 * @module core/scoring
 */

// Import shared config from data submodule (Vite resolves at build time)
import sharedConfig from '../../data/scoring-config.json';

/**
 * Scoring configuration for Black Market mode
 * Maps value ratings and memory types to point values
 *
 * NOTE: Values loaded from ALN-TokenData/scoring-config.json
 */
export const SCORING_CONFIG = {
    BASE_VALUES: Object.fromEntries(
        Object.entries(sharedConfig.baseValues).map(([k, v]) => [parseInt(k), v])
    ),
    TYPE_MULTIPLIERS: { ...sharedConfig.typeMultipliers }
};

/**
 * Parse group info from group name string
 * Extracts group name and multiplier from format: "Group Name (xN)"
 *
 * @param {string} groupName - Group name with optional multiplier suffix
 * @returns {Object} Parsed group info with name and multiplier
 *
 * @example
 * parseGroupInfo("Marcus Sucks (x2)")  // { name: "Marcus Sucks", multiplier: 2 }
 * parseGroupInfo("Ungrouped Token")    // { name: "Ungrouped Token", multiplier: 1 }
 */
export function parseGroupInfo(groupName) {
    if (!groupName) {
        return { name: 'Unknown', multiplier: 1 };
    }

    // Trim input first to handle leading/trailing whitespace
    const trimmed = groupName.trim();

    // Match pattern: "Group Name (xN)"
    const match = trimmed.match(/^(.+?)\s*\(x(\d+)\)$/i);

    if (match) {
        const name = match[1].trim();
        const multiplier = parseInt(match[2]) || 1;

        if (multiplier < 1) {
            console.warn(`[scoring] Invalid multiplier ${multiplier} for "${name}", using 1`);
            return { name, multiplier: 1 };
        }

        return { name, multiplier };
    }

    return { name: trimmed, multiplier: 1 };
}

/**
 * Normalize group name for consistent matching
 * Handles case insensitivity, whitespace normalization, and apostrophe variants
 *
 * @param {string} name - Group name to normalize
 * @returns {string} Normalized group name
 *
 * @example
 * normalizeGroupName("Marcus's Notes")  // "marcus's notes"
 * normalizeGroupName("  Spaced  Out  ") // "spaced out"
 */
export function normalizeGroupName(name) {
    if (!name) return '';

    return name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/['\u2018\u2019]/g, "'");  // Normalize curly apostrophes to straight
}

/**
 * Calculate base value of a token
 *
 * @param {Object} transaction - Transaction data
 * @param {number} transaction.valueRating - Star rating (1-5)
 * @param {string} transaction.memoryType - Memory type (Personal/Business/Technical)
 * @param {boolean} [transaction.isUnknown] - Whether token is unknown
 * @returns {number} Token value in points
 */
export function calculateTokenValue(transaction) {
    if (transaction.isUnknown) return 0;

    const baseValue = SCORING_CONFIG.BASE_VALUES[transaction.valueRating] || 0;
    const multiplier = SCORING_CONFIG.TYPE_MULTIPLIERS[transaction.memoryType] || 1;

    return baseValue * multiplier;
}
