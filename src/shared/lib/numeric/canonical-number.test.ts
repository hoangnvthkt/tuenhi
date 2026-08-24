import { describe, expect, it } from 'vitest';
import {
  INTEGER_FINAL,
  MONEY_EDITING,
  MONEY_FINAL,
  QUANTITY_EDITING,
  QUANTITY_FINAL,
  formatViNumber,
  validateCanonicalNumber,
} from './canonical-number';

describe('canonical numeric grammars', () => {
  it.each(['0', '1', '25'])('accepts final integer %s', (value) => {
    expect(INTEGER_FINAL.test(value)).toBe(true);
  });

  it.each(['0', '1', '0.1', '1.25'])('accepts final money %s', (value) => {
    expect(MONEY_FINAL.test(value)).toBe(true);
  });

  it.each(['0', '1', '0.1', '1.234'])('accepts final quantity %s', (value) => {
    expect(QUANTITY_FINAL.test(value)).toBe(true);
  });

  it.each(['', '0.', '12.'])('accepts money editing state %j', (value) => {
    expect(MONEY_EDITING.test(value)).toBe(true);
  });

  it.each(['', '0.', '12.'])('accepts quantity editing state %j', (value) => {
    expect(QUANTITY_EDITING.test(value)).toBe(true);
  });

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
      'quantity numeric(18,3)',
      '1234567890123456',
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

describe('formatViNumber', () => {
  it('formats without changing the canonical value or losing large digits', () => {
    expect(formatViNumber('123456789012345678.50')).toBe(
      '123.456.789.012.345.678,5',
    );
  });
});
