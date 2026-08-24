export { CategoryManagerPage } from './pages/CategoryManagerPage';
export { ProductDetailPage } from './pages/ProductDetailPage';
export { ProductListPage } from './pages/ProductListPage';
export {
  CatalogApiError,
  catalogKeys,
  createCatalogApi,
  type CatalogApi,
} from './api/catalog-api';
export type {
  CatalogPage,
  CategoryOption,
  ProductDetail,
  ProductFormValues,
  ProductCatalogItem,
} from './model/catalog-types';
export { useCatalogRealtime } from './hooks/use-catalog-realtime';
