import { isTokenValid } from '../../../src/utils/jwtUtils.js';

// Helper to create JWT with specific expiry
function createToken(expiresInSeconds) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    iat: Math.floor(Date.now() / 1000)
  }));
  return `${header}.${payload}.test-signature`;
}

describe('isTokenValid', () => {
  it('should return true for token expiring in 1 hour', () => {
    expect(isTokenValid(createToken(3600))).toBe(true);
  });

  it('should return false for expired token', () => {
    expect(isTokenValid(createToken(-60))).toBe(false);
  });

  it('should return false for token expiring within 1-minute buffer', () => {
    expect(isTokenValid(createToken(30))).toBe(false);
  });

  it('should return true for token expiring just beyond buffer', () => {
    expect(isTokenValid(createToken(120))).toBe(true);
  });

  it('should return false for null/undefined/empty', () => {
    expect(isTokenValid(null)).toBe(false);
    expect(isTokenValid(undefined)).toBe(false);
    expect(isTokenValid('')).toBe(false);
  });

  it('should return false for malformed tokens', () => {
    expect(isTokenValid('not-a-jwt')).toBe(false);
    expect(isTokenValid('only.two')).toBe(false);
    expect(isTokenValid('a.b.c.d')).toBe(false);
  });

  it('should return false for token with no exp claim', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256' }));
    const payload = btoa(JSON.stringify({ iat: 123 }));
    expect(isTokenValid(`${header}.${payload}.sig`)).toBe(false);
  });

  it('should return false for invalid base64 payload', () => {
    expect(isTokenValid('valid.!!!invalid!!!.sig')).toBe(false);
  });
});
