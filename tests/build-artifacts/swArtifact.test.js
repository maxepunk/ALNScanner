/**
 * Build-artifact conformance (SW-1/SW-4 safety net)
 *
 * Asserts the production build emits dist/sw.js. The deployed scanner registers
 * `/gm-scanner/sw.js` (initializationSteps.js), so the build MUST emit it.
 *
 * EXPECTED RED until the SW-1 fix: sw.js currently lives at the submodule root
 * and is neither a Rollup input nor inside publicDir:'data', so the build never
 * emits it and /gm-scanner/sw.js 404s on every load.
 *
 * NOTE: This test runs a real `vite build` and is SLOW. It lives in
 * tests/build-artifacts/ (NOT tests/unit/) because a dir named `build` is
 * gitignored. It is gated OUT of the default `npm test` (see
 * testPathIgnorePatterns in jest.config.js) and runs via `npm run test:build`
 * (jest.build.config.js).
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');             // ALNScanner/
const DIST_SW = path.join(ROOT, 'dist', 'sw.js');

describe('build artifact: service worker', () => {
  beforeAll(() => {
    // Production base path is /gm-scanner/ (served by the orchestrator).
    execSync('npm run build:backend', { cwd: ROOT, stdio: 'inherit' });
  }, 180000);

  it('emits dist/sw.js so /gm-scanner/sw.js resolves at runtime', () => {
    expect(fs.existsSync(DIST_SW)).toBe(true);
  });
});
