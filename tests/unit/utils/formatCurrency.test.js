import fs from 'fs';
import path from 'path';
import {
  formatCurrency,
  formatNumber,
  applyPackMoneyFormat,
  parseMoneyFormat,
} from '../../../src/utils/formatCurrency.js';

// Pack-driven since A3 slice 3b (R-3b-1): scoring.display.format is the
// driving spec — one '#,###' signed grouped-integer token wrapped by
// literal affixes. This suite pins the baked-ALN fallback byte-identity
// AND the pack-driven path; the backend's gameRules/formatting.js is the
// parity surface (its suite carries the twin pins on the same fixtures).

const ALN_GAME = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../../data/game.json'), 'utf8'
));

describe('formatCurrency', () => {
  afterEach(() => {
    applyPackMoneyFormat(null); // reset to baked ALN
  });

  describe('baked ALN spec (no pack format applied)', () => {
    it('prefixes $ and groups thousands', () => {
      expect(formatCurrency(150000)).toBe('$150,000');
      expect(formatCurrency(150000).startsWith('$')).toBe(true);
    });

    it('treats null/undefined/0/NaN as $0', () => {
      expect(formatCurrency(0)).toBe('$0');
      expect(formatCurrency(null)).toBe('$0');
      expect(formatCurrency(undefined)).toBe('$0');
      expect(formatCurrency(NaN)).toBe('$0');
    });

    it('BYTE-IDENTITY with the legacy inline `$${n.toLocaleString()}` pattern (incl. negatives)', () => {
      for (const n of [1, 999, 1000, 10000, 25000, 750000, -25000]) {
        expect(formatCurrency(n)).toBe(`$${n.toLocaleString('en-US')}`);
      }
      // The B9 golden's negative quirk: the sign rides the number token.
      expect(formatCurrency(-25000)).toBe('$-25,000');
    });

    it('DRIFT TRIPWIRE: the baked spec equals the REAL ALN pack format (data/game.json)', () => {
      expect(parseMoneyFormat(ALN_GAME.scoring.display.format))
        .toEqual({ prefix: '$', suffix: '' });
      applyPackMoneyFormat(ALN_GAME.scoring.display.format);
      expect(formatCurrency(150000)).toBe('$150,000'); // pack == baked for ALN
    });
  });

  describe('pack-driven specs (applyPackMoneyFormat)', () => {
    it('renders a suffix-unit spec (the toy-heist class)', () => {
      expect(applyPackMoneyFormat('#,### cr')).toBe(true);
      expect(formatCurrency(25000)).toBe('25,000 cr');
      expect(formatCurrency(-25000)).toBe('-25,000 cr');
      expect(formatCurrency(0)).toBe('0 cr');
    });

    it('renders a prefix spec with spacing', () => {
      applyPackMoneyFormat('€ #,###');
      expect(formatCurrency(1500)).toBe('€ 1,500');
    });

    it('an undrivable format is DECLINED — baked spec stays (gate mirror)', () => {
      applyPackMoneyFormat('#,### cr');
      expect(applyPackMoneyFormat('dollars')).toBe(false);
      expect(formatCurrency(5000)).toBe('$5,000'); // reset to baked, not stale toy
    });

    it('applyPackMoneyFormat(null) resets to the baked spec (packless load)', () => {
      applyPackMoneyFormat('#,### cr');
      applyPackMoneyFormat(null);
      expect(formatCurrency(5000)).toBe('$5,000');
    });
  });

  describe('formatNumber (the bare number-token half — grouped, no affixes)', () => {
    it('groups like the number token regardless of the applied spec', () => {
      expect(formatNumber(25000)).toBe('25,000');
      applyPackMoneyFormat('#,### cr');
      expect(formatNumber(25000)).toBe('25,000'); // affixes never leak in
      expect(formatNumber(null)).toBe('0');
    });
  });

  describe('parseMoneyFormat (grammar twin of backend gameRules/formatting.js)', () => {
    it.each([
      ['$#,###', { prefix: '$', suffix: '' }],
      ['#,### cr', { prefix: '', suffix: ' cr' }],
      ['#,###', { prefix: '', suffix: '' }],
    ])('parses %j', (format, expected) => {
      expect(parseMoneyFormat(format)).toEqual(expected);
    });

    it.each(['dollars', '$#,###-#,###', '##,###', '', null, undefined, 42])(
      'returns null for undrivable %j', (bad) => {
        expect(parseMoneyFormat(bad)).toBeNull();
      }
    );
  });
});
