/**
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
// Pack theme (theme unit ST.2): the scanner DECLINE mirror of the
// backend theme gate. Doctrine: the theme is BENIGN wording-class
// visual identity — undeclared keeps the engine's baked look silently;
// a DECLARED-but-broken sidecar DECLINEs loudly (the standalone tiers
// never pass the activation gate, so the mirror is their only barrier).
// One deliberate divergence from the strings mirror: kind/schemaVersion
// are REQUIRED — absent headers DECLINE (a NEW artifact has no legacy
// files; tolerance would split gate and DECLINE — design §4a O2).
import {
  applyPackTheme,
  applyThemeColorsToDom,
  packThemeApplied,
  ratingDisplay,
  ratingGlyphs,
  themeColors,
  THEME_SCHEMA_VERSION,
  _resetThemeForTesting,
} from '../../../src/core/theme.js';

const VALID = {
  kind: 'theme',
  schemaVersion: 1,
  colors: { modeScoring: '#f0a020' },
  rating: { display: 'none' },
};

describe('Pack theme (theme unit ST.2 — the scanner DECLINE mirror)', () => {
  let warnSpy;

  beforeEach(() => {
    _resetThemeForTesting();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('baked defaults (no theme applied)', () => {
    it("ratingDisplay() defaults to 'stars' — packless output stays byte-identical", () => {
      expect(ratingDisplay()).toBe('stars');
    });

    it('ratingGlyphs() serves the two baked site forms exactly (D-T.5: ⭐ filled-only at sites 1-2; ★/☆ pad at site 3)', () => {
      expect(ratingGlyphs('filled-only')).toEqual({ filled: '⭐', empty: null });
      expect(ratingGlyphs('padded')).toEqual({ filled: '★', empty: '☆' });
    });

    it('themeColors() is null and packThemeApplied() false', () => {
      expect(themeColors()).toBeNull();
      expect(packThemeApplied()).toBe(false);
    });

    it('exports schemaVersion 1 (matches theme.schema.json and the gate)', () => {
      expect(THEME_SCHEMA_VERSION).toBe(1);
    });
  });

  describe('applyPackTheme — apply and clear', () => {
    it('applies a valid sidecar (headers exact-match) and reports applied', () => {
      expect(applyPackTheme(VALID)).toBe(true);
      expect(packThemeApplied()).toBe(true);
      expect(ratingDisplay()).toBe('none');
      expect(themeColors()).toEqual({ modeScoring: '#f0a020' });
    });

    it('null clears to baked SILENTLY (undeclared = benign emptiness, never a warn)', () => {
      applyPackTheme(VALID);
      expect(applyPackTheme(null)).toBe(false);
      expect(packThemeApplied()).toBe(false);
      expect(ratingDisplay()).toBe('stars');
      const themeWarns = warnSpy.mock.calls.filter(([m]) => String(m).includes('[theme]'));
      expect(themeWarns).toHaveLength(0);
    });
  });

  describe('applyPackTheme — sidecar-level DECLINE (loud, baked stays)', () => {
    it.each([
      ['ABSENT headers (the deliberate strings divergence — a NEW artifact, §4a O2)', { colors: { modeScoring: '#f0a020' } }],
      ['a wrong kind', { ...VALID, kind: 'strings' }],
      ['a future schemaVersion', { ...VALID, schemaVersion: 2 }],
      ['a non-object sidecar', 'red'],
      ['an array sidecar', ['#f0a020']],
    ])('DECLINEs %s with a warn', (_label, sidecar) => {
      expect(applyPackTheme(sidecar)).toBe(false);
      expect(packThemeApplied()).toBe(false);
      expect(ratingDisplay()).toBe('stars');
      expect(warnSpy.mock.calls.some(([m]) => String(m).includes('[theme]'))).toBe(true);
    });
  });

  describe('applyPackTheme — per-leaf DECLINE (the bad leaf falls back, good leaves apply)', () => {
    it('drops a non-hex color leaf with a warn and keeps the valid siblings', () => {
      applyPackTheme({
        kind: 'theme', schemaVersion: 1,
        colors: { modeScoring: 'red', modeEvidence: '#20a0a0' },
      });
      expect(packThemeApplied()).toBe(true);
      expect(themeColors()).toEqual({ modeEvidence: '#20a0a0' });
      expect(warnSpy.mock.calls.some(([m]) => String(m).includes('modeScoring'))).toBe(true);
    });

    it('DECLINEs the whole rating section on an unknown display value (display drives the sites)', () => {
      applyPackTheme({ kind: 'theme', schemaVersion: 1, rating: { display: 'hidden', glyph: { filled: '💎' } } });
      expect(ratingDisplay()).toBe('stars');
      expect(ratingGlyphs('filled-only')).toEqual({ filled: '⭐', empty: null });
      expect(warnSpy.mock.calls.some(([m]) => String(m).includes('rating.display'))).toBe(true);
    });

    it('drops an unusable glyph leaf (markup / over-long) and keeps the usable one', () => {
      applyPackTheme({
        kind: 'theme', schemaVersion: 1,
        rating: { display: 'stars', glyph: { filled: '<b>', empty: '·' } },
      });
      expect(ratingGlyphs('padded')).toEqual({ filled: '★', empty: '·' });
      expect(warnSpy.mock.calls.some(([m]) => String(m).includes('glyph.filled'))).toBe(true);
    });

    it('cleans an embedded bidi control from a glyph (the value twin strips before applying)', () => {
      applyPackTheme({
        kind: 'theme', schemaVersion: 1,
        rating: { display: 'stars', glyph: { filled: '★' + String.fromCharCode(0x200e) } },
      });
      expect(ratingGlyphs('filled-only')).toEqual({ filled: '★', empty: null });
    });

    it('counts glyph length in CODE POINTS (4 astral legal, 5 declined)', () => {
      applyPackTheme({ kind: 'theme', schemaVersion: 1, rating: { display: 'stars', glyph: { filled: '💎'.repeat(4) } } });
      expect(ratingGlyphs('filled-only').filled).toBe('💎'.repeat(4));
      _resetThemeForTesting();
      applyPackTheme({ kind: 'theme', schemaVersion: 1, rating: { display: 'stars', glyph: { filled: '💎'.repeat(5) } } });
      expect(ratingGlyphs('filled-only')).toEqual({ filled: '⭐', empty: null });
    });
  });

  describe('ratingGlyphs — the D-T.5 form mapping', () => {
    it('a theme declaring only filled gets filled-only EVERYWHERE (empty defaults to no pad)', () => {
      applyPackTheme({ kind: 'theme', schemaVersion: 1, rating: { display: 'stars', glyph: { filled: '💎' } } });
      expect(ratingGlyphs('filled-only')).toEqual({ filled: '💎', empty: null });
      expect(ratingGlyphs('padded')).toEqual({ filled: '💎', empty: null });
    });

    it('a declared empty pads the padded form only', () => {
      applyPackTheme({ kind: 'theme', schemaVersion: 1, rating: { display: 'stars', glyph: { filled: '💎', empty: '·' } } });
      expect(ratingGlyphs('filled-only')).toEqual({ filled: '💎', empty: null });
      expect(ratingGlyphs('padded')).toEqual({ filled: '💎', empty: '·' });
    });
  });

  describe('applyThemeColorsToDom — the custom-prop injection', () => {
    it('sets exactly the declared props on the document root (the :219 setProperty precedent)', () => {
      applyPackTheme({
        kind: 'theme', schemaVersion: 1,
        colors: { modeScoring: '#f0a020', accentValue: '#101820' },
      });
      applyThemeColorsToDom(document);
      const root = document.documentElement;
      expect(root.style.getPropertyValue('--color-mode-scoring')).toBe('#f0a020');
      expect(root.style.getPropertyValue('--color-accent-value')).toBe('#101820');
      expect(root.style.getPropertyValue('--color-mode-evidence')).toBe('');
      expect(root.style.getPropertyValue('--color-accent-primary')).toBe('');
    });

    it('sets NOTHING when no theme colors are declared (the stylesheet values stand)', () => {
      applyPackTheme({ kind: 'theme', schemaVersion: 1, rating: { display: 'none' } });
      applyThemeColorsToDom(document);
      expect(document.documentElement.style.getPropertyValue('--color-mode-scoring')).toBe('');
    });

    it('clears previously injected props when the theme clears (reload discipline)', () => {
      applyPackTheme({ kind: 'theme', schemaVersion: 1, colors: { modeScoring: '#f0a020' } });
      applyThemeColorsToDom(document);
      applyPackTheme(null);
      applyThemeColorsToDom(document);
      expect(document.documentElement.style.getPropertyValue('--color-mode-scoring')).toBe('');
    });
  });
});
