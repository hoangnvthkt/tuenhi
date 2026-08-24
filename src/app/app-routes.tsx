import type { RouteObject } from 'react-router';
import { ChangePasswordPage, LoginPage, RequireSession } from '@/features/auth';
import {
  CategoryManagerPage,
  ProductDetailPage,
  ProductListPage,
} from '@/features/catalog';
import { CustomerPage, SupplierPage } from '@/features/directories';
import { ImportHistoryPage } from '../features/imports/ImportHistoryPage';
import { ImportPage } from '../features/imports/ImportPage';
import { LegacySaleDetailPage } from '../features/legacy-sales/LegacySaleDetailPage';
import { LegacySalesPage } from '../features/legacy-sales/LegacySalesPage';
import { SalesChannelPage, StoreSettingsPage } from '@/features/settings';
import { InventoryValuationPage } from '../features/inventory/InventoryValuationPage';
import { OpeningDetailPage } from '../features/inventory/OpeningDetailPage';
import { OpeningListPage } from '../features/inventory/OpeningListPage';
import { PurchaseDetailPage } from '../features/inventory/PurchaseDetailPage';
import { PurchaseListPage } from '../features/inventory/PurchaseListPage';
import { StaffPage } from '@/features/staff';
import { PosPage, SaleDetailPage, SalesListPage } from '@/features/sales';
import {
  ReturnCreatePage,
  ReturnDetailPage,
  ReturnListPage,
} from '@/features/returns';
import { StockCountDetailPage } from '../features/inventory/StockCountDetailPage';
import { StockCountListPage } from '../features/inventory/StockCountListPage';
import { ReportPage } from '@/features/reports';
import { AppShell } from './layout/AppShell';
import { DashboardPage } from '@/features/dashboard';
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
          {
            element: <RequireSession permission="dashboard.operational.read" />,
            children: [{ index: true, element: <DashboardPage /> }],
          },
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
              {
                path: 'stock-counts/:countId',
                element: <StockCountDetailPage />,
              },
            ],
          },
          { path: 'more', element: <MorePage /> },
          {
            element: (
              <RequireSession
                permission={[
                  'report.own_revenue.read',
                  'report.all_revenue.read',
                ]}
              />
            ),
            children: [{ path: 'reports', element: <ReportPage /> }],
          },
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
                permission={[
                  'purchase.operational.read',
                  'purchase.draft.manage',
                  'purchase.cost.read',
                ]}
              />
            ),
            children: [
              { path: 'more/purchases', element: <PurchaseListPage /> },
              {
                path: 'more/purchases/:receiptId',
                element: <PurchaseDetailPage />,
              },
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
              {
                path: 'more/inventory/opening',
                element: <OpeningListPage />,
              },
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
          {
            element: <RequireSession permission="report.cost_profit.read" />,
            children: [
              {
                path: 'more/inventory/valuation',
                element: <InventoryValuationPage />,
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
              { path: 'more/store-settings', element: <StoreSettingsPage /> },
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
