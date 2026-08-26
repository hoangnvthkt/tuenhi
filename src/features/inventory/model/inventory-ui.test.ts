import { describe, expect, it } from 'vitest';
import { formatNumber } from './inventory-ui';

describe('formatNumber', () => {
  it('keeps all digits for an 18-digit stock quantity', () => {
    expect(formatNumber('999999999999999999')).toBe('999.999.999.999.999.999');
  });

  it('formats a signed stock difference exactly', () => {
    expect(formatNumber('-1000')).toBe('-1.000');
  });
});
