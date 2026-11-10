import { expect, test, type Page } from '@playwright/test';

const productId = '30000001-0000-4000-8000-000000000001';
const lot = (
  id: string,
  number: string,
  expiry: string,
  days: number,
  qty: string,
  status: string,
) => ({
  lotId: `60000000-0000-4000-8000-00000000000${id}`,
  productId,
  productName: '12B vàng',
  unitName: 'Hộp',
  trackingMode: 'LOT',
  lotNumber: number,
  expiryDate: expiry,
  daysLeft: days,
  quantity: qty,
  status,
});
const list = {
  warningDays: 90,
  trackingMode: 'LOT',
  unassignedQty: '100',
  summary: { expired: 1, expiring: 1, ok: 1 },
  items: [
    lot('1', 'A2510', '2026-10-31', -10, '2', 'EXPIRED'),
    lot('2', 'A2601', '2027-01-31', 82, '3', 'EXPIRING'),
    lot('3', 'A2611', '2027-09-30', 324, '10', 'OK'),
  ],
  unassigned: [
    {
      productId,
      productName: '12B vàng',
      unitName: 'Hộp',
      trackingMode: 'LOT',
      quantity: '100',
    },
  ],
};

async function mock(page: Page) {
  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:5179') return route.continue();
    const name = url.pathname.split('/').at(-1);
    let data: unknown;
    if (name === 'list_product_lots') data = list;
    else if (name === 'get_inventory_features')
      data = {
        lotTrackingEnabled: true,
        expiryWarningDays: 90,
        version: 2,
        trackedProductCount: 1,
      };
    else if (name === 'get_purchase_receipt_lots')
      data = {
        items: [
          {
            productId,
            productName: '12B vàng',
            unitName: 'Hộp',
            receivedQty: '10',
            trackingMode: 'LOT',
            lots: [],
          },
        ],
      };
    else return route.abort();
    return route.fulfill({
      json: {
        ok: true,
        data,
        error: null,
        correlationId: '10000000-0000-4000-8000-000000000002',
      },
    });
  });
}
const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('expiry list, product tracking, purchase lots and the store switch', async ({
  page,
}, testInfo) => {
  await mock(page);
  await page.goto('/e2e/fixtures/lots.html');
  await expect(page.getByText('Hết hạn 10 ngày')).toBeVisible();
  await expect(page.getByText('Còn 82 ngày')).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('expiry.png'),
    fullPage: true,
  });

  await page.goto('/e2e/fixtures/lots.html?path=/product');
  await expect(page.getByRole('button', { name: 'Theo lô' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('100 Hộp')).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('product-tracking.png'),
    fullPage: true,
  });

  await page.goto('/e2e/fixtures/lots.html?path=/purchase');
  await page.getByLabel('Số lô', { exact: true }).fill('A2611');
  await page.getByLabel('Hạn dùng', { exact: true }).fill('2027-09-30');
  await page.getByLabel('Số lượng', { exact: true }).fill('10');
  await expect(page.getByText('10/10 Hộp')).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('purchase-lots.png'),
    fullPage: true,
  });

  await page.goto('/e2e/fixtures/lots.html?path=/settings');
  await expect(page.getByRole('switch')).toBeChecked();
  await page.screenshot({
    path: testInfo.outputPath('settings.png'),
    fullPage: true,
  });
});
