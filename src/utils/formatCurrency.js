/**
 * Money formatting — pack-driven since A3 slice 3b (ruling R-3b-1).
 *
 * The pack's `scoring.display.format` is the driving spec, parsed with
 * the minimal grammar shared with the backend's gameRules/formatting.js
 * (the parity surface — both suites pin identical outputs on the same
 * fixture formats): exactly one '#,###' number token (signed integer,
 * en-US comma grouping) wrapped by literal prefix/suffix affixes.
 * "$#,###" → "$150,000" / "$-25,000" (byte-identical to the legacy
 * '$' + toLocaleString output, including the B9 golden's negative
 * quirk); "#,### cr" → "25,000 cr".
 *
 * applyPackMoneyFormat is called from applyPackScoring (core/scoring.js)
 * on every pack load: a drivable declared format wins; anything else —
 * packless load, no display block, undrivable format (the backend gate
 * refuses those, so only ungated tiers can carry one) — resets to the
 * baked ALN spec. Benign-formatting class: silent per-load fallback, no
 * loud shim (wrong affixes can't corrupt a game the way wrong scoring
 * can).
 *
 * Scope note: backend/public/scoreboard.html is a separate non-bundled
 * file and vendors its own copy of this grammar (build boundary).
 */

// Baked ALN spec — drift-tripwired against data/game.json in tests.
const BAKED_MONEY_SPEC = Object.freeze({ prefix: '$', suffix: '' });

// The applied pack spec, or null → baked.
let MONEY_SPEC = null;

/**
 * Parse a pack-declared money format into an affix spec.
 * @param {*} format - scoring.display.format value
 * @returns {{prefix: string, suffix: string}|null} null when undrivable
 */
export function parseMoneyFormat(format) {
    const m = typeof format === 'string' ? format.match(/^([^#]*)#,###([^#]*)$/) : null;
    return m ? { prefix: m[1], suffix: m[2] } : null;
}

/**
 * Apply (or clear with null) the active pack's money format.
 * @param {*} format - scoring.display.format value
 * @returns {boolean} true when a drivable format was applied
 */
export function applyPackMoneyFormat(format) {
    MONEY_SPEC = parseMoneyFormat(format);
    return MONEY_SPEC !== null;
}

/**
 * Format a value under the ACTIVE pack's money spec (baked ALN fallback).
 * Null-safe: null/undefined/NaN → the spec's zero (e.g. "$0").
 * @param {number} value
 * @returns {string} e.g. "$150,000" or "25,000 cr"
 */
export function formatCurrency(value) {
    const { prefix, suffix } = MONEY_SPEC || BAKED_MONEY_SPEC;
    return prefix + (value || 0).toLocaleString('en-US') + suffix;
}

/**
 * The bare number-token half — grouped digits, NO affixes. For sites
 * that render money-adjacent numbers next to their own labels (e.g.
 * "${base} × {mult}x" breakdowns) so grouping can't drift from the spec.
 * @param {number} value
 * @returns {string} e.g. "25,000"
 */
export function formatNumber(value) {
    return (value || 0).toLocaleString('en-US');
}

export default formatCurrency;
