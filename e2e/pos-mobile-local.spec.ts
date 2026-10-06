import { expect, test } from '@playwright/test';
test.beforeEach(async ({ context, page }) => {
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:5179'
      ? route.continue()
      : route.abort(),
  );
  await page.goto('/e2e/fixtures/pos-convenience.html');
});
test('20-line cart keeps checkout visible above navigation and modal contains keyboard focus', async ({
  page,
}, testInfo) => {
  const pay = page.getByRole('button', { name: 'Thanh toán', exact: true });
  await expect(pay).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('cart.png'),
    fullPage: false,
  });
  const box = await pay.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(page.viewportSize()!.height - 60);
  expect(box!.y).toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await pay.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.getByLabel('Khách đưa (tùy chọn)').fill('300000');
  await expect(page.getByText(/Tiền thừa:/)).toContainText('26.000');
  await page.setViewportSize({ width: 390, height: 420 });
  await page
    .getByRole('button', { name: 'Xác nhận', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole('button', { name: 'Xác nhận', exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath('checkout-small-viewport.png'),
  });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(pay).toBeFocused();
  await expect(page.getByLabel('Số lần xác nhận')).toHaveText('0');
});

test('valid cash discounts do not show a numeric range error after blur', async ({
  page,
}) => {
  const lineDiscount = page.getByLabel('Giảm dòng', { exact: true }).first();
  await lineDiscount.fill('1000');
  await lineDiscount.press('Tab');
  await expect(lineDiscount).toHaveAttribute('aria-invalid', 'false');
  const orderDiscount = page.getByLabel('Giảm toàn đơn', { exact: true });
  await orderDiscount.fill('5000');
  await orderDiscount.press('Tab');
  await expect(orderDiscount).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('KH01 mixed settlement, debt collection and reasoned adjustment fit a mobile screen', async ({
  page,
}, testInfo) => {
  await page.goto('/e2e/fixtures/customer-debt.html');
  await page.getByLabel('Tiền mặt thanh toán', { exact: true }).fill('30000');
  await page
    .getByLabel('Chuyển khoản thanh toán', { exact: true })
    .fill('50000');
  await expect(page.getByRole('dialog')).toContainText('20.000');
  await page.screenshot({ path: testInfo.outputPath('mixed-credit.png') });
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByTestId('customer-debt-balance')).toHaveText(
    '20.000 ₫',
  );
  await page.getByRole('button', { name: 'Thu nợ', exact: true }).click();
  await page.getByLabel('Chuyển khoản thu nợ').fill('20000');
  await page.getByRole('button', { name: 'Ghi nhận thu nợ' }).click();
  await expect(page.getByTestId('customer-debt-balance')).toHaveText('0 ₫');
  await page.getByRole('button', { name: 'Chỉnh số dư nợ' }).click();
  await page.getByLabel('Số nợ mới').fill('50000');
  await expect(
    page.getByRole('button', { name: 'Lưu số dư nợ' }),
  ).toBeDisabled();
  await page.getByLabel('Lý do điều chỉnh').fill('Nhập nợ cũ');
  await page.getByRole('button', { name: 'Lưu số dư nợ' }).click();
  await expect(page.getByTestId('customer-debt-balance')).toHaveText(
    '50.000 ₫',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('customer-debt.png'),
    fullPage: true,
  });
});
