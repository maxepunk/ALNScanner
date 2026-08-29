/**
 * @jest-environment jsdom
 *
 * modeSemantics — the modes seam, scanner side (Phase 3 A3 slice 1)
 *
 * Mirrors the backend suite (backend/tests/unit/gameRules/modeSemantics.test.js):
 * flag resolution over pack-declared modes (open vocabulary), record
 * normalization, wire-id derivation, and the legacy ALN shim (ledger L6)
 * including the drift tripwire pinning the baked table equal to the real
 * ALN game.json in the data/ submodule.
 */

import fs from 'fs';
import path from 'path';
import {
  applyPackModes,
  resolveMode,
  wireModeIds,
  defaultModeId,
  isScoringMode,
  countsTowardGroups,
  isEvidenceMode,
  isConsumingMode,
  modeHasSurface,
  modeLabel,
  claimAnnouncement,
  applyPackEntities,
  entityLabel,
  entityLabelPlural,
  LEGACY_ALN_MODES,
  _resetForTesting,
} from '../../../src/core/modeSemantics.js';

const ALN_CONFIG = {
  schemaVersion: 2,
  modes: [
    {
      id: 'blackmarket', label: 'Black Market', verb: 'Sell',
      scoringPolicy: 'standard', entityRole: 'ledger', countsTowardGroups: true,
      displayBehavior: { surface: 'scoreboard-rankings', when: 'immediate' },
      claimedLabel: 'SOLD to {entity}', icon: '💰',
    },
    {
      id: 'detective', label: 'Detective', verb: 'Expose',
      scoringPolicy: 'none', entityRole: 'attribution', defaultEntity: 'Nova',
      countsTowardGroups: false,
      displayBehavior: { surface: 'scoreboard-evidence', fields: ['summary', 'owner'], when: 'immediate' },
      claimedLabel: 'EXPOSED by {entity}', icon: '🔍',
    },
  ],
};

const TOY_CONFIG = {
  schemaVersion: 2,
  modes: [
    { id: 'fence', label: 'Fence', scoringPolicy: 'standard', entityRole: 'ledger', countsTowardGroups: true, displayBehavior: { surface: 'scoreboard-rankings' } },
    { id: 'tipoff', label: 'Tip-Off', scoringPolicy: 'none', entityRole: 'attribution', defaultEntity: 'The Dispatcher', countsTowardGroups: false, displayBehavior: { surface: 'scoreboard-evidence', fields: ['summary'] } },
    { id: 'appraise', label: 'Appraise', scoringPolicy: 'none', entityRole: 'ledger', countsTowardGroups: false, displayBehavior: { surface: 'none' } },
  ],
};

beforeEach(() => {
  _resetForTesting();
});

describe('applyPackModes', () => {
  it('applies a usable modes block and reports true', () => {
    expect(applyPackModes(ALN_CONFIG)).toBe(true);
    expect(wireModeIds()).toEqual(['blackmarket', 'detective']);
  });

  it('clears to the shim (false) for null config, missing modes, or empty modes', () => {
    expect(applyPackModes(null)).toBe(false);
    expect(applyPackModes({ schemaVersion: 1 })).toBe(false);
    expect(applyPackModes({ modes: [] })).toBe(false);
  });

  it('a later pack replaces an earlier one wholesale', () => {
    applyPackModes(ALN_CONFIG);
    applyPackModes(TOY_CONFIG);
    expect(wireModeIds()).toEqual(['fence', 'tipoff', 'appraise']);
    expect(resolveMode('blackmarket')).toBeNull();
  });
});

