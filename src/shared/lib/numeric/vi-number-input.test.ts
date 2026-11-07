import { describe, expect, it } from 'vitest';
import {
  canonicalToViNumberInput,
  caretAfterSignificant,
  formatViNumberInput,
  sameCanonicalNumber,
  significantBefore,
  viNumberInputToCanonical,
} from './vi-number-input';

describe('formatViNumberInput', () => {
  it.each([
    ['50000', 2, '50.000'],
    ['1234567', 0, '1.234.567'],
    ['50.000', 2, '50.000'],
    ['1.500.000', 2, '1.500.000'],
    ['35680,', 2, '35.680,'],
    ['35.680,5', 2, '35.680,5'],
    ['1234,56', 2, '1.234,56'],
    ['0,5', 2, '0,5'],
    [',5', 2, '0,5'],
    ['007', 0, '7'],
    ['', 2, ''],
    ['55.000 ₫', 2, '55.000'],
  ])('%s → %s', (raw, fraction, expected) => {
    expect(formatViNumberInput(raw, fraction)).toBe(expected);
  });

  it('treats a dot as a thousands separator, never as decimals', () => {
    // Old inputs stored "50.00" as 50 dong; now the person sees 5.000 at once.
    expect(formatViNumberInput('50.00', 2)).toBe('5.000');
    expect(formatViNumberInput('12.5', 0)).toBe('125');
  });

  it('understands pasted English numbers', () => {
    expect(formatViNumberInput('1,234.5', 2)).toBe('1.234,5');
    expect(formatViNumberInput('50,000', 2)).toBe('50.000');
    expect(formatViNumberInput('1,234,567', 0)).toBe('1.234.567');
  });

  it('keeps a comma as decimals when it cannot be a thousands group', () => {
    expect(formatViNumberInput('12,5', 0)).toBe('12,5');
    expect(formatViNumberInput('1,2345', 2)).toBe('1,2345');
  });
});

describe('canonical conversion', () => {
  it.each([
    ['1.234,5', '1234.5'],
    ['35.680,', '35680.'],
    ['50.000', '50000'],
    ['', ''],
  ])('%s → %s', (display, canonical) => {
    expect(viNumberInputToCanonical(display)).toBe(canonical);
  });

  it.each([
    ['1234.5', '1.234,5'],
    ['150000.00', '150.000'],
    ['35680.', '35.680,'],
    ['0', '0'],
    ['', ''],
  ])('%s shows as %s', (canonical, display) => {
    expect(canonicalToViNumberInput(canonical)).toBe(display);
  });

  it('compares numbers, not spellings', () => {
    expect(sameCanonicalNumber('150000.00', '150000')).toBe(true);
    expect(sameCanonicalNumber('1.0', '1.')).toBe(true);
    expect(sameCanonicalNumber('1.5', '1.50')).toBe(true);
    expect(sameCanonicalNumber('15', '1.5')).toBe(false);
  });
});

describe('caret', () => {
  it('stays after the same digit when dots are inserted', () => {
    const raw = '50000';
    const display = formatViNumberInput(raw, 2);
    expect(caretAfterSignificant(display, significantBefore(raw, 5))).toBe(6);
    expect(caretAfterSignificant(display, significantBefore(raw, 2))).toBe(2);
  });
});
