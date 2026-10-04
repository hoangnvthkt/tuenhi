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
