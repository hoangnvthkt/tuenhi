import { expect, test } from '@playwright/test';

const allowedConsoleErrors: RegExp[] = [];

test('public production shell is safe and installable', async ({
  page,
  request,
}) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) =>
    browserErrors.push(`pageerror: ${error.message}`),
  );
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !allowedConsoleErrors.some((pattern) => pattern.test(message.text()))
    ) {
      browserErrors.push(`console: ${message.text()}`);
    }
  });

  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle('Tuệ Nhi — Bán hàng & Kho');
  await expect(page.getByText('TUỆ NHI', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Đăng nhập bán hàng' }),
  ).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Mật khẩu')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();

  await page.goto('/login');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Đăng nhập bán hàng' }),
  ).toBeVisible();

  await page.goto('/forgot-password');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Đặt lại mật khẩu' }),
  ).toBeVisible();

  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as {
    name: string;
    short_name: string;
    icons: Array<{ src: string }>;
  };
  expect(manifest).toMatchObject({
    name: 'Tuệ Nhi - Bán hàng & Kho',
    short_name: 'Tuệ Nhi',
  });

  const serviceWorkerResponse = await request.get('/sw.js');
  expect(serviceWorkerResponse.ok()).toBe(true);
  expect(serviceWorkerResponse.headers()['content-type']).toContain(
    'javascript',
  );
  const serviceWorkerSource = await serviceWorkerResponse.text();
  expect(serviceWorkerSource).not.toMatch(/<!doctype html/i);
  expect(serviceWorkerSource).toMatch(/(?:importScripts|self\.)/);

  await page.goto('/login');
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean(await navigator.serviceWorker.getRegistration()),
      ),
    )
    .toBe(true);

  for (const icon of manifest.icons) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.ok(), `PWA icon ${icon.src}`).toBe(true);
    expect(
      iconResponse.headers()['content-type'],
      `PWA icon ${icon.src} content type`,
    ).toMatch(/^image\//);
    expect(
      (await iconResponse.body()).byteLength,
      `PWA icon ${icon.src} body`,
    ).toBeGreaterThan(0);
  }

  expect(browserErrors).toEqual([]);
});
