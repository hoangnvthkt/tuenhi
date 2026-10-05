export type ProductFormValues = {
  sku: string;
  barcode: string;
  name: string;
  categoryId: string;
  unitName: string;
  description: string;
  minStockQty: string;
  salePrice: string;
  defaultCost?: string;
  isActive: boolean;
};

export type CatalogStockState =
  'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export type CategoryOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export type ProductCatalogItem = {
  /** Server-derived alert threshold; minStockQty remains the editable configuration. */
  effectiveMinStockQty?: string;
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  unitName: string;
  minStockQty: string;
  isActive: boolean;
  version: number;
  primaryImagePath: string | null;
  currentSalePrice: string | null;
  defaultCost?: string | null;
  onHandQty: string;
};

export type ProductDetail = ProductCatalogItem & {
  description: string | null;
  salePriceValidFrom: string | null;
  images: Array<{
    id: string;
    objectPath: string;
    sortOrder: number;
    isPrimary: boolean;
  }>;
};

export type CatalogCursor = { name: string; id: string };

export type CatalogPage = {
  items: ProductCatalogItem[];
  nextCursor: CatalogCursor | null;
};
