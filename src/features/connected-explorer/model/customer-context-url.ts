const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type CustomerContextTab = 'overview' | 'sales' | 'returns' | 'products';

function validDate(value: string | null) {
  if (!value || !ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

function validRange(from: string | null, to: string | null) {
  if (!from || !to) return { from, to };
  const days =
    (new Date(`${to}T00:00:00Z`).valueOf() -
      new Date(`${from}T00:00:00Z`).valueOf()) /
    86_400_000;
  return days >= 0 && days <= 365 ? { from, to } : { from: null, to: null };
}

export function parseCustomerContextUrl(input: URLSearchParams) {
  const requestedTab = input.get('tab');
  const tab: CustomerContextTab =
    requestedTab === 'sales' ||
    requestedTab === 'returns' ||
    requestedTab === 'products'
      ? requestedTab
      : 'overview';
  const rawSearch = input.get('q')?.trim() ?? '';
  const q =
    tab === 'products' && rawSearch.length > 0 && rawSearch.length <= 200
      ? rawSearch
      : '';
  const range = validRange(
    validDate(input.get('from')),
    validDate(input.get('to')),
  );
  const canonical = new URLSearchParams();
  if (tab !== 'overview') canonical.set('tab', tab);
  if (q) canonical.set('q', q);
  if (range.from) canonical.set('from', range.from);
  if (range.to) canonical.set('to', range.to);
  return {
    value: { tab, q, ...range },
    canonical,
    changed: input.toString() !== canonical.toString(),
  };
}
