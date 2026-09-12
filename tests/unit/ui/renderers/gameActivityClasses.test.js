/**
 * @jest-environment jsdom
 */

// A3 slice 3c (R-3c-1): class-emission pins for the Game Activity token
// card — the census found these emitters had NO test pin anywhere. Pins:
// semantic mode classes ride the status bar and timeline rows (so any
// pack's modes hit the re-keyed CSS), and type classes are slugified
// (an unpatterned pack type like "Deep Cover" used to emit TWO classes).

import { describe, it, expect, afterEach } from '@jest/globals';
import { GameOpsRenderer } from '../../../../src/ui/renderers/GameOpsRenderer.js';
import { applyPackModes } from '../../../../src/core/modeSemantics.js';

function renderCard(token) {
  const renderer = new GameOpsRenderer({});
  return renderer._renderActivityTokenCard(token);
}

const sink = () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
};

afterEach(() => {
  applyPackModes(null);
  document.body.innerHTML = '';
});

describe('Game Activity card class emission (slice 3c)', () => {
  it('status bar carries the semantic mode classes (ALN baked table)', () => {
    const el = sink();
    el.innerHTML = renderCard({
      tokenId: 't1', status: 'claimed',
      tokenData: { SF_MemoryType: 'Technical', SF_ValueRating: 3 },
      events: [{ type: 'claim', mode: 'blackmarket', teamId: 'A', points: 100 }],
    });
    const status = el.querySelector('.token-card__status');
    expect(status.classList.contains('mode-blackmarket')).toBe(true);
    expect(status.classList.contains('mode-scoring')).toBe(true);
  });

  it('a pack-open scoring mode gets the SAME semantic class (toy table)', () => {
    applyPackModes({
      modes: [{ id: 'fence', label: 'Fence', scoringPolicy: 'standard', displayBehavior: { surface: 'scoreboard-rankings' } }],
    });
    const el = sink();
    el.innerHTML = renderCard({
      tokenId: 't1', status: 'claimed',
      tokenData: { SF_MemoryType: 'Technical', SF_ValueRating: 3 },
      events: [{ type: 'claim', mode: 'fence', teamId: 'A', points: 100 }],
    });
    const status = el.querySelector('.token-card__status');
    expect(status.classList.contains('mode-fence')).toBe(true);
    expect(status.classList.contains('mode-scoring')).toBe(true);
  });

  it('type classes are SLUGIFIED — an unpatterned type emits ONE class token', () => {
    const el = sink();
    el.innerHTML = renderCard({
      tokenId: 't1', status: 'available',
      tokenData: { SF_MemoryType: 'Deep Cover', SF_ValueRating: 2 },
      events: [],
    });
    const badge = el.querySelector('.token-type');
    expect(badge.classList.contains('type-deep-cover')).toBe(true);
    expect(badge.classList.contains('cover')).toBe(false); // the old two-class bug
    expect(badge.textContent).toBe('Deep Cover'); // display text untouched
  });

  it('TIMELINE claim rows carry the semantic classes too (review C — was unpinned)', () => {
    const el = sink();
    el.innerHTML = renderCard({
      tokenId: 't1', status: 'claimed',
      tokenData: { SF_MemoryType: 'Technical', SF_ValueRating: 3 },
      events: [{ type: 'claim', mode: 'blackmarket', teamId: 'A', points: 100, timestamp: '2026-01-01T10:00:00Z' }],
    });
    const row = el.querySelector('.event.claim');
    expect(row).not.toBeNull();
    expect(row.classList.contains('mode-blackmarket')).toBe(true);
    expect(row.classList.contains('mode-scoring')).toBe(true);
  });

  it('a RESERVED-slug mode id never forges a semantic/structural class (review B)', () => {
    applyPackModes({
      modes: [
        { id: 'scoring', label: 'Sneaky', scoringPolicy: 'none', displayBehavior: { surface: 'scoreboard-evidence' } },
        { id: 'indicator', label: 'Odd', scoringPolicy: 'none', displayBehavior: { surface: 'none' } },
      ],
    });
    const el = sink();
    el.innerHTML = renderCard({
      tokenId: 't1', status: 'claimed',
      tokenData: { SF_MemoryType: 'Technical', SF_ValueRating: 3 },
      events: [{ type: 'claim', mode: 'scoring', teamId: 'A', points: 0 }],
    });
    const status = el.querySelector('.token-card__status');
    // The id class is SUPPRESSED; only the TRUE semantic class rides
    expect(status.classList.contains('mode-evidence')).toBe(true);
    expect(status.classList.contains('mode-scoring')).toBe(false);
  });

  it('an unclaimed card has no mode classes and no stray whitespace crash', () => {
    const el = sink();
    el.innerHTML = renderCard({
      tokenId: 't1', status: 'available',
      tokenData: { SF_MemoryType: 'Personal', SF_ValueRating: 1 },
      events: [],
    });
    const status = el.querySelector('.token-card__status');
    expect(status.className).toContain('status-available');
    expect(status.className).not.toContain('mode-');
  });
});
