/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { RequireSession, useSession } from '@/features/auth';

const DashboardPage = lazy(() =>
  import('@/features/dashboard').then((module) => ({
    default: module.DashboardPage,
  })),
);
const ReportPage = lazy(() =>
  import('@/features/reports').then((module) => ({
    default: module.ReportPage,
  })),
);
const SettlementReportPage = lazy(() =>
  import('@/features/reports').then((module) => ({
    default: module.SettlementReportPage,
  })),
);
const CashBookPage = lazy(() =>
  import('@/features/cash-book').then((module) => ({
    default: module.CashBookPage,
  })),
);
const CashShiftPage = lazy(() =>
  import('@/features/cash-book').then((module) => ({
    default: module.CashShiftPage,
  })),
);
const CashVoucherPage = lazy(() =>
  import('@/features/cash-book').then((module) => ({
    default: module.CashVoucherPage,
  })),
);
const InventoryValuationPage = lazy(() =>
  import('@/features/inventory').then((module) => ({
    default: module.InventoryValuationPage,
  })),
);

function HomeAccess() {
  const { session } = useSession();
  return session?.roleTemplate === 'WAREHOUSE_VIEWER' ? (
    <Navigate replace to="/products" />
  ) : (
    <RequireSession permission="dashboard.operational.read" />
  );
}

export const reportRoutes: RouteObject[] = [
  {
    element: <HomeAccess />,
    children: [{ index: true, element: <DashboardPage /> }],
  },
  {
    element: (
      <RequireSession
        permission={['report.own_revenue.read', 'report.all_revenue.read']}
      />
    ),
    children: [
      { path: 'reports', element: <ReportPage /> },
      { path: 'reports/settlements', element: <SettlementReportPage /> },
    ],
  },
  {
    element: (
      <RequireSession permission={['cash.book.read', 'cash.shift.manage']} />
    ),
    children: [{ path: 'cash-book', element: <CashBookPage /> }],
  },
  {
    element: <RequireSession permission="cash.shift.manage" />,
    children: [{ path: 'cash-book/shift', element: <CashShiftPage /> }],
  },
  {
    element: <RequireSession permission="cash.voucher.create" />,
    children: [
      { path: 'cash-book/vouchers/new', element: <CashVoucherPage /> },
    ],
  },
  {
    element: <RequireSession permission="report.cost_profit.read" />,
    children: [
      {
        path: 'more/inventory/valuation',
        element: <InventoryValuationPage />,
      },
    ],
  },
];
