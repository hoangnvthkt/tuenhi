import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường E2E Phase 1E: ${name}`);
  return value;
}

const url = required('VITE_SUPABASE_URL', 'SUPABASE_URL');
const publishableKey = required(
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
);
const accessToken = required('SUPABASE_ACCESS_TOKEN');
const projectRef = required('SUPABASE_PROJECT_ID');
const keyResponse = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/api-keys`,
  { headers: { Authorization: `Bearer ${accessToken}` } },
);
assert(keyResponse.ok, 'Không thể lấy service key tạm thời cho E2E Phase 1E.');
const serviceKey = (await keyResponse.json()).find(
  (item) => item.name === 'service_role',
)?.api_key;
assert(serviceKey, 'Project không trả service_role key cho E2E Phase 1E.');
const runId = crypto.randomUUID();
const marker = runId.replaceAll('-', '').slice(0, 12).toUpperCase();
const password = `Tn!${crypto.randomUUID()}aA9`;
let admin: SupabaseClient;
let ownerEmail = '';
let staffEmail = '';
let ownerId = '';
let staffId = '';
let productId = '';
let saleNumber = '';
let countId = '';
let staffClient: SupabaseClient;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
}
async function logout(page: Page) {
  await page.locator('header summary').click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
}
async function rpc(client: SupabaseClient, name: string, args: object) {
  const { data, error } = await client.rpc(name, args);
  assert(!error && data?.ok, `RPC E2E ${name} thất bại.`);
  return data.data as Record<string, unknown>;
}

