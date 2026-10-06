import { formatViDecimal } from '@/shared/lib/numeric/canonical-number';
import type { CatalogStockState, ProductCatalogItem } from './catalog-types';

export function scaledCatalogQuantity(value: string) {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(`${whole}${fraction.padEnd(3, '0').slice(0, 3)}`);
}

export function formatPageStockTotal(items: ProductCatalogItem[]) {
  const total = items.reduce(
    (sum, item) => sum + scaledCatalogQuantity(item.onHandQty),
    0n,
  );
  const absolute = (total < 0n ? -total : total).toString().padStart(4, '0');
  return formatViDecimal(
    `${total < 0n ? '-' : ''}${absolute.slice(0, -3)}.${absolute.slice(-3)}`,
  );
}

export type ProductListFilters = {
  search: string;
  categoryId: string;
  stockState: CatalogStockState;
  includeInactive: boolean;
};
