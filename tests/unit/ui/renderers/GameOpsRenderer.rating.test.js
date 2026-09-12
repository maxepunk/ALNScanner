/**
 * @jest-environment jsdom
 */

// Theme unit ST.2 — site 3 of the star-drop (the Game Activity token
// card's rating line) plus the §4a O1 escape pin: themed glyphs sit in
// an innerHTML template literal, so the render must escape them at the
// sink — the standalone tiers never meet the activation gate, and the
// DECLINE twin is their only other barrier.

import { describe, it, expect, afterEach } from '@jest/globals';
import { GameOpsRenderer } from '../../../../src/ui/renderers/GameOpsRenderer.js';
import { applyPackTheme, _resetThemeForTesting } from '../../../../src/core/theme.js';

function renderCard(token) {
  const renderer = new GameOpsRenderer({});
  return renderer._renderActivityTokenCard(token);
}

const sink = () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
};

const CARD_TOKEN = {
  tokenId: 't1',
  status: 'available',
  tokenData: { SF_MemoryType: 'Technical', SF_ValueRating: 3 },
  events: [],
  potentialValue: 100,
};

afterEach(() => {
  _resetThemeForTesting();
  document.body.innerHTML = '';
});

describe('Game Activity card rating (theme unit ST.2 — site 3)', () => {
  it('baked default renders the padded ★/☆ form (byte-identical packless)', () => {
    const el = sink();
    el.innerHTML = renderCard(CARD_TOKEN);
    expect(el.querySelector('.token-card__rating').textContent).toBe('★★★☆☆');
  });

  it("display 'none' omits the rating element entirely", () => {
    applyPackTheme({ kind: 'theme', schemaVersion: 1, rating: { display: 'none' } });
    const el = sink();
    el.innerHTML = renderCard(CARD_TOKEN);
    expect(el.querySelector('.token-card__rating')).toBeNull();
  });

  it("display 'numeric' renders the digit for a rated token", () => {
    applyPackTheme({ kind: 'theme', schemaVersion: 1, rating: { display: 'numeric' } });
    const el = sink();
    el.innerHTML = renderCard(CARD_TOKEN);
    expect(el.querySelector('.token-card__rating').textContent.trim()).toBe('3');
  });

  it("display 'numeric' renders the unrated mark '—' for rating 0/undefined (0 must not read as a score — §4a T-6)", () => {
    applyPackTheme({ kind: 'theme', schemaVersion: 1, rating: { display: 'numeric' } });
    const el = sink();
    el.innerHTML = renderCard({ ...CARD_TOKEN, tokenData: undefined });
    expect(el.querySelector('.token-card__rating').textContent.trim()).toBe('—');
  });

  it("rating 0 under 'stars' keeps the deliberate ☆☆☆☆☆ unrated affordance", () => {
    const el = sink();
    el.innerHTML = renderCard({ ...CARD_TOKEN, tokenData: undefined });
    expect(el.querySelector('.token-card__rating').textContent).toBe('☆☆☆☆☆');
  });

  it('themed glyphs render through the declared pair (padded form)', () => {
    applyPackTheme({ kind: 'theme', schemaVersion: 1, rating: { display: 'stars', glyph: { filled: '💎', empty: '·' } } });
    const el = sink();
    el.innerHTML = renderCard(CARD_TOKEN);
    expect(el.querySelector('.token-card__rating').textContent).toBe('💎💎💎··');
  });

  it('ESCAPE PIN (§4a O1): the glyph string reaches the DOM as TEXT — markup in the rendered string cannot become elements', () => {
    // The DECLINE twin refuses markup glyphs, so no APPLIED glyph can
    // carry '<'; this pin proves the SINK escapes anyway (defense in
    // depth — the neighboring pack values all escape, and the sink must
    // not rely on the twin staying perfect).
    applyPackTheme({ kind: 'theme', schemaVersion: 1, rating: { display: 'stars', glyph: { filled: '💎' } } });
    const html = renderCard(CARD_TOKEN);
    // The rendered rating substring must be the escaped-neutral glyph
    // repeat, produced via escapeHtml (no raw interpolation path).
    expect(html).toContain('💎💎💎');
    const el = sink();
    el.innerHTML = html;
    expect(el.querySelector('.token-card__rating').children.length).toBe(0);
  });
});
