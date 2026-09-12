/**
 * @jest-environment jsdom
 */

// Theme unit close review (state F1 / doctrine F2, convergent): an
// all-leaves-declined sidecar left PACK_THEME = {} — truthy — so
// packThemeApplied() said APPLIED and the pack line showed no
// 'theme: declined' note while the ruled star-drop silently reverted
// to baked stars (the exact OBJ-2 silent failure, on the tier where
// the scanner mirror is the only barrier). The rule these tests pin:
// attempted-and-ALL-declined = whole DECLINE (null/false/loud);
// nothing-attempted stays vacuously applied (headers-only and
// scoreboard-only themes are NOT declines — the scanner just has
// nothing to consume).

import { describe, it, expect, afterEach, jest } from '@jest/globals';
import {
  applyPackTheme, packThemeApplied, ratingDisplay, _resetThemeForTesting,
} from '../../../src/core/theme.js';

afterEach(() => {
  _resetThemeForTesting();
});

const quiet = () => jest.spyOn(console, 'warn').mockImplementation(() => {});

describe('all-attempted-leaves-declined = whole DECLINE (close review F2)', () => {
  it("an all-typos sidecar (ALN's file misspelled) DECLINEs whole: false, not-applied, baked stars", () => {
    const warn = quiet();
    const ok = applyPackTheme({
      kind: 'theme', schemaVersion: 1,
      rating: { display: 'non' },
      colors: { modeScoring: '#ff6b3' },
    });
    const warned = warn.mock.calls.some(([m]) => /EVERY leaf declined|whole DECLINE/i.test(String(m)));
    warn.mockRestore();
    expect(ok).toBe(false);
    expect(packThemeApplied()).toBe(false);
    expect(ratingDisplay()).toBe('stars');
    expect(warned).toBe(true);
  });

  it('a single-section undrivable rating alone DECLINEs whole', () => {
    const warn = quiet();
    const ok = applyPackTheme({ kind: 'theme', schemaVersion: 1, rating: { display: 'sideways' } });
    warn.mockRestore();
    expect(ok).toBe(false);
    expect(packThemeApplied()).toBe(false);
  });

  it('a PARTIAL decline stays applied (per-leaf DECLINE is the ruled semantics)', () => {
    const warn = quiet();
    const ok = applyPackTheme({
      kind: 'theme', schemaVersion: 1,
      colors: { modeScoring: '#d4af37', modeEvidence: 'nope' },
    });
    warn.mockRestore();
    expect(ok).toBe(true);
    expect(packThemeApplied()).toBe(true);
  });

  it('a headers-only sidecar is vacuously APPLIED — nothing attempted, nothing declined', () => {
    expect(applyPackTheme({ kind: 'theme', schemaVersion: 1 })).toBe(true);
    expect(packThemeApplied()).toBe(true);
  });

  it('a scoreboard-only sidecar is vacuously APPLIED — that section is the TV page\'s, not the scanner\'s', () => {
    expect(applyPackTheme({
      kind: 'theme', schemaVersion: 1,
      scoreboard: { accent: '#0e7490', accentDark: '#164e63' },
    })).toBe(true);
    expect(packThemeApplied()).toBe(true);
  });
});

describe('unknown top-level sections warn LOUDLY (close review F3 — DECLINE-mirror loudness parity)', () => {
  it("an unknown section warns by name; a known-but-unconsumed one (scoreboard) doesn't", () => {
    const warn = quiet();
    applyPackTheme({
      kind: 'theme', schemaVersion: 1,
      rating: { display: 'none' },
      scoreboard: { accent: '#0e7490' },
      fonts: { body: 'Comic Sans' },
    });
    const msgs = warn.mock.calls.map(([m]) => String(m));
    warn.mockRestore();
    expect(msgs.some((m) => m.includes("'fonts'") && /unknown/i.test(m))).toBe(true);
    expect(msgs.some((m) => m.includes("'scoreboard'"))).toBe(false);
    expect(packThemeApplied()).toBe(true);
  });
});
