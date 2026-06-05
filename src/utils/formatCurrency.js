/**
 * Format a numeric value as a dollar-prefixed, locale-grouped currency string.
 * Null-safe: null/undefined/0 → "$0". Centralizes the repeated
 * `$${n.toLocaleString()}` pattern used across the GM scanner UI, so currency
 * formatting can't drift between call sites.
 *
 * Scope note: GM-internal only. backend/public/scoreboard.html is a separate
 * non-bundled file and keeps its own formatter (build boundary — see the
 * scoreboard-rendering-unification deferred ledger entry).
 *
 * @param {number} value
 * @returns {string} e.g. "$150,000"
 */
export function formatCurrency(value) {
  return '$' + (value || 0).toLocaleString();
}

export default formatCurrency;