describe('resolveMode — pack-declared flags (open vocabulary)', () => {
  it('resolves normalized records for modes the engine has never heard of', () => {
    applyPackModes(TOY_CONFIG);
    expect(resolveMode('fence')).toEqual({
      id: 'fence', label: 'Fence', verb: null,
      scoringPolicy: 'standard', entityRole: 'ledger', defaultEntity: null,
      countsTowardGroups: true, claims: 'consuming',
      claimedLabel: null, icon: null,
      displayBehavior: { surface: 'scoreboard-rankings', fields: [], when: 'immediate' },
    });
    expect(resolveMode('tipoff').defaultEntity).toBe('The Dispatcher');
  });

  it('CLIENT DEFENSE: non-consuming ∧ countsTowardGroups drives with counts OFF, warning once (review fix)', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    applyPackModes({
      modes: [
        { id: 'sample', label: 'Sample', scoringPolicy: 'none', entityRole: 'ledger', countsTowardGroups: true, claims: 'non-consuming' },
      ],
    });
    // The orchestrator's gate refuses this pack; a standalone scanner
    // never passes that gate, so the client normalizes the undrivable
    // half off instead of inventing group semantics.
    expect(resolveMode('sample').countsTowardGroups).toBe(false);
    expect(resolveMode('sample').claims).toBe('non-consuming');
    resolveMode('sample'); // second resolution: no second warn
    const warns = warnSpy.mock.calls.filter(([m]) => String(m).includes('not driveable'));
    expect(warns).toHaveLength(1);
    warnSpy.mockRestore();
  });

  it('normalizes absent claims to consuming; isConsumingMode mirrors the backend rule (D3s2)', () => {
    applyPackModes({
      modes: [
        { id: 'sell', label: 'Sell', scoringPolicy: 'standard', entityRole: 'ledger', countsTowardGroups: true },
        { id: 'inspect', label: 'Inspect', scoringPolicy: 'none', entityRole: 'ledger', countsTowardGroups: false, claims: 'non-consuming' },
      ],
    });
    expect(resolveMode('sell').claims).toBe('consuming');
    expect(resolveMode('inspect').claims).toBe('non-consuming');
    expect(isConsumingMode('sell')).toBe(true);
    expect(isConsumingMode('inspect')).toBe(false);
    // Unresolvable modes are consuming — legacy history keeps blocking
    expect(isConsumingMode('unknown-mode')).toBe(true);
  });

  it('returns null for undeclared ids (client disables the affordance)', () => {
    applyPackModes(ALN_CONFIG);
    expect(resolveMode('fence')).toBeNull();
    expect(resolveMode(undefined)).toBeNull();
  });

  it('normalizes absent displayBehavior to {surface: none, fields: [], when: immediate}', () => {
    applyPackModes({ modes: [{ id: 'silent', label: 'Silent', scoringPolicy: 'none', entityRole: 'ledger', countsTowardGroups: false }] });
    expect(resolveMode('silent').displayBehavior).toEqual({ surface: 'none', fields: [], when: 'immediate' });
  });

  it('returns a defensive copy — record mutation cannot corrupt the table', () => {
    applyPackModes(ALN_CONFIG);
    const record = resolveMode('detective');
    record.displayBehavior.fields.push('corrupted');
    expect(resolveMode('detective').displayBehavior.fields).toEqual(['summary', 'owner']);
  });
});

describe('call-site sugar', () => {
  beforeEach(() => applyPackModes(TOY_CONFIG));

  it('isScoringMode follows scoringPolicy', () => {
    expect(isScoringMode('fence')).toBe(true);
    expect(isScoringMode('tipoff')).toBe(false);
    expect(isScoringMode('nope')).toBe(false);
  });

  it('countsTowardGroups follows the flag', () => {
    expect(countsTowardGroups('fence')).toBe(true);
    expect(countsTowardGroups('appraise')).toBe(false);
    expect(countsTowardGroups('nope')).toBe(false);
  });

  it('isEvidenceMode / modeHasSurface follow displayBehavior.surface', () => {
    expect(isEvidenceMode('tipoff')).toBe(true);
    expect(isEvidenceMode('fence')).toBe(false);
    expect(modeHasSurface('fence', 'scoreboard-rankings')).toBe(true);
    expect(modeHasSurface('appraise', 'none')).toBe(true);
  });

  it('modeLabel renders declared labels and falls back to the raw id', () => {
    expect(modeLabel('fence')).toBe('Fence');
    expect(modeLabel('mystery-mode')).toBe('mystery-mode');
  });

  it('defaultModeId is the pack FIRST declared mode', () => {
    expect(defaultModeId()).toBe('fence');
  });
});

