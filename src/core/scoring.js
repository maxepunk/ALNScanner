/**
 * Scoring Module - Shared Scoring Configuration and Utilities
 * ES6 Module Export
 *
 * Loads scoring configuration from shared ALN-TokenData submodule.
 * This ensures frontend and backend use identical scoring values.
 *
 * @module core/scoring
 */

// BAKED FALLBACK (transitional-debt ledger L2): VENDORED legacy ALN
// tables. Until A3 slice 2 this was a build-time import of the submodule's
// scoring-config.json; that file retired with ledger L1 (the pack's
// game.json is the sole shared source), so the last-resort shim is now
// self-contained — same doctrine as the modeSemantics LEGACY_ALN_MODES
// table, and the unit drift tripwire pins it equal to data/game.json's
// scoring block. Since A2 the AUTHORITATIVE values arrive at runtime via
// applyPackScoring(); this table only serves packs published before
// game.json existed, and warns LOUDLY when active (F-TOOL-05 class).
// Retirement (L2): delete one release cycle after the final cutover.
import { applyPackMoneyFormat } from '../utils/formatCurrency.js';

const bakedConfig = Object.freeze({
    baseValues: Object.freeze({ 1: 10000, 2: 25000, 3: 50000, 4: 75000, 5: 150000 }),
    typeMultipliers: Object.freeze({ Personal: 1, Mention: 3, Business: 3, Party: 5, Technical: 5, UNKNOWN: 0 }),
    semantics: Object.freeze({ allowNegative: true }),
});

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
    TYPE_MULTIPLIERS: { ...bakedConfig.typeMultipliers },
    // D2s2: pack-conditional score floor (scoring.semantics.allowNegative).
    // Baked default mirrors ALN (true), like every other shim value; the
    // backend's normalization rule is identical (strict === true), so
    // standalone and networked refuse the same adjustments.
    ALLOW_NEGATIVE: bakedConfig.semantics.allowNegative,
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
    // Non-empty required on BOTH tables: an empty-but-present object would
    // pass a falsy-only guard, wipe the baked values below, and repopulate
    // nothing — every token silently scoring $0 for the session (same bug
    // class as packLoader's empty-token-map check, one layer up).
    if (!scoring?.baseValues || !scoring?.typeMultipliers
        || Object.keys(scoring.baseValues).length === 0
        || Object.keys(scoring.typeMultipliers).length === 0) {
        // LEGACY SHIM ACTIVE — loud by design (ledger L2 tripwire): scoring
        // is running on values frozen at BUILD time; a pack publish with new
        // values will NOT reach this device until the pack ships game.json.
        console.warn('[scoring] LEGACY SHIM ACTIVE: pack has no usable game.json scoring block — using build-time baked values (F-TOOL-05 exposure)');
        SCORING_SOURCE = 'baked';
        SCORING_CONFIG.ALLOW_NEGATIVE = bakedConfig.semantics.allowNegative;
        applyPackMoneyFormat(null); // R-3b-1: baked ALN money spec rides the shim
        return false;
    }
    Object.keys(SCORING_CONFIG.BASE_VALUES).forEach((k) => delete SCORING_CONFIG.BASE_VALUES[k]);
    Object.keys(SCORING_CONFIG.TYPE_MULTIPLIERS).forEach((k) => delete SCORING_CONFIG.TYPE_MULTIPLIERS[k]);
    Object.entries(scoring.baseValues).forEach(([k, v]) => {
        SCORING_CONFIG.BASE_VALUES[parseInt(k)] = v;
    });
    Object.assign(SCORING_CONFIG.TYPE_MULTIPLIERS, scoring.typeMultipliers);
    // Strict === true, matching the backend's _normalizeScoring: a pack
    // that declares scoring but omits semantics gets the conservative floor.
    SCORING_CONFIG.ALLOW_NEGATIVE = !!(scoring.semantics && scoring.semantics.allowNegative === true);
    // R-3b-1: the money display spec rides the same block. Undrivable or
    // absent formats reset to the baked ALN spec inside the util (the
    // backend gate refuses declared undrivable formats — only ungated
    // tiers can carry one, and they land on baked affixes, never garbage).
    applyPackMoneyFormat(scoring.display && scoring.display.format);
    SCORING_SOURCE = 'pack';
    return true;
}

/**
 * Star-rating construction (A3 slice 3b): the ONE builder behind the
 * three ad-hoc renderers (uiManager repeat, GameOpsRenderer's odd
 * 1+repeat(r-1), and the hardcoded-5-scale card rating that threw
 * RangeError for r>5). Glyphs stay per-surface baked (Q-3b-2 held);
 * the SCALE derives from the applied pack's baseValues keys —
 * schema-frozen at 5 today, future-proof against a wider pack.
 *
 * @param {number} rating
 * @param {Object} [opts]
 * @param {string} [opts.filled='⭐'] - glyph for earned stars
 * @param {string|null} [opts.empty=null] - glyph for the remainder (null = filled-only)
 * @returns {string}
 */
export function formatStars(rating, { filled = '⭐', empty = null } = {}) {
    const scale = Object.keys(SCORING_CONFIG.BASE_VALUES).length || 5;
    const r = Math.max(0, Math.min(scale, rating || 0));
    return filled.repeat(r) + (empty ? empty.repeat(scale - r) : '');
}

/**
 * Parse group info from a v2 SF_Group value (the PURE group name — the
 * "(xN)" suffix parser DIED at the tokens-v2 cutover, A3 slice 2b/D3b:
 * the Notion sync is the sole parser of the authoring shorthand).
 *
 * The multiplier comes ONLY from the active pack's `groups` block
 * (applied via applyPackGroups from the packLoader's game.json —
 * backend tokenService parity). An undeclared name reads 1 ("group with
 * no completion bonus") — unreachable for gated packs, since the
 * backend's activation gate refuses tokens naming undeclared groups.
 *
 * @param {string} groupName - v2 SF_Group: pure group name
 * @returns {Object} { name, multiplier }
 *
 * @example
 * parseGroupInfo("Marcus Sucks")     // { name: "Marcus Sucks", multiplier: <pack> }
 * parseGroupInfo("Ungrouped Token")  // { name: "Ungrouped Token", multiplier: 1 }
 */
let PACK_GROUPS = null;

export function applyPackGroups(groups) {
    PACK_GROUPS = (groups && typeof groups === 'object') ? groups : null;
    return PACK_GROUPS !== null;
}

export function parseGroupInfo(groupName) {
    if (!groupName) {
        return { name: 'Unknown', multiplier: 1 };
    }

    const name = groupName.trim();

    // Object.hasOwn (not truthy-index): a group named 'constructor' must
    // never resolve via the prototype chain (round-2 review C16). A
    // declared entry without a usable integer multiplier reads 1 — the
    // backend gate refuses such packs; this is the never-gated-pack
    // defense.
    if (PACK_GROUPS && Object.hasOwn(PACK_GROUPS, name)) {
        const m = PACK_GROUPS[name] && PACK_GROUPS[name].multiplier;
        return { name, multiplier: (Number.isInteger(m) && m >= 1) ? m : 1 };
    }

    return { name, multiplier: 1 };
}

/** Is this (trimmed) group name declared in the applied pack groups
 *  block? Distinguishes "declared x1" from "not declared at all" — the
 *  tokenManager client-defense warn needs the difference (both read
 *  multiplier 1 from parseGroupInfo). */
export function isDeclaredGroup(name) {
    return !!(PACK_GROUPS && Object.hasOwn(PACK_GROUPS, (name || '').trim()));
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
