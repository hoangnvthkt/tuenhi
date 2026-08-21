import { expect, test } from '@playwright/test';

test('serves the app shell and an installable manifest', async ({
  page,
  request,
}, testInfo) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();

  const mobileNavigation = page.getByRole('navigation', {
    name: 'Điều hướng di động',
  });
  const desktopNavigation = page.getByRole('navigation', {
    name: 'Điều hướng máy tính',
  });

  if (testInfo.project.name === 'mobile-chromium') {
    await expect(mobileNavigation).toBeVisible();
    await expect(desktopNavigation).toBeHidden();
  } else {
    await expect(desktopNavigation).toBeVisible();
    await expect(mobileNavigation).toBeHidden();
  }

  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);

  const manifest = (await response.json()) as {
    name: string;
    short_name: string;
    display: string;
    theme_color: string;
    icons: Array<{ sizes: string }>;
  };

  expect(manifest).toMatchObject({
    name: 'Tuệ Nhi - Bán hàng & Kho',
    short_name: 'Tuệ Nhi',
    display: 'standalone',
    theme_color: '#0f766e',
  });
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
});
