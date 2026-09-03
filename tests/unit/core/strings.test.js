/**
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
// Pack-declared display strings (A3 slice 3a). Doctrine: the BENIGN
// wording class — a pack that declares nothing keeps the baked ALN
// wording with NO loud shim (unlike scoring's L2 warn: wrong wording
// cannot corrupt a game the way wrong scoring can). Declared-but-broken
// sidecars are refused by the BACKEND activation gate; the client mirror
// here only guards the ungated tiers (bundled / Pages-static), and it
// DECLINES rather than refuses — baked wording is always a safe landing.
import gameConfig from '../../../data/game.json';
import alnStrings from '../../../data/strings.json';
import {
  applyPackStrings,
  getString,
  STRINGS_SCHEMA_VERSION,
} from '../../../src/core/strings.js';

describe('Pack strings (A3 slice 3a)', () => {
  beforeEach(() => {
    applyPackStrings(null); // reset to baked
  });

  describe('baked defaults (no pack sidecar)', () => {
    it('serves the baked scanner wording when nothing is applied', () => {
      expect(getString('scanner.appTitle')).toBe('Memory Transaction Station');
      expect(getString('scanner.scanPrompt')).toBe('Tap Memory Token');
      expect(getString('scanner.statLabels.score')).toBe('Score');
      expect(getString('scanner.statLabels.totalValue')).toBe('Total Value');
      expect(getString('scoreboard.emptyEvidence')).toBe('Awaiting evidence...');
    });

    it('returns null for a key no baked table declares', () => {
      expect(getString('scanner.noSuchKey')).toBeNull();
      expect(getString('nosection.nokey')).toBeNull();
    });

    it('DRIFT TRIPWIRE: baked defaults mirror the real ALN sidecar (data/strings.json)', () => {
      // Same doctrine as the scoring shim tripwire: the baked wording IS
      // the ALN wording — if the pack rewords, the bake must follow (or
      // the fallback silently diverges from the shipped game).
      expect(getString('scanner.appTitle')).toBe(alnStrings.scanner.appTitle);
      expect(getString('scanner.scanPrompt')).toBe(alnStrings.scanner.scanPrompt);
      expect(getString('scanner.statLabels.score')).toBe(alnStrings.scanner.statLabels.score);
      expect(getString('scanner.statLabels.totalValue')).toBe(alnStrings.scanner.statLabels.totalValue);
      expect(getString('scoreboard.emptyEvidence')).toBe(alnStrings.scoreboard.emptyEvidence);
    });

    it('the ALN pack actually declares the sidecar this module consumes', () => {
      expect(gameConfig.strings).toBe('strings.json');
      expect(alnStrings.kind).toBe('strings');
      expect(alnStrings.schemaVersion).toBe(STRINGS_SCHEMA_VERSION);
    });

    it('INVERTED PIN (slice 7): ALN declares NO report section — the bake IS the report voice', () => {
      // The LEGACY_ENTITY_LABEL pattern: the session-report goldens pin
      // the BAKED tier byte-for-byte and claim that tier is what ALN
      // ships. That claim is only true while data/strings.json stays
      // silent on report wording — the moment ALN declares a report
      // section, the rendered tier diverges from the pipeline-pinned
      // goldens while every suite stays green. This pin makes that
      // moment loud: declaring ALN report strings requires a
      // coordinated golden + pipeline update FIRST
      // (docs/session-report-contract.md).
      expect(alnStrings.report).toBeUndefined();
    });
  });

  describe('applyPackStrings', () => {
    it('applies declared leaves over the baked wording', () => {
      const ok = applyPackStrings({
        kind: 'strings',
        schemaVersion: 2,
        scanner: { appTitle: 'Fence Terminal' },
        scoreboard: { emptyEvidence: 'Awaiting tips...' },
      });
      expect(ok).toBe(true);
      expect(getString('scanner.appTitle')).toBe('Fence Terminal');
      expect(getString('scoreboard.emptyEvidence')).toBe('Awaiting tips...');
      // Keys the pack omits keep the baked wording (benign fallback)
      expect(getString('scanner.scanPrompt')).toBe('Tap Memory Token');
      expect(getString('scanner.statLabels.score')).toBe('Score');
    });

    it('applies nested section leaves (statLabels)', () => {
      applyPackStrings({
        kind: 'strings',
        schemaVersion: 2,
        scanner: { statLabels: { score: 'Take', totalValue: 'Total Haul' } },
      });
      expect(getString('scanner.statLabels.score')).toBe('Take');
      expect(getString('scanner.statLabels.totalValue')).toBe('Total Haul');
    });

    it('applyPackStrings(null) resets to baked wording', () => {
      applyPackStrings({ kind: 'strings', schemaVersion: 2, scanner: { appTitle: 'X' } });
      expect(getString('scanner.appTitle')).toBe('X');
      applyPackStrings(null);
      expect(getString('scanner.appTitle')).toBe('Memory Transaction Station');
    });

    it('declines a sidecar whose kind is not "strings" (client mirror of the gate)', () => {
      expect(applyPackStrings({ kind: 'theme', schemaVersion: 2, scanner: { appTitle: 'X' } }))
        .toBe(false);
      expect(getString('scanner.appTitle')).toBe('Memory Transaction Station');
    });

    it('declines a sidecar with a foreign schemaVersion (past AND future)', () => {
      for (const v of [1, 3]) {
        expect(applyPackStrings({ kind: 'strings', schemaVersion: v, scanner: { appTitle: 'X' } }))
          .toBe(false);
        expect(getString('scanner.appTitle')).toBe('Memory Transaction Station');
      }
    });

    it('declines non-object sidecars', () => {
      for (const bad of ['strings', 42, [], true]) {
        expect(applyPackStrings(bad)).toBe(false);
      }
      expect(getString('scanner.appTitle')).toBe('Memory Transaction Station');
    });
  });

  describe('leaf validation (schema mirror: non-empty string leaves only)', () => {
    it('ignores empty-string and non-string leaves — baked wording wins', () => {
      applyPackStrings({
        kind: 'strings',
        schemaVersion: 2,
        scanner: { appTitle: '', scanPrompt: 42, statLabels: { score: null } },
      });
      expect(getString('scanner.appTitle')).toBe('Memory Transaction Station');
      expect(getString('scanner.scanPrompt')).toBe('Tap Memory Token');
      expect(getString('scanner.statLabels.score')).toBe('Score');
    });

    it('a nested object where a string is expected falls back to baked (never "[object Object]")', () => {
      applyPackStrings({
        kind: 'strings',
        schemaVersion: 2,
        scanner: { appTitle: { nested: 'deeper' } },
      });
      expect(getString('scanner.appTitle')).toBe('Memory Transaction Station');
    });
  });

  describe('prototype safety (Object.hasOwn doctrine)', () => {
    it('a section/key named "constructor" never resolves through the prototype chain', () => {
      applyPackStrings({ kind: 'strings', schemaVersion: 2, scanner: { appTitle: 'X' } });
      expect(getString('constructor.name')).toBeNull();
      expect(getString('scanner.constructor')).toBeNull();
      expect(getString('scanner.appTitle.constructor')).toBeNull();
    });
  });
});
