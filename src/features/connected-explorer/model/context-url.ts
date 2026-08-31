const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ProductContextTab = 'overview' | 'suppliers' | 'purchases';
export type SupplierContextTab = 'overview' | 'products' | 'purchases';

function validDate(value: string | null) {
  if (!value || !ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

function validUuid(value: string | null) {
  return value && UUID.test(value) ? value : null;
}

function validRange(from: string | null, to: string | null) {
  if (!from || !to) return { from, to };
  const days =
    (new Date(`${to}T00:00:00Z`).valueOf() -
      new Date(`${from}T00:00:00Z`).valueOf()) /
    86_400_000;
  return days >= 0 && days <= 365 ? { from, to } : { from: null, to: null };
}

function finish<T>(
  input: URLSearchParams,
  canonical: URLSearchParams,
  value: T,
) {
  return {
    value,
    canonical,
    changed: input.toString() !== canonical.toString(),
  };
}

export function parseProductContextUrl(input: URLSearchParams) {
  const requestedTab = input.get('tab');
  const tab: ProductContextTab =
    requestedTab === 'suppliers' || requestedTab === 'purchases'
      ? requestedTab
      : 'overview';
  const supplierId = validUuid(input.get('supplierId'));
  const range = validRange(
    validDate(input.get('from')),
    validDate(input.get('to')),
  );
  const canonical = new URLSearchParams();
  if (tab !== 'overview') canonical.set('tab', tab);
  if (supplierId) canonical.set('supplierId', supplierId);
  if (range.from) canonical.set('from', range.from);
  if (range.to) canonical.set('to', range.to);
  return finish(input, canonical, { tab, supplierId, ...range });
}

export function parseSupplierContextUrl(input: URLSearchParams) {
  const requestedTab = input.get('tab');
  const tab: SupplierContextTab =
    requestedTab === 'products' || requestedTab === 'purchases'
      ? requestedTab
      : 'overview';
  const rawSearch = input.get('q');
  const q = rawSearch ? rawSearch.trim().slice(0, 200) : '';
  const productId = validUuid(input.get('productId'));
  const range = validRange(
    validDate(input.get('from')),
    validDate(input.get('to')),
  );
  const canonical = new URLSearchParams();
  if (tab !== 'overview') canonical.set('tab', tab);
  if (q) canonical.set('q', q);
  if (productId) canonical.set('productId', productId);
  if (range.from) canonical.set('from', range.from);
  if (range.to) canonical.set('to', range.to);
  return finish(input, canonical, { tab, q, productId, ...range });
}
