/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react';
import type { RouteObject } from 'react-router';
import { RequireSession } from '@/features/auth';

const ProductListPage = lazy(() =>
  import('@/features/catalog').then((module) => ({
    default: module.ProductListPage,
  })),
);
const ProductDetailPage = lazy(() =>
  import('@/features/catalog').then((module) => ({
    default: module.ProductDetailPage,
  })),
);
const CategoryManagerPage = lazy(() =>
  import('@/features/catalog').then((module) => ({
    default: module.CategoryManagerPage,
  })),
);

export const catalogRoutes: RouteObject[] = [
  {
    element: <RequireSession permission="catalog.read" />,
    children: [
      { path: 'products', element: <ProductListPage /> },
      { path: 'products/:productId', element: <ProductDetailPage /> },
    ],
  },
  {
    element: <RequireSession permission="catalog.basic.manage" />,
    children: [
      { path: 'products/new', element: <ProductDetailPage mode="create" /> },
      { path: 'products/categories', element: <CategoryManagerPage /> },
      {
        path: 'products/:productId/edit',
        element: <ProductDetailPage mode="edit" />,
      },
    ],
  },
];
