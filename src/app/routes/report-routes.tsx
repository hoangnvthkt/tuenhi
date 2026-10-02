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
    children: [{ path: 'reports', element: <ReportPage /> }],
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
