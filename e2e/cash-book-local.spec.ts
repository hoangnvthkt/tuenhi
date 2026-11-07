import { expect, test } from '@playwright/test';

const shift = {
  id: '60000000-0000-4000-8000-000000000001',
  shiftNumber: 'CA000001',
  userId: '10000000-0000-4000-8000-000000000001',
  userName: 'Admin',
  status: 'OPEN',
  openedAt: '2026-10-16T01:00:00Z',
  closedAt: null,
  openingCash: '500000.00',
  cashIn: '25000.00',
  cashOut: '55000.00',
  cashInCount: 1,
  cashOutCount: 1,
  bankIn: '579000.00',
  bankOut: '549000.00',
  expectedCash: '470000.00',
  countedCash: null,
  difference: null,
  closeNote: null,
  version: 1,
};
const entry = (
  key: string,
  at: string,
  direction: 'IN' | 'OUT',
  source: string,
  amount: string,
  type: string,
  number: string,
  party: string,
  balance: string,
) => ({
  entryKey: key,
  occurredAt: at,
  direction,
  source,
  category: null,
  amount,
  documentType: type,
  documentId: '70000000-0000-4000-8000-00000000000' + key.length,
  documentNumber: number,
  party,
  memo: null,
  actorName: 'Admin',
  balanceAfter: balance,
  canCancel: false,
});
const book = {
  version: 1,
  fund: 'CASH',
  scope: 'ALL',
  opening: null,
  fundBalances: { CASH: '144000.00', BANK: '30000.00' },
  openings: { CASH: false, BANK: false },
  shift: null,
  summary: {
    totalIn: '199000.00',
    totalOut: '55000.00',
    inCount: 2,
    outCount: 1,
    openingBalance: '0.00',
    closingBalance: '144000.00',
  },
  items: [
    entry(
      'r:1',
      '2026-10-16T02:36:00Z',
      'OUT',
      'RETURN_REFUND',
      '55000.00',
      'RETURN',
      'TH000001',
      'Khách lẻ',
      '144000.00',
    ),
    entry(
      'p:22',
      '2026-10-16T02:32:00Z',
      'IN',
      'SALE_RECEIPT',
      '25000.00',
      'SALE',
      'HD000005',
      'Khách lẻ',
      '199000.00',
    ),
    entry(
      'p:333',
      '2026-10-02T08:34:00Z',
      'IN',
      'SALE_RECEIPT',
      '174000.00',
      'SALE',
      'HD000002',
      'A.Ban Trần',
      '174000.00',
    ),
  ],
  nextCursor: null,
};

test('cash book shows real October funds and a cashier can count the drawer', async ({
  context,
  page,
}, testInfo) => {
  const requests: Record<string, unknown>[] = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:5179') return route.continue();
    const name = url.pathname.split('/').at(-1);
    let data: unknown;
    if (name === 'get_cash_book') data = book;
    else if (name === 'list_cash_shifts')
      data = { items: [shift], nextCursor: null };
    else if (name === 'get_my_cash_shift') data = { shift };
    else if (name === 'close_cash_shift') {
      requests.push(route.request().postDataJSON());
      data = {
        ...shift,
        status: 'CLOSED',
        closedAt: '2026-10-16T14:00:00Z',
        countedCash: '469000.00',
        difference: '-1000.00',
        closeNote: 'Thối nhầm',
        version: 2,
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
  await page.goto('/e2e/fixtures/cash-book.html');
  await expect(page.getByRole('button', { name: /Tiền mặt/ })).toContainText(
    '144.000 ₫',
  );
  await expect(page.getByText('+199.000 ₫')).toBeVisible();
  await expect(page.getByRole('link', { name: 'TH000001' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('cash-book.png'),
    fullPage: true,
  });

  await page.getByRole('link', { name: 'Kết ca' }).click();
  await expect(page.getByText('470.000 ₫')).toBeVisible();
  await page.getByLabel('Tiền mặt đếm được').fill('469000');
  await expect(page.getByText('-1.000 ₫')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đóng ca' })).toBeDisabled();
  await page.getByLabel(/Ghi chú/).fill('Thối nhầm');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('cash-shift.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Đóng ca' }).click();
  await expect
    .poll(() => requests.at(-1))
    .toMatchObject({
      p_counted_cash: '469000',
      p_note: 'Thối nhầm',
      p_expected_version: 1,
    });
});
