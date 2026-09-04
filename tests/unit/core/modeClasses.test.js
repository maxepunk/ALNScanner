/**
 * @jest-environment jsdom
 */

// A3 slice 3c (R-3c-1): styling keys to SEMANTICS. modeClassNames()
// derives engine-understood classes (mode-scoring / mode-evidence) from
// the same flags that already gate behavior, and slugifyId() makes any
// pack id safe as a single CSS class token (type keys carry NO schema
// pattern — a type "Deep Cover" used to emit TWO classes).

import { describe, it, expect, afterEach } from '@jest/globals';
import { applyPackModes, modeClassNames } from '../../../src/core/modeSemantics.js';
import { slugifyId } from '../../../src/utils/slugify.js';

const TOY_MODES = {
  modes: [
    { id: 'fence', label: 'Fence', scoringPolicy: 'standard', displayBehavior: { surface: 'scoreboard-rankings' } },
    { id: 'tipoff', label: 'Tip-Off', scoringPolicy: 'none', displayBehavior: { surface: 'scoreboard-evidence' } },
    { id: 'appraise', label: 'Appraise', scoringPolicy: 'none', displayBehavior: { surface: 'scoreboard-evidence' }, claims: 'non-consuming' },
  ],
};

describe('modeClassNames (slice 3c semantic classes)', () => {
  afterEach(() => {
    applyPackModes(null); // baked ALN table
  });

  it('ALN baked table: blackmarket → mode-scoring, detective → mode-evidence', () => {
    expect(modeClassNames('blackmarket')).toEqual(['mode-blackmarket', 'mode-scoring']);
    expect(modeClassNames('detective')).toEqual(['mode-detective', 'mode-evidence']);
  });

  it('pack-open ids derive the SAME semantic classes from their flags (toy table)', () => {
    applyPackModes(TOY_MODES);
    expect(modeClassNames('fence')).toEqual(['mode-fence', 'mode-scoring']);
    expect(modeClassNames('tipoff')).toEqual(['mode-tipoff', 'mode-evidence']);
    expect(modeClassNames('appraise')).toEqual(['mode-appraise', 'mode-evidence']);
  });

  it('an undeclared id gets only its slugged id class (no semantic classes, no crash)', () => {
    expect(modeClassNames('ghost-mode')).toEqual(['mode-ghost-mode']);
  });

  it('null/undefined yield an empty list (callers join safely)', () => {
    expect(modeClassNames(null)).toEqual([]);
    expect(modeClassNames(undefined)).toEqual([]);
  });
});

describe('slugifyId (single CSS class token from any pack id)', () => {
  it.each([
    ['blackmarket', 'blackmarket'],
    ['Tip-Off', 'tip-off'],
    ['Deep Cover', 'deep-cover'],       // the two-class bug killed
    ['Personal', 'personal'],
    ['a b  c', 'a-b-c'],
    ['weird<img>', 'weird-img-'],       // markup can never survive
    ['', ''],
    [null, ''],
    [undefined, ''],
  ])('%j → %j', (input, expected) => {
    expect(slugifyId(input)).toBe(expected);
  });
});
