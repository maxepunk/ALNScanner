/**
 * Service worker build artifact (SW-1/SW-2/SW-4 safety net).
 *
 * Builds with the PRODUCTION base path (`npm run build:backend`,
 * VITE_BASE_PATH=/gm-scanner/) because the deployed scanner registers
 * `/gm-scanner/sw.js` (initializationSteps.js) — this is the path that must
 * resolve at runtime. emitServiceWorker() in vite.config.js emits sw.js verbatim
 * regardless of base, so SW assertions hold under either base; using the
 * production base ensures the single build that runs is the representative one.
 *
 * Asserts the production build emits dist/sw.js AND that the shipped SW does not
 * precache the stale/non-existent paths that made the old atomic install fail
 * (socket.io-client min bundle, data/tokens.json under /gm-scanner/).
 *
 * Lives in tests/build-artifacts/ (a dir named `build` is gitignored). Runs via
 * `npm run test:build` (gated out of the default `npm test`).
 *
 * NOTE: This is the sole SW build-artifact test. A previously separate
 * swArtifact.test.js (existence-only subset) was consolidated here (DUPLICATE-SW)
 * to avoid running vite build twice per `npm run test:build` invocation.
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..'); // ALNScanner/
const DIST_SW = path.join(ROOT, 'dist', 'sw.js');

describe('service worker build artifact (SW-1/SW-2)', () => {
  beforeAll(() => {
    // Production base path — matches how the orchestrator serves the scanner.
    execSync('npm run build:backend', { cwd: ROOT, stdio: 'inherit' });
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

  it('is network-first (no cache-first early return) so updated assets/token data are never served stale', () => {
    // R7 made the cache live; tokenManager fetches a same-origin, non-hashed
    // tokens.json the SW would otherwise cache-first + never invalidate (static
    // cache name) -> stale token data across deploys. Network-first keeps the app
    // fresh online and uses the cache only as an offline fallback.
    const sw = fs.readFileSync(DIST_SW, 'utf8');
    expect(sw).not.toContain('if (cached) return cached');
  });
});
