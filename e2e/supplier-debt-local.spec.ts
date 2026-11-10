import { expect, test, type Page } from '@playwright/test';

const supplier = {
  id: '20000000-0000-4000-8000-000000000001',
  code: 'LC',
  name: 'Dược phẩm Long Châu',
};
const receiptId = '40000000-0000-4000-8000-000000000002';
const productId = '30000001-0000-4000-8000-000000000001';
const debt = {
  supplier,
  balance: '200000.00',
  version: 2,
  hasOpening: false,
  openPayables: [
    {
      payableId: '60000000-0000-4000-8000-000000000001',
      kind: 'RECEIPT',
      receiptId,
      receiptNumber: 'PN000002',
      openedAt: '2026-09-15T03:00:00Z',
      totalAmount: '200000.00',
      paidAmount: '0.00',
      returnedAmount: '0.00',
      outstandingAmount: '200000.00',
    },
  ],
  entries: [
    {
      id: '70000000-0000-4000-8000-000000000001',
      kind: 'RECEIPT_POSTED',
      delta: '200000.00',
      balanceAfter: '200000.00',
      cashAmount: '0.00',
      bankTransferAmount: '0.00',
      note: null,
      receiptId,
      receiptNumber: 'PN000002',
      returnNumber: null,
      actorName: 'Admin',
      occurredAt: '2026-09-15T03:00:00Z',
    },
  ],
};
const product = {
  id: productId,
  sku: '12BV',
  barcode: null,
  name: '12B vàng',
  categoryId: null,
  categoryName: null,
  unitName: 'Hộp',
  minStockQty: '0',
  effectiveMinStockQty: '50',
  isActive: true,
  version: 1,
  primaryImagePath: null,
  currentSalePrice: null,
  defaultCost: null,
  onHandQty: '100',
};

async function mock(page: Page, requests: Record<string, unknown>[]) {
  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:5179') return route.continue();
    const name = url.pathname.split('/').at(-1);
    let data: unknown;
    if (name === 'get_supplier_debts')
      data = {
        summary: {
          totalPayable: '200000.00',
          supplierCount: 1,
          openPayableCount: 1,
          paidThisMonth: '0',
          returnedThisMonth: '0',
          returnCountThisMonth: 0,
        },
        items: [
          {
            supplierId: supplier.id,
            code: 'LC',
            name: supplier.name,
            balance: '200000.00',
            openCount: 1,
            oldestOpenAt: '2026-09-15T03:00:00Z',
            version: 2,
          },
        ],
      };
    else if (name === 'get_supplier_debt') data = debt;
    else if (name === 'get_purchase_return_options')
      data = {
        receiptId,
        receiptNumber: 'PN000002',
        status: 'POSTED',
        receivedAt: '2026-09-15T03:00:00Z',
        supplier,
        outstandingAmount: '200000.00',
        lines: [
          {
            receiptLineId: '80000000-0000-4000-8000-000000000001',
            productId,
            productName: '12B Akopha Pháp',
            unitName: 'Hộp',
            receivedQty: '5',
            returnedQty: '0',
            onHandQty: '1',
            maxQty: '1',
            unitCost: '40000.00',
            lineCost: '200000.00',
            returnedAmount: '0',
          },
        ],
        returns: [],
      };
    else if (name === 'get_product_catalog')
      data = { items: [product], nextCursor: null };
    else if (name === 'get_write_off_products')
      data = {
        items: [
          {
            productId,
            name: '12B vàng',
            sku: '12BV',
            unitName: 'Hộp',
            onHandQty: '100',
            avgUnitCost: '40000.00',
            avgUnitCostExact: '40000.000000',
            inventoryValue: '4000000.00',
          },
        ],
      };
    else if (name === 'list_stock_write_offs') data = { items: [] };
    else if (name === 'pay_supplier_debt') {
      requests.push(route.request().postDataJSON());
      data = { supplierId: supplier.id, balance: '100000.00', version: 3 };
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
}
const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('supplier debt, payment, purchase return and write-off screens', async ({
  page,
}, testInfo) => {
  const requests: Record<string, unknown>[] = [];
  await mock(page, requests);
  await page.goto('/e2e/fixtures/supplier-debt.html');
  await expect(page.getByText('Phải trả NCC')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'LC · Dược phẩm Long Châu' }),
  ).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('supplier-debts.png'),
    fullPage: true,
  });

  await page.getByRole('link', { name: 'Trả nợ NCC' }).click();
  await page.getByLabel('Tiền mặt').fill('100000');
  await expect(page.getByText('PN000002 · 15/09')).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('supplier-pay.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Lưu và lập phiếu chi' }).click();
  await expect
    .poll(() => requests.at(-1))
    .toMatchObject({
      p_cash_amount: '100000',
      p_bank_transfer_amount: '0',
      p_expected_version: 2,
    });

  await page.goto(
    `/e2e/fixtures/supplier-debt.html?path=/more/purchases/${receiptId}/return`,
  );
  await page.getByLabel('Số lượng trả').fill('1');
  await page.getByLabel('Lý do').fill('Lỗi bao bì');
  await expect(
    page.getByRole('button', { name: 'Ghi sổ trả hàng' }),
  ).toBeEnabled();
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('purchase-return.png'),
    fullPage: true,
  });

  await page.goto('/e2e/fixtures/supplier-debt.html?path=/more/write-offs');
  await page.getByRole('combobox').first().click();
  await page.getByRole('combobox').first().fill('12B');
  await page.getByRole('option', { name: /12B vàng/ }).click();
  await page.getByLabel('Số lượng hủy').fill('2');
  await expect(page.getByText('80.000 ₫')).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('write-off.png'),
    fullPage: true,
  });
});
