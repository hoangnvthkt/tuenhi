/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react';
import type { RouteObject } from 'react-router';
import { RequireSession } from '@/features/auth';

const ImportPage = lazy(() =>
  import('@/features/imports').then((module) => ({
    default: module.ImportPage,
  })),
);
const ImportHistoryPage = lazy(() =>
  import('@/features/imports').then((module) => ({
    default: module.ImportHistoryPage,
  })),
);
const LegacySalesPage = lazy(() =>
  import('@/features/legacy-sales').then((module) => ({
    default: module.LegacySalesPage,
  })),
);
const LegacySaleDetailPage = lazy(() =>
  import('@/features/legacy-sales').then((module) => ({
    default: module.LegacySaleDetailPage,
  })),
);
const SupplierPage = lazy(() =>
  import('@/features/directories').then((module) => ({
    default: module.SupplierPage,
  })),
);
const CustomerPage = lazy(() =>
  import('@/features/directories').then((module) => ({
    default: module.CustomerPage,
  })),
);
const SalesChannelPage = lazy(() =>
  import('@/features/settings').then((module) => ({
    default: module.SalesChannelPage,
  })),
);
const StoreSettingsPage = lazy(() =>
  import('@/features/settings').then((module) => ({
    default: module.StoreSettingsPage,
  })),
);
const StaffPage = lazy(() =>
  import('@/features/staff').then((module) => ({ default: module.StaffPage })),
);

export const administrationRoutes: RouteObject[] = [
  {
    element: (
      <RequireSession
        permission={[
          'catalog.basic.manage',
          'supplier.manage',
          'customer.manage',
          'legacy.sale.import',
          'inventory.adjustment.post',
        ]}
      />
    ),
    children: [
      { path: 'imports', element: <ImportPage /> },
      { path: 'imports/history', element: <ImportHistoryPage /> },
      { path: 'imports/:importRunId', element: <ImportHistoryPage /> },
    ],
  },
  {
    element: <RequireSession permission="legacy.sale.read" />,
    children: [
      { path: 'legacy-sales', element: <LegacySalesPage /> },
      { path: 'legacy-sales/:legacySaleId', element: <LegacySaleDetailPage /> },
    ],
  },
  {
    element: (
      <RequireSession permission={['supplier.read', 'supplier.manage']} />
    ),
    children: [{ path: 'more/suppliers', element: <SupplierPage /> }],
  },
  {
    element: (
      <RequireSession permission={['customer.read', 'customer.manage']} />
    ),
    children: [{ path: 'more/customers', element: <CustomerPage /> }],
  },
  {
    element: <RequireSession permission="settings.manage" />,
    children: [
      { path: 'more/sales-channels', element: <SalesChannelPage /> },
      { path: 'more/store-settings', element: <StoreSettingsPage /> },
    ],
  },
  {
    element: <RequireSession permission="staff.manage" />,
    children: [{ path: 'staff', element: <StaffPage /> }],
  },
];
