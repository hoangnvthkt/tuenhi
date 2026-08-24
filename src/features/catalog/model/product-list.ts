import type { CatalogStockState } from './catalog-types';

export type ProductListFilters = {
  search: string;
  categoryId: string;
  stockState: CatalogStockState;
  includeInactive: boolean;
};
