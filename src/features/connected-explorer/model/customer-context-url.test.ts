import { describe, expect, it } from 'vitest';
import { parseCustomerContextUrl } from './customer-context-url';

describe('customer context URL contract', () => {
  it('defaults to lifetime overview and removes unrelated parameters', () => {
    const result = parseCustomerContextUrl(
      new URLSearchParams('tab=unknown&q=ao&private=1'),
    );
    expect(result.value).toEqual({
      tab: 'overview',
      q: '',
      from: null,
      to: null,
    });
    expect(result.canonical.toString()).toBe('');
    expect(result.changed).toBe(true);
  });

  it('preserves a one-sided date filter on non-product tabs', () => {
    const result = parseCustomerContextUrl(
      new URLSearchParams('tab=sales&from=2026-09-01'),
    );
    expect(result.value).toEqual({
      tab: 'sales',
      q: '',
      from: '2026-09-01',
      to: null,
    });
    expect(result.changed).toBe(false);
  });

  it('keeps trimmed product search and a 366-day inclusive range', () => {
    const result = parseCustomerContextUrl(
      new URLSearchParams(
        'tab=products&q=%20ao%20&from=2026-01-01&to=2027-01-01',
      ),
    );
    expect(result.value).toEqual({
      tab: 'products',
      q: 'ao',
      from: '2026-01-01',
      to: '2027-01-01',
    });
    expect(result.canonical.toString()).toBe(
      'tab=products&q=ao&from=2026-01-01&to=2027-01-01',
    );
    expect(result.changed).toBe(true);
  });

  it('removes invalid dates, reversed ranges and overlong product search', () => {
    const result = parseCustomerContextUrl(
      new URLSearchParams(
        `tab=products&q=${'a'.repeat(201)}&from=2026-02-01&to=2025-01-01`,
      ),
    );
    expect(result.value).toEqual({
      tab: 'products',
      q: '',
      from: null,
      to: null,
    });
    expect(result.canonical.toString()).toBe('tab=products');
    expect(result.changed).toBe(true);
  });
});
