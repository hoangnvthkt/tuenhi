import { describe, expect, it } from 'vitest';
import { parseProductContextUrl, parseSupplierContextUrl } from './context-url';

const supplierId = '10000000-0000-4000-8000-000000000002';
const productId = '10000000-0000-4000-8000-000000000001';

describe('connected explorer URL contracts', () => {
  it('defaults an invalid product tab and removes invalid filters', () => {
    const result = parseProductContextUrl(
      new URLSearchParams('tab=unknown&supplierId=bad&from=2026-02-31&to=bad'),
    );
    expect(result.value).toEqual({
      tab: 'overview',
      supplierId: null,
      from: null,
      to: null,
    });
    expect(result.canonical.toString()).toBe('');
    expect(result.changed).toBe(true);
  });

  it('preserves valid product history context', () => {
    const result = parseProductContextUrl(
      new URLSearchParams(
        `tab=purchases&supplierId=${supplierId}&from=2026-01-01&to=2026-12-31`,
      ),
    );
    expect(result.value).toEqual({
      tab: 'purchases',
      supplierId,
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(result.changed).toBe(false);
  });

  it('normalizes supplier search and removes a date range longer than 366 days', () => {
    const result = parseSupplierContextUrl(
      new URLSearchParams(
        `tab=products&q=${encodeURIComponent(`  ${'a'.repeat(205)}  `)}&productId=${productId}&from=2025-01-01&to=2026-12-31`,
      ),
    );
    expect(result.value.q).toHaveLength(200);
    expect(result.value.productId).toBe(productId);
    expect(result.value.from).toBeNull();
    expect(result.value.to).toBeNull();
    expect(result.changed).toBe(true);
  });
});
