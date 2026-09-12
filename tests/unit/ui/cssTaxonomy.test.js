/**
 * CSS-source tripwires (slice 3c) — jsdom cannot compute the cascade,
 * so these pin the two rules whose DELETION or DE-SCOPING broke things
 * in review: (A) the pill's visual treatment must stay SCOPED to
 * .mode-indicator (a bare .mode-scoring/.mode-evidence selector leaked
 * glow + white text onto Game Activity rows), and (D) the type badge
 * base rule must keep the open-vocabulary FLOOR (background + color)
 * so a non-baked pack type never renders unstyled.
 */

import fs from 'fs';
import path from 'path';

describe('CSS taxonomy source tripwires (slice 3c)', () => {
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, '../../../src/styles', rel), 'utf8');

  it('pill visuals are scoped to .mode-indicator — no bare semantic-class rule (review A)', () => {
    const css = read('components.css');
    expect(css).toContain('.mode-indicator.mode-evidence');
    expect(css).toContain('.mode-indicator.mode-scoring');
    expect(css).not.toMatch(/^\.mode-evidence\s*\{/m);
    expect(css).not.toMatch(/^\.mode-scoring\s*\{/m);
  });

  it('the type-badge base rule carries the open-vocabulary floor (review D)', () => {
    const css = read('screens/admin.css');
    const base = css.match(/\.token-card \.token-type \{[^}]*\}/);
    expect(base).not.toBeNull();
    expect(base[0]).toContain('background:');
    expect(base[0]).toContain('color:');
  });

  it('activity mode styling keys to the SEMANTIC classes (re-keyed rules exist)', () => {
    const css = read('screens/admin.css');
    expect(css).toContain('.token-card__status.mode-scoring');
    expect(css).toContain('.token-card__status.mode-evidence');
    expect(css).toContain('.event.claim.mode-scoring');
    expect(css).toContain('.event.claim.mode-evidence');
  });

  it('MODE-KEYED rules read the mode TOKENS, never literals (theme unit §4a T-2 — a theme must be able to recolor what the semantic classes style)', () => {
    const css = read('screens/admin.css');
    // The four mode-keyed rules: each must reference its mode token.
    const rules = [
      /\.token-card__status\.mode-scoring \{[^}]*\}/,
      /\.token-card__status\.mode-evidence \{[^}]*\}/,
      /\.token-card__timeline \.event\.claim\.mode-scoring \{[^}]*\}/,
      /\.token-card__timeline \.event\.claim\.mode-evidence \{[^}]*\}/,
    ];
    for (const re of rules) {
      const m = css.match(re);
      expect(m).not.toBeNull();
      const expectToken = re.source.includes('scoring') ? '--color-mode-scoring' : '--color-mode-evidence';
      expect(m[0]).toContain(`var(${expectToken})`);
      expect(m[0]).not.toMatch(/#f59e0b|#3b82f6/);
    }
  });
});
