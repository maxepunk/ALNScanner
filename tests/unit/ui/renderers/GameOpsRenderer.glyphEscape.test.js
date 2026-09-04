/**
 * @jest-environment jsdom
 */

// Theme unit ST.2 review (spec finding 1): the first escape pin was
// VACUOUS — the DECLINE twin strips markup before any glyph reaches
// the sink, so removing escapeHtml stayed green. This pin exercises
// the SINK ALONE: theme.js is mocked to hand the renderers a
// markup-bearing glyph directly, proving the escapeHtml call is
// load-bearing (defense in depth — the sink must not rely on the twin
// staying perfect; the closers' 12-site finding is the precedent).

import { describe, it, expect, afterEach, jest } from '@jest/globals';

jest.mock('../../../../src/core/theme.js', () => ({
  ratingDisplay: () => 'stars',
  ratingGlyphs: () => ({ filled: '<img src=x onerror=alert(1)>', empty: null }),
}));

import { GameOpsRenderer } from '../../../../src/ui/renderers/GameOpsRenderer.js';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('glyph sink escaping (theme unit §4a O1 — the sink alone, twin bypassed)', () => {
  it('site 3: a markup-bearing glyph reaches the DOM as TEXT — no element materializes', () => {
    const html = new GameOpsRenderer({})._renderActivityTokenCard({
      tokenId: 't1', status: 'available',
      tokenData: { SF_MemoryType: 'Technical', SF_ValueRating: 1 },
      events: [], potentialValue: 100,
    });
    const el = document.createElement('div');
    document.body.appendChild(el);
    el.innerHTML = html;
    const rating = el.querySelector('.token-card__rating');
    expect(rating.querySelector('img')).toBeNull();
    expect(rating.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('site 2: the Base Rating field escapes the same way', () => {
    const html = new GameOpsRenderer({})._renderBaseRatingField(false, 1);
    const el = document.createElement('div');
    document.body.appendChild(el);
    el.innerHTML = html;
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
