import { describe, expect, it } from 'vitest';
import {
  normalizeImportHeader,
  proposeHeaderMapping,
} from './header-normalization';

describe('normalizeImportHeader', () => {
  it('normalizes Unicode to NFC and collapses repeated spaces', () => {
    expect(normalizeImportHeader('  Tên   sản phẩm ')).toBe('tên sản phẩm');
  });

  it('does not remove Vietnamese accents', () => {
    expect(normalizeImportHeader('Tên sản phẩm')).not.toBe(
      normalizeImportHeader('Ten san pham'),
    );
  });
});

describe('proposeHeaderMapping', () => {
  it('maps a controlled customer phone alias', () => {
    expect(proposeHeaderMapping('SĐT', 'CUSTOMERS', 2)).toBe('phone');
  });

  it('does not guess an unknown header', () => {
    expect(proposeHeaderMapping('Thông tin khác', 'CUSTOMERS', 2)).toBeNull();
  });

  it('maps an exact official header from the selected contract', () => {
    expect(proposeHeaderMapping('Tên sản phẩm', 'PRODUCTS', 1)).toBe('name');
  });

  it.each([
    'CCCD',
    'Ngày sinh',
    'Giới tính',
    'Facebook',
    'Điểm hiện tại',
    'Nợ cần thu hiện tại',
  ])('marks unsupported customer data as sensitive for %s', (header) => {
    expect(proposeHeaderMapping(header, 'CUSTOMERS', 2)).toBe(
      'IGNORED_SENSITIVE',
    );
  });
});
