/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react';
import type { RouteObject } from 'react-router';
import { RequireSession } from '@/features/auth';

const PosPage = lazy(() =>
  import('@/features/sales').then((module) => ({ default: module.PosPage })),
);
const SalesListPage = lazy(() =>
  import('@/features/sales').then((module) => ({
    default: module.SalesListPage,
  })),
);
const SaleDetailPage = lazy(() =>
  import('@/features/sales').then((module) => ({
    default: module.SaleDetailPage,
  })),
);
const ReturnListPage = lazy(() =>
  import('@/features/returns').then((module) => ({
    default: module.ReturnListPage,
  })),
);
const ReturnCreatePage = lazy(() =>
  import('@/features/returns').then((module) => ({
    default: module.ReturnCreatePage,
  })),
);
const ReturnDetailPage = lazy(() =>
  import('@/features/returns').then((module) => ({
    default: module.ReturnDetailPage,
  })),
);
const StockCountListPage = lazy(() =>
  import('@/features/inventory').then((module) => ({
    default: module.StockCountListPage,
  })),
);
const StockCountDetailPage = lazy(() =>
  import('@/features/inventory').then((module) => ({
    default: module.StockCountDetailPage,
  })),
);
const PurchaseListPage = lazy(() =>
  import('@/features/inventory').then((module) => ({
    default: module.PurchaseListPage,
  })),
);
const PurchaseDetailPage = lazy(() =>
  import('@/features/inventory').then((module) => ({
    default: module.PurchaseDetailPage,
  })),
);
const OpeningListPage = lazy(() =>
  import('@/features/inventory').then((module) => ({
    default: module.OpeningListPage,
  })),
);
const OpeningDetailPage = lazy(() =>
  import('@/features/inventory').then((module) => ({
    default: module.OpeningDetailPage,
  })),
);

export const operationRoutes: RouteObject[] = [
  {
    element: <RequireSession permission="sale.draft.manage" />,
    children: [
      { path: 'pos', element: <PosPage /> },
      { path: 'pos/:saleId', element: <PosPage /> },
    ],
  },
  {
    element: <RequireSession permission="sale.own.read" />,
    children: [
      { path: 'sales', element: <SalesListPage /> },
      { path: 'sales/:saleId', element: <SaleDetailPage /> },
    ],
  },
  {
    element: <RequireSession permission="return.request.create" />,
    children: [
      { path: 'returns', element: <ReturnListPage /> },
      { path: 'returns/new', element: <ReturnCreatePage /> },
      { path: 'returns/:returnId', element: <ReturnDetailPage /> },
      { path: 'sales/:saleId/return', element: <ReturnCreatePage /> },
    ],
  },
  {
    element: <RequireSession permission="inventory.count.draft" />,
    children: [
      { path: 'stock-counts', element: <StockCountListPage /> },
      {
        path: 'stock-counts/new',
        element: <StockCountDetailPage mode="create" />,
      },
      { path: 'stock-counts/:countId', element: <StockCountDetailPage /> },
    ],
  },
  {
    element: (
      <RequireSession
        permission={[
          'purchase.operational.read',
          'purchase.draft.manage',
          'purchase.cost.read',
        ]}
      />
    ),
    children: [
      { path: 'more/purchases', element: <PurchaseListPage /> },
      { path: 'more/purchases/:receiptId', element: <PurchaseDetailPage /> },
    ],
  },
  {
    element: <RequireSession permission="purchase.draft.manage" />,
    children: [
      {
        path: 'more/purchases/new',
        element: <PurchaseDetailPage mode="create" />,
      },
    ],
  },
  {
    element: <RequireSession permission="inventory.adjustment.post" />,
    children: [
      { path: 'more/inventory/opening', element: <OpeningListPage /> },
      {
        path: 'more/inventory/opening/new',
        element: <OpeningDetailPage mode="create" />,
      },
      {
        path: 'more/inventory/opening/:countId',
        element: <OpeningDetailPage />,
      },
    ],
  },
];
