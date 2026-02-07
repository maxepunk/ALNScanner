/**
 * Validate JWT token expiration with 1-minute safety buffer.
 * Shared utility — replaces 4 duplicate implementations.
 *
 * @param {string} token - JWT token string
 * @returns {boolean} True if token exists, is well-formed, and not expired
 */
export function isTokenValid(token) {
  if (!token) return false;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const decode = typeof atob !== 'undefined'
      ? (str) => atob(str)
      : (str) => Buffer.from(str, 'base64').toString();

    const payload = JSON.parse(decode(parts[1]));
    if (!payload.exp) return false;

    const now = Math.floor(Date.now() / 1000);
    const BUFFER_SECONDS = 60;
    return (payload.exp - BUFFER_SECONDS) > now;
  } catch {
    return false;
  }
}
