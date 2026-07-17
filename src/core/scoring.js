/**
 * Scoring Module - Shared Scoring Configuration and Utilities
 * ES6 Module Export
 *
 * Loads scoring configuration from shared ALN-TokenData submodule.
 * This ensures frontend and backend use identical scoring values.
 *
 * @module core/scoring
 */

// BAKED FALLBACK (transitional-debt ledger L2): the build-time snapshot of
// scoring-config.json. Since A2, the AUTHORITATIVE values arrive at runtime
// from the loaded pack's game.json via applyPackScoring() — this import is
// only the last-resort shim for packs published before game.json existed,
// and it warns LOUDLY when left active (the F-TOOL-05 stale-bake class).
// Retirement: delete this import one release cycle after A2 packs are
// everywhere (scoring-config.json leaves ALN-TokenData in A3 slice 2).
import bakedConfig from '../../data/scoring-config.json';

/**
 * Scoring configuration for Black Market mode
 * Maps value ratings and memory types to point values
 *
 * Initialized from the baked snapshot; OVERWRITTEN IN PLACE by
 * applyPackScoring() when the runtime-loaded pack carries a scoring block.
 * Consumers read properties at use time, so the in-place mutation reaches
 * every importer.
 */
export const SCORING_CONFIG = {
    BASE_VALUES: Object.fromEntries(
        Object.entries(bakedConfig.baseValues).map(([k, v]) => [parseInt(k), v])
    ),
    TYPE_MULTIPLIERS: { ...bakedConfig.typeMultipliers }
};

/**
 * Where the active scoring values came from: 'pack' (runtime game.json)
 * or 'baked' (build-time shim — F-TOOL-05 exposure).
 */
export let SCORING_SOURCE = 'baked';

/**
 * Apply the runtime pack's scoring block (game.json `scoring`), replacing
 * the baked build-time values (Phase 3 A2 — the F-TOOL-05 kill).
 *
 * @param {Object|null|undefined} scoring - game.json scoring block
 *        ({baseValues, typeMultipliers, ...})
 * @returns {boolean} true when pack scoring was applied
 */
export function applyPackScoring(scoring) {
    if (!scoring?.baseValues || !scoring?.typeMultipliers) {
        // LEGACY SHIM ACTIVE — loud by design (ledger L2 tripwire): scoring
        // is running on values frozen at BUILD time; a pack publish with new
        // values will NOT reach this device until the pack ships game.json.
        console.warn('[scoring] LEGACY SHIM ACTIVE: pack has no game.json scoring block — using build-time baked values (F-TOOL-05 exposure)');
        SCORING_SOURCE = 'baked';
        return false;
    }
    Object.keys(SCORING_CONFIG.BASE_VALUES).forEach((k) => delete SCORING_CONFIG.BASE_VALUES[k]);
    Object.keys(SCORING_CONFIG.TYPE_MULTIPLIERS).forEach((k) => delete SCORING_CONFIG.TYPE_MULTIPLIERS[k]);
    Object.entries(scoring.baseValues).forEach(([k, v]) => {
        SCORING_CONFIG.BASE_VALUES[parseInt(k)] = v;
    });
    Object.assign(SCORING_CONFIG.TYPE_MULTIPLIERS, scoring.typeMultipliers);
    SCORING_SOURCE = 'pack';
    return true;
}

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
    // Use UNKNOWN multiplier (0) for unknown types - matches backend behavior
    const multiplier = SCORING_CONFIG.TYPE_MULTIPLIERS[transaction.memoryType]
        ?? SCORING_CONFIG.TYPE_MULTIPLIERS.UNKNOWN
        ?? 0;

    return baseValue * multiplier;
}
