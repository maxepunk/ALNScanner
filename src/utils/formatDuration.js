/**
 * formatDuration - Shared duration formatting utility
 *
 * Consolidates the three previously separate duration formatters
 * (app.js, uiManager.js). SessionReportGenerator uses a different
 * signature (startTime, endTime) and format ("Xh Ym") pinned by the
 * external GenAI pipeline contract — it is intentionally NOT changed.
 *
 * @module utils/formatDuration
 */

/**
 * Format a duration in milliseconds to a human-readable string.
 *
 * Returns "0m" for zero duration.
 * Returns "Unknown" for null/undefined/negative values.
 * Handles days for long durations.
 *
 * @param {number|null} ms - Duration in milliseconds
 * @param {Object} [options]
 * @param {string} [options.fallback='Unknown'] - Value to return for null/negative input
 * @returns {string} Formatted duration e.g. "2h 30m", "45m", "30s", "1d 2h"
 */
export function formatDuration(ms, { fallback = 'Unknown' } = {}) {
  if (ms == null || ms < 0) return fallback;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const h = hours % 24;
    return h > 0 ? `${days}d ${h}h` : `${days}d`;
  }
  if (hours > 0) {
    const m = minutes % 60;
    return m > 0 ? `${hours}h ${m}m` : `${hours}h`;
  }
  if (minutes > 0) {
    const s = seconds % 60;
    return s > 0 ? `${minutes}m ${s}s` : `${minutes}m`;
  }
  // Zero or sub-minute: show seconds (even 0s for a just-started session)
  return `${seconds}s`;
}
