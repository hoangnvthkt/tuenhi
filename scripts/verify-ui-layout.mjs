import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

// Local browser fixtures only. All remote requests are intercepted.
const env = readFileSync('.env', 'utf8');
const projectUrl = env.match(/^VITE_SUPABASE_URL=["']?([^\s"']+)/m)?.[1];
const project = new URL(projectUrl).hostname.split('.')[0];
const id = '10000000-0000-4000-8000-000000000001';
const permissions = [
  'dashboard.operational.read',
  'catalog.read',
  'staff.manage',
  'supplier.read',
  'customer.read',
  'settings.manage',
  'legacy.sale.read',
  'legacy.sale.import',
  'purchase.operational.read',
  'inventory.adjustment.post',
  'inventory.count.draft',
  'return.request.create',
  'report.all_revenue.read',
  'report.cost_profit.read',
];
const envelope = (data) => ({ ok: true, data, error: null, correlationId: id });
const fixtures = {
  get_my_session_context: {
    userId: id,
    email: 'preview@example.invalid',
    displayName: 'Chủ cửa hàng Tuệ Nhi',
    roleTemplate: 'OWNER',
    isActive: true,
    mustChangePassword: false,
    permissions,
  },
  get_my_notifications: { items: [], unreadCount: 0, nextCursor: null },
  get_operational_dashboard: {
    version: 1,
    timezone: 'Asia/Ho_Chi_Minh',
    catalog: {
      activeProductCount: 1284,
      lowStockCount: 18,
      outOfStockCount: 7,
      totalOnHandQty: '15682',
    },
    pending: { purchaseReceipts: 8, stockCounts: 3, saleReturns: 2 },
  },
  get_revenue_report: {
    version: 1,
    timezone: 'Asia/Ho_Chi_Minh',
    range: { from: '2026-09-09', to: '2026-09-09' },
    generatedAt: '2026-09-09T01:00:00Z',
    scope: 'ALL',
    summary: {
      completedOrderCount: 126,
      soldQuantity: '524',
      grossSales: '1234567890',
      lineDiscounts: '0',
      orderDiscounts: '0',
      salesReturns: '350000',
      cancellations: '0',
      netRevenue: '1234217890',
      averageOrderValue: null,
    },
    daily: [],
    channels: [],
    paymentMethods: [],
  },
  get_owner_dashboard: {
    version: 1,
    netRevenue: '1234217890',
    netCogs: '985000000',
    grossProfit: '249217890',
    grossMarginPct: null,
    inventoryValue: '123456789012',
  },
};
const browser = await chromium.launch({ channel: 'chrome' });
mkdirSync('test-results/ui-layout', { recursive: true });
const failures = [];
for (const width of [320, 390, 768, 1024, 1280, 1440]) {
  const context = await browser.newContext({
    viewport: { width, height: 960 },
    serviceWorkers: 'block',
  });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    const name = url.pathname.split('/').at(-1);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope(fixtures[name] ?? {})),
    });
  });
  await context.addInitScript(
    ({ project, id }) => {
      localStorage.setItem(
        `sb-${project}-auth-token`,
        JSON.stringify({
          access_token: 'local-preview',
          refresh_token: 'local-preview',
          token_type: 'bearer',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id, aud: 'authenticated', email: 'preview@example.invalid' },
        }),
      );
    },
    { project, id },
  );
  const page = await context.newPage();
  for (const path of ['/more', '/']) {
    await page.goto(`http://127.0.0.1:4173${path}`);
    await page
      .getByRole('heading', {
        name: path === '/more' ? 'Nhiều hơn' : 'Tổng quan',
        exact: true,
      })
      .waitFor();
    if (path === '/')
      await page.getByRole('article', { name: 'Sản phẩm hoạt động' }).waitFor();
    const issues = await page.evaluate(() => {
      const errors = [];
      if (document.documentElement.scrollWidth > innerWidth)
        errors.push('page overflow');
      for (const el of document.querySelectorAll(
        '.app-nav-link, .module-title, .metric-value',
      )) {
        if (!el.getBoundingClientRect().width) continue;
        if (el.scrollWidth > el.clientWidth + 1)
          errors.push(`overflow: ${el.textContent}`);
        if (el.matches('.app-nav-link')) {
          const label = el.lastElementChild?.previousElementSibling;
          if (label && label.scrollWidth > el.clientWidth)
            errors.push(`nav label overflow: ${el.textContent}`);
        }
      }
      return errors;
    });
    failures.push(...issues.map((issue) => `${width} ${path}: ${issue}`));
    await page.screenshot({
      path: `test-results/ui-layout/${path === '/' ? 'dashboard' : 'modules'}-${width}.png`,
      fullPage: true,
    });
  }
  await context.close();
}
await browser.close();
console.log(JSON.stringify({ viewports: 6, pages: 12, failures }, null, 2));
if (failures.length) process.exitCode = 1;
