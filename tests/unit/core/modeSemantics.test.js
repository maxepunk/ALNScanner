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
  LEGACY_ALN_MODES,
  _resetForTesting,
} from '../../../src/core/modeSemantics.js';

const ALN_CONFIG = {
  schemaVersion: 1,
  modes: [
    {
      id: 'blackmarket', label: 'Black Market', verb: 'Sell',
      scoringPolicy: 'standard', entityRole: 'ledger', countsTowardGroups: true,
      displayBehavior: { surface: 'scoreboard-rankings', when: 'immediate' },
    },
    {
      id: 'detective', label: 'Detective', verb: 'Expose',
      scoringPolicy: 'none', entityRole: 'attribution', defaultEntity: 'Nova',
      countsTowardGroups: false,
      displayBehavior: { surface: 'scoreboard-evidence', fields: ['summary', 'owner'], when: 'immediate' },
    },
  ],
};

const TOY_CONFIG = {
  schemaVersion: 1,
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
      displayBehavior: { surface: 'scoreboard-rankings', fields: [], when: 'immediate' },
    });
    expect(resolveMode('tipoff').defaultEntity).toBe('The Dispatcher');
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
