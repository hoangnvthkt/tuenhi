import { expect, test } from '@playwright/test';
const summary = {
  completedOrderCount: 1,
  soldQuantity: '1',
  grossSales: '55000',
  lineDiscounts: '0',
  orderDiscounts: '0',
  salesReturns: '0',
  cancellations: '0',
  netRevenue: '55000',
  averageOrderValue: '55000',
};
test('dashboard cash, bank and debt cards open the matching dated invoice list', async ({
  context,
  page,
}, testInfo) => {
  const requests: Record<string, unknown>[] = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:5179') return route.continue();
    const name = url.pathname.split('/').at(-1);
    let data: unknown;
    if (name === 'get_operational_dashboard')
      data = {
        version: 1,
        timezone: 'Asia/Ho_Chi_Minh',
        catalog: {
          activeProductCount: 1101,
          lowStockCount: 1099,
          outOfStockCount: 1099,
          totalOnHandQty: '101',
        },
        pending: { purchaseReceipts: 0, stockCounts: 0, saleReturns: 0 },
      };
    else if (name === 'get_revenue_report')
      data = {
        version: 1,
        timezone: 'Asia/Ho_Chi_Minh',
        range: { from: '2026-10-16', to: '2026-10-16' },
        generatedAt: '2026-10-16T01:00:00Z',
        scope: 'ALL',
        summary,
        daily: [],
        channels: [],
        paymentMethods: [],
      };
    else if (name === 'get_owner_dashboard')
      data = {
        version: 1,
        netRevenue: '55000',
        netCogs: '0',
        grossProfit: '55000',
        grossMarginPct: '100',
        inventoryValue: '4040000',
      };
    else if (name === 'get_sale_settlement_report') {
      const request = route.request().postDataJSON();
      requests.push(request);
      data = {
        version: 1,
        range: { from: '2026-10-16', to: '2026-10-16' },
        scope: 'ALL',
        summary: {
          cashAmount: '25000',
          bankTransferAmount: '10000',
          outstandingAmount: '20000',
        },
        items: [
          {
            id: '10000000-0000-4000-8000-000000000001',
            saleNumber: 'HD000004',
            completedAt: '2026-10-16T01:00:00Z',
            customerName: 'Khách 01',
            status: 'COMPLETED',
            cashAmount: '25000',
            bankTransferAmount: '10000',
            outstandingAmount: '20000',
          },
        ],
        nextCursor: null,
      };
    } else return route.abort();
    return route.fulfill({
      json: {
        ok: true,
        data,
        error: null,
        correlationId: '10000000-0000-4000-8000-000000000002',
      },
    });
  });
  await page.goto('/e2e/fixtures/dashboard.html');
  await expect(
    page.getByRole('article', { name: 'Tiền mặt', exact: true }),
  ).toContainText('25.000 ₫');
  await expect(
    page.getByRole('article', { name: 'Nợ còn lại', exact: true }),
  ).toContainText('20.000 ₫');
  await page.screenshot({
    path: testInfo.outputPath('dashboard-settlements.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Nợ còn lại', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Nợ còn lại của các đơn bán' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'HD000004' })).toHaveAttribute(
    'href',
    '/sales/10000000-0000-4000-8000-000000000001',
  );
  expect(requests.at(-1)).toMatchObject({
    p_from: '2026-10-16',
    p_to: '2026-10-16',
    p_scope: 'ALL',
    p_method: 'DEBT',
  });
  await page.getByRole('link', { name: 'Chuyển khoản', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Chuyển khoản từ các đơn bán' }),
  ).toBeVisible();
  expect(requests.at(-1)).toMatchObject({ p_method: 'BANK_TRANSFER' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('settlement-invoices.png'),
    fullPage: true,
  });
});