describe('claimedLabel / icon normalization (R-Q2)', () => {
  const base = { label: 'M', scoringPolicy: 'none', entityRole: 'ledger', countsTowardGroups: false };

  it('normalizes declared claimedLabel and icon; absent fields normalize to null silently', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    applyPackModes({ modes: [
      { ...base, id: 'declared', claimedLabel: 'FENCED by {entity}', icon: '💼' },
      { ...base, id: 'bare' },
    ] });
    expect(resolveMode('declared').claimedLabel).toBe('FENCED by {entity}');
    expect(resolveMode('declared').icon).toBe('💼');
    expect(resolveMode('bare').claimedLabel).toBeNull();
    expect(resolveMode('bare').icon).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('DECLINES a claimedLabel without exactly one {entity} (gate refusal twin), warning once per mode', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    applyPackModes({ modes: [
      { ...base, id: 'none-tok', claimedLabel: 'CLAIMED' },
      { ...base, id: 'two-tok', claimedLabel: '{entity} beats {entity}' },
      { ...base, id: 'stray-brace', claimedLabel: 'SOLD to {entity} {again}' },
      { ...base, id: 'non-string', claimedLabel: 42 },
    ] });
    for (const id of ['none-tok', 'two-tok', 'stray-brace', 'non-string']) {
      expect(resolveMode(id).claimedLabel).toBeNull();
      resolveMode(id); // second resolution: no second warn
    }
    const warns = warnSpy.mock.calls.filter(([m]) => String(m).includes('claimedLabel'));
    expect(warns).toHaveLength(4);
    warnSpy.mockRestore();
  });

  it('strips C0/bidi control characters before validating', () => {
    applyPackModes({ modes: [
      { ...base, id: 'ctl', claimedLabel: 'SOLD\u202e to {entity}', icon: '\u200e💰' },
    ] });
    expect(resolveMode('ctl').claimedLabel).toBe('SOLD to {entity}');
    expect(resolveMode('ctl').icon).toBe('💰');
  });

  it('DECLINES icons bearing markup characters, empty, over-long, or non-string values', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    applyPackModes({ modes: [
      { ...base, id: 'markup', icon: '<b>' },
      { ...base, id: 'empty', icon: '' },
      { ...base, id: 'long', icon: '💰💰💰💰💰' },
      { ...base, id: 'num', icon: 7 },
      { ...base, id: 'multi-ok', icon: '💰⭐' },
    ] });
    expect(resolveMode('markup').icon).toBeNull();
    expect(resolveMode('empty').icon).toBeNull();
    expect(resolveMode('long').icon).toBeNull();
    expect(resolveMode('num').icon).toBeNull();
    // 2 code points (4 UTF-16 units) is within the 4-code-point bound
    expect(resolveMode('multi-ok').icon).toBe('💰⭐');
    warnSpy.mockRestore();
  });
});

describe('claimAnnouncement (R-Q2)', () => {
  const base = { label: 'M', scoringPolicy: 'none', entityRole: 'ledger', countsTowardGroups: false };

  it('renders the declared template with the entity name, both halves escaped', () => {
    applyPackModes({ modes: [{ ...base, id: 'fence', claimedLabel: 'FENCED by {entity}', icon: '💼' }] });
    expect(claimAnnouncement('fence', 'The Crew')).toEqual({ html: 'FENCED by The Crew', icon: '💼' });
    expect(claimAnnouncement('fence', '<img src=x onerror=alert(1)>').html)
      .toBe('FENCED by &lt;img src=x onerror=alert(1)&gt;');
  });

  it('GETSUBSTITUTION PIN: an entity named with $-patterns renders literally (function replacement)', () => {
    applyPackModes({ modes: [{ ...base, id: 'fence', claimedLabel: 'FENCED by {entity}' }] });
    // A raw-string replaceAll would corrupt '$&' (whole-match insert) and
    // '$$' (literal-$ collapse) — the same class of bug the backend's
    // scoreboardWindowMarker fix pinned.
    expect(claimAnnouncement('fence', 'Team $& $$ Inc').html).toBe('FENCED by Team $&amp; $$ Inc');
  });

  it('escapes markup-bearing templates (schema allows non-brace specials; the DOM must not run them)', () => {
    applyPackModes({ modes: [{ ...base, id: 'evil', claimedLabel: '<b onmouseover=x>SOLD & gone</b> {entity}' }] });
    expect(claimAnnouncement('evil', 'A').html)
      .toBe('&lt;b onmouseover=x&gt;SOLD &amp; gone&lt;/b&gt; A');
  });

  it('falls back per-field: undeclared claimedLabel → engine-generic wording; undeclared icon → none', () => {
    applyPackModes({ modes: [
      { ...base, id: 'bare' },
      { ...base, id: 'icon-only', icon: '🗂' },
    ] });
    expect(claimAnnouncement('bare', 'Alpha')).toEqual({ html: 'CLAIMED by Alpha', icon: null });
    expect(claimAnnouncement('icon-only', 'Alpha')).toEqual({ html: 'CLAIMED by Alpha', icon: '🗂' });
  });

  it('unresolvable mode ids get the generic phrase with no icon', () => {
    applyPackModes({ modes: [{ ...base, id: 'known' }] });
    expect(claimAnnouncement('mystery', 'Alpha')).toEqual({ html: 'CLAIMED by Alpha', icon: null });
  });

  it('BYTE IDENTITY: the baked ALN table announces exactly the legacy wording', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(claimAnnouncement('blackmarket', 'Alpha')).toEqual({ html: 'SOLD to Alpha', icon: '💰' });
    expect(claimAnnouncement('detective', 'Nova')).toEqual({ html: 'EXPOSED by Nova', icon: '🔍' });
    warnSpy.mockRestore();
  });
});

