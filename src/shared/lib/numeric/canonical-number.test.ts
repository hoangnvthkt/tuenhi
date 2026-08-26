import { describe, expect, it } from 'vitest';
import {
  INTEGER_FINAL,
  MONEY_EDITING,
  MONEY_FINAL,
  QUANTITY_EDITING,
  QUANTITY_FINAL,
  compareCanonicalNumbers,
  formatViNumber,
  formatViDecimal,
  incrementCanonicalInteger,
  normalizeCanonicalNumber,
  validateCanonicalNumber,
} from './canonical-number';

describe('canonical numeric grammars', () => {
  it.each(['0', '1', '25'])('accepts final integer %s', (value) => {
    expect(INTEGER_FINAL.test(value)).toBe(true);
  });

  it.each(['0', '1', '0.1', '1.25'])('accepts final money %s', (value) => {
    expect(MONEY_FINAL.test(value)).toBe(true);
  });

  it.each(['0', '1', '1000'])('accepts final quantity %s', (value) => {
    expect(QUANTITY_FINAL.test(value)).toBe(true);
  });

  it.each(['0.1', '1.000', '1.5'])('rejects decimal quantity %s', (value) => {
    expect(QUANTITY_FINAL.test(value)).toBe(false);
  });

  it.each(['', '0.', '12.'])('accepts money editing state %j', (value) => {
    expect(MONEY_EDITING.test(value)).toBe(true);
  });

  it.each(['', '0', '12'])('accepts quantity editing state %j', (value) => {
    expect(QUANTITY_EDITING.test(value)).toBe(true);
  });

  it.each(['0.', '12.', '12.5'])(
    'rejects decimal quantity while editing %j',
    (value) => {
      expect(QUANTITY_EDITING.test(value)).toBe(false);
    },
  );

  it.each([
    '.5',
    '01',
    '1,5',
    '1 000',
    '+1',
    '-1',
    '1e3',
    '1E3',
    '1đ',
    '1 kg',
    '١٢',
    '１２',
  ])('rejects forbidden money representation %j', (value) => {
    expect(
      validateCanonicalNumber(value, { kind: 'money', precision: 20 }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });
});

describe('validateCanonicalNumber', () => {
  it('classifies excessive decimal scale', () => {
    expect(
      validateCanonicalNumber('1.234', { kind: 'money', precision: 20 }),
    ).toEqual({
      ok: false,
      code: 'NUMBER_SCALE_EXCEEDED',
      message: 'Số chữ số sau dấu chấm vượt quá giới hạn cho phép.',
    });
  });

  it.each([
    [
      'money numeric(20,2)',
      '1234567890123456789',
      { kind: 'money', precision: 20 },
    ],
    [
      'unit price numeric(18,2)',
      '12345678901234567',
      { kind: 'money', precision: 18 },
    ],
    [
      'quantity numeric(18,0)',
      '1234567890123456789',
      { kind: 'quantity', precision: 18 },
    ],
  ] as const)('rejects integer digits beyond %s', (_label, value, options) => {
    expect(validateCanonicalNumber(value, options)).toEqual({
      ok: false,
      code: 'NUMBER_RANGE_EXCEEDED',
      message: 'Giá trị vượt quá giới hạn hệ thống cho phép.',
    });
  });

  it('keeps an empty optional value empty', () => {
    expect(
      validateCanonicalNumber('', {
        kind: 'quantity',
        precision: 18,
        required: false,
      }),
    ).toEqual({ ok: true, value: '' });
  });

  it('requires a value when configured', () => {
    expect(
      validateCanonicalNumber('', {
        kind: 'money',
        precision: 20,
        required: true,
      }),
    ).toEqual({
      ok: false,
      code: 'NUMBER_REQUIRED',
      message: 'Vui lòng nhập giá trị.',
    });
  });
});

describe('integer quantity helpers', () => {
  it('increments a large canonical quantity without Number precision loss', () => {
    expect(incrementCanonicalInteger('999999999999999999')).toBe(
      '1000000000000000000',
    );
  });
});

describe('formatViNumber', () => {
  it('formats without changing the canonical value or losing large digits', () => {
    expect(formatViNumber('123456789012345678.50')).toBe(
      '123.456.789.012.345.678,5',
    );
  });
});

describe('formatViDecimal', () => {
  it('formats signed, large canonical decimals without Number precision loss', () => {
    expect(formatViDecimal('-123456789012345678.50', 2)).toBe(
      '-123.456.789.012.345.678,5',
    );
  });

  it('limits visible fractional digits without changing the integer part', () => {
    expect(formatViDecimal('1000.987', 2)).toBe('1.000,99');
  });
});

describe('normalizeCanonicalNumber', () => {
  it.each([
    ['1.000', '1'],
    ['1.500', '1.5'],
    ['1000', '1000'],
    ['0.000', '0'],
  ])(
    'removes only insignificant trailing zeroes from %s',
    (value, expected) => {
      expect(normalizeCanonicalNumber(value)).toBe(expected);
    },
  );
});

describe('compareCanonicalNumbers', () => {
  it.each([
    ['1.000', '1', 0],
    ['1.500', '1.499', 1],
    ['0.001', '0.010', -1],
    ['100000000000000.001', '99999999999999.999', 1],
  ])(
    'compares canonical decimals without converting %s and %s to Number',
    (left, right, expected) => {
      expect(compareCanonicalNumbers(left, right)).toBe(expected);
    },
  );
});
