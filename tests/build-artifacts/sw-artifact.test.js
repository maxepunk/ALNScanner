/**
 * Service worker build artifact (SW-1/SW-2) — complements P0.5's swArtifact.test.js.
 *
 * Asserts the production build emits dist/sw.js AND that the shipped SW does not
 * precache the stale/non-existent paths that made the old atomic install fail
 * (socket.io-client min bundle, data/tokens.json under /gm-scanner/).
 *
 * Lives in tests/build-artifacts/ (a dir named `build` is gitignored). Runs via
 * `npm run test:build` (gated out of the default `npm test`).
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..'); // ALNScanner/
const DIST_SW = path.join(ROOT, 'dist', 'sw.js');

describe('service worker build artifact (SW-1/SW-2)', () => {
  beforeAll(() => {
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
  }, 180000);

  it('emits sw.js into dist/', () => {
    expect(fs.existsSync(DIST_SW)).toBe(true);
  });

  it('does NOT precache the stale/non-existent paths (SW-2)', () => {
    const sw = fs.readFileSync(DIST_SW, 'utf8');
    expect(sw).not.toContain('/socket.io-client/socket.io.min.js');
    expect(sw).not.toContain('./data/tokens.json');
  });

  it('bypasses only by path, not by host/port (production cache must not be inert)', () => {
    // At https://<IP>:3000/gm-scanner/ a host/port bypass matches EVERY app
    // request, making the runtime cache inert. Bypass must be path-based only.
    const sw = fs.readFileSync(DIST_SW, 'utf8');
    expect(sw).not.toContain('\\d+\\.\\d+'); // no IP-octet regex
    expect(sw).not.toContain('url.host');    // bypass must not key off host/port
    expect(sw).toContain("startsWith('/api/')");
    expect(sw).toContain("startsWith('/socket.io/')");
  });
});
