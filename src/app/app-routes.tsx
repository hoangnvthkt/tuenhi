import type { RouteObject } from 'react-router';
import { ChangePasswordPage } from '../features/auth/ChangePasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireSession } from '../features/auth/RequireSession';
import { CategoryManagerPage } from '../features/catalog/CategoryManagerPage';
import { ProductDetailPage } from '../features/catalog/ProductDetailPage';
import { ProductListPage } from '../features/catalog/ProductListPage';
import { CustomerPage } from '../features/directories/CustomerPage';
import { SupplierPage } from '../features/directories/SupplierPage';
import { ImportHistoryPage } from '../features/imports/ImportHistoryPage';
import { ImportPage } from '../features/imports/ImportPage';
import { LegacySaleDetailPage } from '../features/legacy-sales/LegacySaleDetailPage';
import { LegacySalesPage } from '../features/legacy-sales/LegacySalesPage';
import { SalesChannelPage } from '../features/settings/SalesChannelPage';
import { StaffPage } from '../features/staff/StaffPage';
import { AppShell } from './layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { FoundationSectionPage } from './pages/FoundationSectionPage';
import { MorePage } from './pages/MorePage';

function foundationPage(title: string) {
  return (
    <FoundationSectionPage
      title={title}
      description={`Phân hệ ${title} sẽ được kích hoạt trong giai đoạn đã được phê duyệt.`}
    />
  );
}

export const appRoutes: RouteObject[] = [
  {
    path: 'login',
    element: <LoginPage />,
  },
  {
    element: <RequireSession />,
    children: [
      { path: 'change-password', element: <ChangePasswordPage /> },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          {
            element: <RequireSession permission="catalog.read" />,
            children: [
              { path: 'products', element: <ProductListPage /> },
              {
                path: 'products/:productId',
                element: <ProductDetailPage />,
              },
            ],
          },
          {
            element: <RequireSession permission="catalog.basic.manage" />,
            children: [
              {
                path: 'products/new',
                element: <ProductDetailPage mode="create" />,
              },
              {
                path: 'products/categories',
                element: <CategoryManagerPage />,
              },
              {
                path: 'products/:productId/edit',
                element: <ProductDetailPage mode="edit" />,
              },
            ],
          },
          { path: 'pos', element: foundationPage('Bán hàng') },
          { path: 'sales', element: foundationPage('Hóa đơn') },
          { path: 'more', element: <MorePage /> },
          {
            element: (
              <RequireSession
                permission={[
                  'catalog.basic.manage',
                  'supplier.manage',
                  'customer.manage',
                  'legacy.sale.import',
                ]}
              />
            ),
            children: [
              { path: 'imports', element: <ImportPage /> },
              { path: 'imports/history', element: <ImportHistoryPage /> },
              {
                path: 'imports/:importRunId',
                element: <ImportHistoryPage />,
              },
            ],
          },
          {
            element: <RequireSession permission="legacy.sale.read" />,
            children: [
              { path: 'legacy-sales', element: <LegacySalesPage /> },
              {
                path: 'legacy-sales/:legacySaleId',
                element: <LegacySaleDetailPage />,
              },
            ],
          },
          {
            element: (
              <RequireSession
                permission={['supplier.read', 'supplier.manage']}
              />
            ),
            children: [{ path: 'more/suppliers', element: <SupplierPage /> }],
          },
          {
            element: (
              <RequireSession
                permission={['customer.read', 'customer.manage']}
              />
            ),
            children: [{ path: 'more/customers', element: <CustomerPage /> }],
          },
          {
            element: <RequireSession permission="settings.manage" />,
            children: [
              {
                path: 'more/sales-channels',
                element: <SalesChannelPage />,
              },
            ],
          },
          {
            element: <RequireSession permission="staff.manage" />,
            children: [{ path: 'staff', element: <StaffPage /> }],
          },
          { path: '*', element: foundationPage('Không tìm thấy trang') },
        ],
      },
    ],
  },
];
