import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

for (const [link, chunk, destination] of [
  ['Bán hàng', 'recovery-sale-', '/pos?focusProduct=fixture-product'],
  [
    'Nhập hàng',
    'recovery-purchase-',
    '/more/purchases/new?productId=fixture-product',
  ],
]) {
  test(`${link} recovers a stale chunk without manual reload and retains the deep link and browser storage`, async ({
    page,
    context,
  }) => {
    const html = await readFile(
      '.superpowers/asset-recovery-dist/e2e/fixtures/asset-recovery.html',
      'utf8',
    );
    let documents = 0;
    let failed = false;
    await context.route('**/*', async (route) => {
      const request = route.request();
      if (new URL(request.url()).origin !== 'http://127.0.0.1:5181')
        return route.abort();
      if (request.isNavigationRequest()) {
        documents++;
        return route.fulfill({ contentType: 'text/html', body: html });
      }
      if (!failed && request.url().includes(chunk!)) {
        failed = true;
        return route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html>Unavailable old asset',
        });
      }
      return route.continue();
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Danh mục' })).toBeVisible();
    await page.evaluate(() =>
      localStorage.setItem('tuenhi:pos:fixture', 'unsaved-cart'),
    );
    await page.getByRole('link', { name: link!, exact: true }).click();
    await expect(
      page.getByRole('heading', { name: link!, exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(destination!.replace('?', '\\?') + '$'),
    );
    expect(failed).toBe(true);
    expect(documents).toBe(2);
    expect(
      await page.evaluate(() => localStorage.getItem('tuenhi:pos:fixture')),
    ).toBe('unsaved-cart');
  });
}

test('a persistent missing chunk stops after one automatic reload and offers manual recovery', async ({
  page,
  context,
}) => {
  const html = await readFile(
    '.superpowers/asset-recovery-dist/e2e/fixtures/asset-recovery.html',
    'utf8',
  );
  let documents = 0;
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:5181')
      return route.abort();
    if (route.request().isNavigationRequest()) {
      documents++;
      return route.fulfill({ contentType: 'text/html', body: html });
    }
    if (route.request().url().includes('recovery-sale-'))
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html>Unavailable',
      });
    return route.continue();
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Bán hàng', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Tải lại ứng dụng' }),
  ).toBeVisible();
  expect(documents).toBe(2);
});