test.beforeAll(async ({ browserName }, workerInfo) => {
  const project = workerInfo.project.name.replace(/[^a-z0-9]+/gi, '-');
  ownerEmail = `codex-phase1e-owner-${project}-${runId}@example.invalid`;
  staffEmail = `codex-phase1e-staff-${project}-${runId}@example.invalid`;
  admin = createClient(url, serviceKey, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [ownerAuth, staffAuth] = await Promise.all([
    admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    }),
    admin.auth.admin.createUser({
      email: staffEmail,
      password,
      email_confirm: true,
    }),
  ]);
  assert(
    ownerAuth.data.user && staffAuth.data.user,
    'Không thể tạo Auth user E2E Phase 1E.',
  );
  ownerId = ownerAuth.data.user.id;
  staffId = staffAuth.data.user.id;
  const profiles = await admin.from('profiles').insert([
    {
      id: ownerId,
      email: ownerEmail,
      display_name: `Owner Phase 1E ${browserName}`,
      role_template: 'OWNER',
      is_active: true,
      must_change_password: false,
      created_by: null,
    },
    {
      id: staffId,
      email: staffEmail,
      display_name: `Kho Phase 1E ${marker}`,
      role_template: 'SALES_WAREHOUSE',
      is_active: true,
      must_change_password: false,
      created_by: ownerId,
    },
  ]);
  assert(!profiles.error, 'Không thể tạo profiles E2E Phase 1E.');
  const ownerClient = createClient(url, publishableKey, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  staffClient = createClient(url, publishableKey, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  assert(
    !(
      await ownerClient.auth.signInWithPassword({ email: ownerEmail, password })
    ).error,
    'Không thể đăng nhập owner setup E2E.',
  );
  assert(
    !(
      await staffClient.auth.signInWithPassword({ email: staffEmail, password })
    ).error,
    'Không thể đăng nhập staff setup E2E.',
  );
  const product = await rpc(ownerClient, 'save_product', {
    p_product_id: null,
    p_expected_version: null,
    p_product: {
      sku: `E2E-P1E-${marker}`,
      barcode: null,
      name: `Thuốc trả hàng ${marker}`,
      categoryId: null,
      unitName: 'Hộp',
      description: null,
      minStockQty: '0',
      isActive: true,
    },
    p_idempotency_key: crypto.randomUUID(),
  });
  productId = String(product.productId);
  await rpc(ownerClient, 'set_product_sale_price', {
    p_product_id: productId,
    p_sale_price: '60000',
    p_change_reason: 'E2E Phase 1E',
    p_idempotency_key: crypto.randomUUID(),
  });
  const opening = await rpc(ownerClient, 'save_opening_stock_draft', {
    p_count_id: null,
    p_expected_version: null,
    p_note: 'E2E Phase 1E',
    p_lines: [
      {
        productId,
        countedQty: '15',
        openingUnitCost: '40000',
        sourceSuggestionId: null,
        confirmedUnverified: false,
      },
    ],
    p_idempotency_key: crypto.randomUUID(),
  });
  const submitted = await rpc(ownerClient, 'submit_opening_stock', {
    p_count_id: opening.countId,
    p_expected_version: opening.version,
    p_idempotency_key: crypto.randomUUID(),
  });
  await rpc(ownerClient, 'post_opening_stock', {
    p_count_id: opening.countId,
    p_expected_version: submitted.version,
    p_idempotency_key: crypto.randomUUID(),
  });
  const channels = await rpc(staffClient, 'list_sales_channels', {
    p_include_inactive: false,
  });
  const channelId = (channels.items as Array<{ id: string }>)[0]?.id;
  assert(channelId, 'Không có kênh bán hoạt động E2E.');
  const draft = await rpc(staffClient, 'save_sale_draft', {
    p_sale_id: null,
    p_expected_version: null,
    p_customer_id: null,
    p_sales_channel_id: channelId,
    p_lines: [
      { productId, quantity: '6', lineDiscountAmount: '0', lineOrder: 0 },
    ],
    p_order_discount: '0',
    p_note: 'E2E Phase 1E',
    p_idempotency_key: crypto.randomUUID(),
  });
  const completed = await rpc(staffClient, 'complete_sale', {
    p_sale_id: draft.sale.id,
    p_expected_version: draft.sale.version,
    p_payment_method: 'CASH',
    p_idempotency_key: crypto.randomUUID(),
  });
  saleNumber = String(completed.saleNumber);
});

test.afterAll(async () => {
  let failed = false;
  if (ownerId && staffId) {
    const cleanup = await admin.rpc('cleanup_phase1e_test_users', {
      p_user_ids: [ownerId, staffId],
    });
    failed ||=
      Boolean(cleanup.error) ||
      !cleanup.data?.ok ||
      cleanup.data.data.remainingProfiles !== 0;
    for (const id of [staffId, ownerId])
      failed ||= Boolean((await admin.auth.admin.deleteUser(id)).error);
  }
  if (failed) throw new Error('Không thể dọn sạch E2E Phase 1E.');
});

test('nhân viên trả hàng, kiểm kho; owner ghi sổ và hủy hóa đơn', async ({
  page,
}) => {
  await login(page, staffEmail);
  await page.goto('/returns/new');
  await page.getByPlaceholder('Ví dụ: HD000001').fill(saleNumber);
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await page.getByLabel('Số lượng yêu cầu trả').fill('1');
  await page.getByLabel('Lý do trả hàng').fill('E2E trả hàng');
  await page.getByRole('button', { name: 'Gửi yêu cầu trả hàng' }).click();
  await expect(
    page.getByRole('button', { name: 'Hoàn tất trả hàng' }),
  ).toBeVisible();
  await page.getByLabel('Số lượng chấp nhận').fill('1');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Hoàn tất trả hàng' }).click();
  await expect(
    page.getByText('Đã hoàn tất trả hàng', { exact: true }),
  ).toBeVisible();

  await page.goto('/stock-counts/new');
  await page.getByRole('combobox').selectOption(productId);
  await page.getByLabel('Số đếm thực tế').fill('9');
  await page.getByRole('button', { name: 'Lưu phiếu' }).click();
  await expect(
    page.getByRole('button', { name: 'Gửi phiếu để ghi sổ' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Gửi phiếu để ghi sổ' }).click();
  countId = page.url().split('/').at(-1) ?? '';
  await logout(page);

  await login(page, ownerEmail);
  await page.goto(`/stock-counts/${countId}`);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Ghi sổ chênh lệch' }).click();
  await expect(page.getByText('Đã ghi sổ').first()).toBeVisible();

  const channels = await rpc(staffClient, 'list_sales_channels', {
    p_include_inactive: false,
  });
  const channelId = (channels.items as Array<{ id: string }>)[0]?.id;
  const draft = await rpc(staffClient, 'save_sale_draft', {
    p_sale_id: null,
    p_expected_version: null,
    p_customer_id: null,
    p_sales_channel_id: channelId,
    p_lines: [
      { productId, quantity: '1', lineDiscountAmount: '0', lineOrder: 0 },
    ],
    p_order_discount: '0',
    p_note: 'E2E hủy',
    p_idempotency_key: crypto.randomUUID(),
  });
  const sale = await rpc(staffClient, 'complete_sale', {
    p_sale_id: draft.sale.id,
    p_expected_version: draft.sale.version,
    p_payment_method: 'CASH',
    p_idempotency_key: crypto.randomUUID(),
  });
  await page.goto(`/sales/${sale.saleId}`);
  await page.getByPlaceholder('Lý do hủy hóa đơn').fill('E2E hủy hóa đơn');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Hủy hóa đơn' }).click();
  await expect(page.getByText('ĐÃ HỦY', { exact: true })).toBeVisible();
  await expect(page.getByText('Phương thức: Tiền mặt')).toBeVisible();

  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Báo cáo' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Lợi nhuận gộp' }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất XLSX' }).click();
  expect((await download).suggestedFilename()).toMatch(/bao-cao-.*\.xlsx/);

  await page.goto('/more/inventory/valuation');
  await page.getByLabel('Tìm theo tên hoặc SKU').fill(marker);
  await expect(page.getByText(`Thuốc trả hàng ${marker}`)).toBeVisible();
});