describe('entity label (Q1)', () => {
  it('bakes Team/Teams when no pack entities are applied — the legacy wording, byte-identical', () => {
    expect(entityLabel()).toBe('Team');
    expect(entityLabelPlural()).toBe('Teams');
  });

  it('declared entities.label wins (the ALN pack rebrands Team → Account)', () => {
    expect(applyPackEntities({ entities: { label: { singular: 'Account', plural: 'Accounts' } } })).toBe(true);
    expect(entityLabel()).toBe('Account');
    expect(entityLabelPlural()).toBe('Accounts');
  });

  it('absent entities block clears silently to baked', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    applyPackEntities({ entities: { label: { singular: 'Crew', plural: 'Crews' } } });
    expect(applyPackEntities({})).toBe(false);
    expect(entityLabel()).toBe('Team');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('DECLINES a broken declared label loudly (gate refusal twin) and strips controls', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(applyPackEntities({ entities: { label: { singular: '', plural: 'Xs' } } })).toBe(false);
    expect(applyPackEntities({ entities: { label: { singular: 'X' } } })).toBe(false);
    expect(applyPackEntities({ entities: { label: 'Account' } })).toBe(false);
    expect(entityLabel()).toBe('Team');
    expect(warnSpy.mock.calls.filter(([m]) => String(m).includes('entities.label'))).toHaveLength(3);
    expect(applyPackEntities({ entities: { label: { singular: 'Acc\u202eount', plural: 'Accounts' } } })).toBe(true);
    expect(entityLabel()).toBe('Account');
    expect(entityLabelPlural()).toBe('Accounts');
    warnSpy.mockRestore();
  });

  it('DRIFT NOTE (deliberate non-mirror): the real ALN game.json declares Account — the bake stays Team', () => {
    // Q1: the Account rebrand is DELIVERED BY THE PACK; packless keeps
    // legacy Team wording. This inverted pin documents the asymmetry with
    // the modes tripwire above — if game.json ever stops declaring
    // entities.label, revisit the bake.
    const gamePath = path.join(__dirname, '../../../data/game.json');
    const realEntities = JSON.parse(fs.readFileSync(gamePath, 'utf8')).entities;
    expect(realEntities.label).toEqual({ singular: 'Account', plural: 'Accounts' });
    expect(entityLabel()).toBe('Team');
  });
});

describe('legacy ALN shim (debt ledger L6)', () => {
  it('resolves against the baked ALN table when no pack modes were applied', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveMode('blackmarket').scoringPolicy).toBe('standard');
    expect(resolveMode('detective').entityRole).toBe('attribution');
    expect(wireModeIds()).toEqual(['blackmarket', 'detective']);
    expect(defaultModeId()).toBe('blackmarket');
    warnSpy.mockRestore();
  });

  it('warns LOUDLY exactly once per load when the shim engages', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    wireModeIds();
    resolveMode('detective');
    const shimWarns = warnSpy.mock.calls.filter(([m]) => String(m).includes('LEGACY SHIM ACTIVE'));
    expect(shimWarns).toHaveLength(1);
    expect(String(shimWarns[0][0])).toContain('L6');
    warnSpy.mockRestore();
  });

  it('does NOT warn when a pack table is active', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    applyPackModes(ALN_CONFIG);
    wireModeIds();
    expect(warnSpy.mock.calls.filter(([m]) => String(m).includes('LEGACY SHIM ACTIVE'))).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it('DRIFT TRIPWIRE: the baked table mirrors the real ALN game.json modes block exactly', () => {
    const gamePath = path.join(__dirname, '../../../data/game.json');
    const realModes = JSON.parse(fs.readFileSync(gamePath, 'utf8')).modes;
    expect(JSON.parse(JSON.stringify(LEGACY_ALN_MODES))).toEqual(realModes);
  });
});
