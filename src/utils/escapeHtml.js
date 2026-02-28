/**
 * Escape HTML special characters to prevent XSS.
 * @param {*} str - Value to escape (non-strings return '')
 * @returns {string} Escaped HTML string
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
