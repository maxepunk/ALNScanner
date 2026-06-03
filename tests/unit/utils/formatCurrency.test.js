import { formatCurrency } from '../../../src/utils/formatCurrency.js';

describe('formatCurrency', () => {
  it('prefixes $ and groups thousands', () => {
    expect(formatCurrency(150000)).toBe(`$${(150000).toLocaleString()}`);
    expect(formatCurrency(150000).startsWith('$')).toBe(true);
  });

  it('treats null/undefined/0 as $0', () => {
    expect(formatCurrency(0)).toBe('$0');
    expect(formatCurrency(null)).toBe('$0');
    expect(formatCurrency(undefined)).toBe('$0');
  });

  it('matches the inline `$${n.toLocaleString()}` pattern it replaces', () => {
    for (const n of [1, 999, 1000, 10000, 25000, 750000]) {
      expect(formatCurrency(n)).toBe(`$${n.toLocaleString()}`);
    }
  });
});
