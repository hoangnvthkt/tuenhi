import { createClient } from '@supabase/supabase-js';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường bắt buộc: ${name}`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isEnvelope(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.ok === 'boolean' &&
    typeof value.correlationId === 'string'
  );
}

const url = required('SUPABASE_URL');
const publishableKey = required('SUPABASE_PUBLISHABLE_KEY');
const secretKey = required('SUPABASE_SECRET_KEY');
const identities = [
  ['owner', required('TEST_OWNER_EMAIL'), required('TEST_OWNER_PASSWORD')],
  [
    'catalog',
    required('TEST_CATALOG_EMPLOYEE_EMAIL'),
    required('TEST_CATALOG_EMPLOYEE_PASSWORD'),
  ],
  [
    'business',
    required('TEST_BUSINESS_EMPLOYEE_EMAIL'),
    required('TEST_BUSINESS_EMPLOYEE_PASSWORD'),
  ],
].map(([label, email, password]) => [label, email.toLowerCase(), password]);

assert(
  new Set(identities.map(([, email]) => email)).size === identities.length,
  'Mỗi tài khoản kiểm thử Phase 1B phải dùng email riêng.',
);
for (const [, email] of identities) {
  assert(
    /^codex-phase1b-[a-z0-9-]+@example\.invalid$/.test(email),
    'Email test phải dùng miền example.invalid và tiền tố codex-phase1b-.',
  );
}

const runId = crypto.randomUUID();
const marker = runId.replaceAll('-', '').slice(0, 16).toUpperCase();
const createdAuthIds = [];
const createdProfileIds = [];
const storagePaths = [];
let passed = 0;

const admin = createClient(url, secretKey, {
  db: { schema: 'api' },
  auth: { persistSession: false, autoRefreshToken: false },
});

function browserClient() {
  return createClient(url, publishableKey, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createAuthUser(email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error('Không thể tạo Auth user test tạm.');
  createdAuthIds.push(data.user.id);
  return data.user;
}

async function signIn(email, password) {
  const client = browserClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Không thể đăng nhập user test tạm.');
  return client;
}

async function expectEnvelope(client, name, args, expectedOk) {
  const { data, error } = await client.rpc(name, args);
  assert(!error, `RPC ${name} không trả được envelope an toàn.`);
  assert(isEnvelope(data), `RPC ${name} trả cấu trúc không hợp lệ.`);
  assert(data.ok === expectedOk, `RPC ${name} trả trạng thái ngoài dự kiến.`);
  return data;
}

async function passCase(name, test) {
  const correlationId = await test();
  passed += 1;
  console.log(
    correlationId ? `PASS ${name} (${correlationId})` : `PASS ${name}`,
  );
}

async function cleanup() {
  let failed = false;
  if (storagePaths.length > 0) {
    const { error } = await admin.storage
      .from('product-images')
      .remove(storagePaths);
    failed ||= Boolean(error);
  }
  if (createdProfileIds.length > 0) {
    const { data, error } = await admin.rpc('cleanup_phase1b_test_users', {
      p_user_ids: createdProfileIds,
    });
    const clean =
      !error &&
      isEnvelope(data) &&
      data.ok === true &&
      data.data.remainingProfiles === 0 &&
      data.data.remainingImportRuns === 0 &&
      data.data.remainingProducts === 0 &&
      data.data.remainingLegacySales === 0;
    failed ||= !clean;
  }
  for (const userId of createdAuthIds.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    failed ||= Boolean(error);
  }
  if (failed) {
    throw new Error(
      'Dọn dữ liệu test Phase 1B chưa sạch; cần kiểm tra các ID của lần chạy.',
    );
  }
}

try {
  const byLabel = Object.fromEntries(identities.map((item) => [item[0], item]));
  const ownerUser = await createAuthUser(byLabel.owner[1], byLabel.owner[2]);
  const catalogUser = await createAuthUser(
    byLabel.catalog[1],
    byLabel.catalog[2],
  );
  const businessUser = await createAuthUser(
    byLabel.business[1],
    byLabel.business[2],
  );
  const derivedEmail = (label) =>
    `codex-phase1b-${label}-${runId}@example.invalid`;
  const noProfileUser = await createAuthUser(
    derivedEmail('no-profile'),
    byLabel.business[2],
  );
  const inactiveUser = await createAuthUser(
    derivedEmail('inactive'),
    byLabel.business[2],
  );
  const passwordUser = await createAuthUser(
    derivedEmail('password-required'),
    byLabel.business[2],
  );

  const profiles = [
    {
      id: ownerUser.id,
      email: byLabel.owner[1],
      display_name: `codex-phase1b-${marker}-owner`,
      role_template: 'OWNER',
      is_active: true,
      must_change_password: false,
      created_by: null,
    },
    {
      id: catalogUser.id,
      email: byLabel.catalog[1],
      display_name: `codex-phase1b-${marker}-catalog`,
      role_template: 'SALES_WAREHOUSE',
      is_active: true,
      must_change_password: false,
      created_by: ownerUser.id,
    },
    {
      id: businessUser.id,
      email: byLabel.business[1],
      display_name: `codex-phase1b-${marker}-business`,
      role_template: 'BUSINESS',
      is_active: true,
      must_change_password: false,
      created_by: ownerUser.id,
    },
    {
      id: inactiveUser.id,
      email: derivedEmail('inactive'),
      display_name: `codex-phase1b-${marker}-inactive`,
      role_template: 'BUSINESS',
      is_active: false,
      must_change_password: false,
      created_by: ownerUser.id,
    },
    {
      id: passwordUser.id,
      email: derivedEmail('password-required'),
      display_name: `codex-phase1b-${marker}-password`,
      role_template: 'BUSINESS',
      is_active: true,
      must_change_password: true,
      created_by: ownerUser.id,
    },
  ];
  const { error: profileError } = await admin.from('profiles').insert(profiles);
  if (profileError) throw new Error('Không thể tạo profile test Phase 1B.');
  createdProfileIds.push(...profiles.map((profile) => profile.id));

  const owner = await signIn(byLabel.owner[1], byLabel.owner[2]);
  const catalog = await signIn(byLabel.catalog[1], byLabel.catalog[2]);
  const business = await signIn(byLabel.business[1], byLabel.business[2]);
  const noProfile = await signIn(
    derivedEmail('no-profile'),
    byLabel.business[2],
  );
  const inactive = await signIn(derivedEmail('inactive'), byLabel.business[2]);
  const passwordRequired = await signIn(
    derivedEmail('password-required'),
    byLabel.business[2],
  );

  await passCase(
    'anon, no-profile, inactive và password gate bị chặn',
    async () => {
      const anon = browserClient();
      const anonResult = await anon.rpc('list_categories', {
        p_include_inactive: false,
      });
      assert(Boolean(anonResult.error), 'Anon gọi được catalog RPC.');
      for (const client of [noProfile, inactive, passwordRequired]) {
        const result = await expectEnvelope(
          client,
          'list_categories',
          { p_include_inactive: false },
          false,
        );
        assert(
          ['PERMISSION_DENIED', 'AUTH_REQUIRED', 'ACCOUNT_INACTIVE'].includes(
            result.error.code,
          ),
          'Hard gate trả sai mã lỗi.',
        );
      }
    },
  );

  await passCase(
    'direct write và app_private Data API bị từ chối',
    async () => {
      const insert = await business.from('products').insert({
        sku: `NO-${marker}`,
        sku_normalized: `no-${marker.toLowerCase()}`,
        name: 'Không được ghi',
        name_normalized: 'không được ghi',
        unit_name: 'Hộp',
        created_by: businessUser.id,
        updated_by: businessUser.id,
      });
      const update = await business
        .from('products')
        .update({ name: 'Không được sửa' })
        .eq('id', crypto.randomUUID());
      const remove = await business
        .from('products')
        .delete()
        .eq('id', crypto.randomUUID());
      assert(
        insert.error && update.error && remove.error,
        'Direct write chưa bị chặn.',
      );
      const { data: sessionData } = await business.auth.getSession();
      const response = await fetch(`${url}/rest/v1/import_run_rows?select=*`, {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'Accept-Profile': 'app_private',
        },
      });
      assert(!response.ok, 'app_private đã bị expose qua Data API.');
    },
  );

  const category = await expectEnvelope(
    owner,
    'save_category',
    {
      p_category_id: null,
      p_name: `Nhóm ${marker}`,
      p_is_active: true,
      p_idempotency_key: crypto.randomUUID(),
    },
    true,
  );
  const productPayload = (sku, name) => ({
    sku,
    barcode: null,
    name,
    categoryId: category.data.categoryId,
    unitName: 'Hộp',
    description: null,
    minStockQty: '0',
    isActive: true,
  });
  const productKey = crypto.randomUUID();
  const product = await expectEnvelope(
    owner,
    'save_product',
    {
      p_product_id: null,
      p_expected_version: null,
      p_product: productPayload(`SP-${marker}`, `Sản phẩm ${marker}`),
      p_idempotency_key: productKey,
    },
    true,
  );

  await passCase(
    'product create idempotent và luôn có đúng một tồn bằng 0',
    async () => {
      const retry = await expectEnvelope(
        owner,
        'save_product',
        {
          p_product_id: null,
          p_expected_version: null,
          p_product: productPayload(`SP-${marker}`, `Sản phẩm ${marker}`),
          p_idempotency_key: productKey,
        },
        true,
      );
      assert(
        retry.data.productId === product.data.productId,
        'Retry đổi product ID.',
      );
      const { data: balances, error } = await admin
        .from('inventory_balances')
        .select('on_hand_qty')
        .eq('product_id', product.data.productId);
      assert(
        !error && balances.length === 1,
        'Không có đúng một inventory balance.',
      );
      assert(
        Number(balances[0].on_hand_qty) === 0,
        'Tồn khởi tạo không bằng 0.',
      );
      return retry.correlationId;
    },
  );

  await passCase('cùng SKU concurrent chỉ có một kết quả thắng', async () => {
    const sku = `CC-${marker}`;
    const attempts = await Promise.all([
      owner.rpc('save_product', {
        p_product_id: null,
        p_expected_version: null,
        p_product: productPayload(sku, `Concurrent A ${marker}`),
        p_idempotency_key: crypto.randomUUID(),
      }),
      catalog.rpc('save_product', {
        p_product_id: null,
        p_expected_version: null,
        p_product: productPayload(sku, `Concurrent B ${marker}`),
        p_idempotency_key: crypto.randomUUID(),
      }),
    ]);
    const envelopes = attempts.map((attempt) => attempt.data);
    assert(
      attempts.every((attempt) => !attempt.error),
      'Concurrency không trả envelope.',
    );
    assert(
      envelopes.filter((item) => item.ok).length === 1,
      'Không có đúng một winner.',
    );
    assert(
      envelopes.find((item) => !item.ok)?.error.code ===
        'DUPLICATE_IN_DATABASE',
      'Loser không nhận lỗi trùng ổn định.',
    );
  });

  await passCase('giá bán và lịch sử chỉ owner được thao tác', async () => {
    const price = await expectEnvelope(
      owner,
      'set_product_sale_price',
      {
        p_product_id: product.data.productId,
        p_sale_price: '25000',
        p_change_reason: 'Kiểm thử Phase 1B',
        p_idempotency_key: crypto.randomUUID(),
      },
      true,
    );
    const deniedWrite = await expectEnvelope(
      catalog,
      'set_product_sale_price',
      {
        p_product_id: product.data.productId,
        p_sale_price: '26000',
        p_change_reason: 'Không được phép',
        p_idempotency_key: crypto.randomUUID(),
      },
      false,
    );
    const deniedHistory = await expectEnvelope(
      catalog,
      'get_product_sale_price_history',
      {
        p_product_id: product.data.productId,
        p_limit: 5,
      },
      false,
    );
    assert(
      deniedWrite.error.code === 'PERMISSION_DENIED' &&
        deniedHistory.error.code === 'PERMISSION_DENIED',
      'Nhân viên vượt quyền giá bán.',
    );
    return price.correlationId;
  });

  await passCase(
    'quyền import được giới hạn theo target và owner-only',
    async () => {
      const deniedProduct = await expectEnvelope(
        business,
        'create_import_run',
        {
          p_target_type: 'PRODUCTS',
          p_template_version: 1,
          p_file_name: 'products-v1.xlsx',
          p_file_sha256: 'a'.repeat(64),
          p_mode: 'CREATE_ONLY',
          p_idempotency_key: crypto.randomUUID(),
        },
        false,
      );
      const allowedCustomer = await expectEnvelope(
        business,
        'create_import_run',
        {
          p_target_type: 'CUSTOMERS',
          p_template_version: 2,
          p_file_name: 'customers-v2.xlsx',
          p_file_sha256: 'b'.repeat(64),
          p_mode: 'CREATE_ONLY',
          p_idempotency_key: crypto.randomUUID(),
        },
        true,
      );
      const deniedLegacy = await expectEnvelope(
        business,
        'create_import_run',
        {
          p_target_type: 'LEGACY_SALES_ARCHIVE',
          p_template_version: 1,
          p_file_name: 'du-lieu-cu.xlsx',
          p_file_sha256: 'c'.repeat(64),
          p_mode: 'CREATE_ONLY',
          p_idempotency_key: crypto.randomUUID(),
        },
        false,
      );
      const ownerOnlyGrant = await expectEnvelope(
        owner,
        'set_staff_permission_override',
        {
          p_user_id: businessUser.id,
          p_permission_code: 'legacy.sale.import',
          p_effect: 'GRANT',
          p_reason: 'Kiểm thử owner-only',
          p_idempotency_key: crypto.randomUUID(),
        },
        false,
      );
      assert(
        deniedProduct.error.code === 'PERMISSION_DENIED',
        'Sai quyền PRODUCTS.',
      );
      assert(
        allowedCustomer.data.status === 'UPLOADED',
        'CUSTOMERS không được phép.',
      );
      assert(
        deniedLegacy.error.code === 'PERMISSION_DENIED',
        'Legacy không owner-only.',
      );
      assert(
        ownerOnlyGrant.error.code === 'OWNER_ONLY_PERMISSION',
        'Cấp được quyền owner-only.',
      );
      return allowedCustomer.correlationId;
    },
  );

  await passCase(
    'import lỗi không tạo một phần và retry commit trả kết quả cũ',
    async () => {
      const badRun = await expectEnvelope(
        business,
        'create_import_run',
        {
          p_target_type: 'CUSTOMERS',
          p_template_version: 2,
          p_file_name: 'customers-v2.xlsx',
          p_file_sha256: 'd'.repeat(64),
          p_mode: 'CREATE_ONLY',
          p_idempotency_key: crypto.randomUUID(),
        },
        true,
      );
      await expectEnvelope(
        business,
        'save_import_mapping',
        {
          p_import_run_id: badRun.data.importRunId,
          p_mapping: { 'Mã khách hàng': 'code', 'Tên khách hàng': 'name' },
        },
        true,
      );
      await expectEnvelope(
        business,
        'validate_import_rows',
        {
          p_import_run_id: badRun.data.importRunId,
          p_chunk_index: 0,
          p_rows: [
            {
              rowNumber: 2,
              values: { code: `KH-${marker}`, name: '' },
            },
          ],
          p_is_last_chunk: true,
        },
        true,
      );
      const failed = await expectEnvelope(
        business,
        'commit_import',
        {
          p_import_run_id: badRun.data.importRunId,
          p_idempotency_key: crypto.randomUUID(),
        },
        false,
      );
      const { data: partial } = await admin
        .from('customers')
        .select('id')
        .eq('code', `KH-${marker}`);
      assert(partial.length === 0, 'Import lỗi vẫn tạo khách hàng.');
      assert(
        failed.error.code === 'IMPORT_VALIDATION_FAILED',
        'Sai lỗi import.',
      );

      const goodRun = await expectEnvelope(
        catalog,
        'create_import_run',
        {
          p_target_type: 'CATEGORIES',
          p_template_version: 1,
          p_file_name: 'categories-v1.xlsx',
          p_file_sha256: 'e'.repeat(64),
          p_mode: 'CREATE_ONLY',
          p_idempotency_key: crypto.randomUUID(),
        },
        true,
      );
      await expectEnvelope(
        catalog,
        'save_import_mapping',
        {
          p_import_run_id: goodRun.data.importRunId,
          p_mapping: { 'Tên nhóm hàng': 'name' },
        },
        true,
      );
      await expectEnvelope(
        catalog,
        'validate_import_rows',
        {
          p_import_run_id: goodRun.data.importRunId,
          p_chunk_index: 0,
          p_rows: [{ rowNumber: 2, values: { name: `Nhóm nhập ${marker}` } }],
          p_is_last_chunk: true,
        },
        true,
      );
      const commitKey = crypto.randomUUID();
      const first = await expectEnvelope(
        catalog,
        'commit_import',
        {
          p_import_run_id: goodRun.data.importRunId,
          p_idempotency_key: commitKey,
        },
        true,
      );
      const retry = await expectEnvelope(
        catalog,
        'commit_import',
        {
          p_import_run_id: goodRun.data.importRunId,
          p_idempotency_key: commitKey,
        },
        true,
      );
      assert(
        JSON.stringify(first.data) === JSON.stringify(retry.data),
        'Retry đổi kết quả import.',
      );
      return retry.correlationId;
    },
  );

  await passCase(
    'Storage ảnh private cô lập đúng quyền đọc, ghi và xóa',
    async () => {
      const path = `products/${product.data.productId}/${crypto.randomUUID()}.png`;
      storagePaths.push(path);
      const pixel = Uint8Array.from(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
      );
      const uploaded = await catalog.storage
        .from('product-images')
        .upload(path, pixel, { contentType: 'image/png', upsert: false });
      assert(!uploaded.error, 'Nhân viên catalog không tải ảnh lên được.');
      const downloaded = await business.storage
        .from('product-images')
        .download(path);
      assert(
        !downloaded.error,
        'Người có catalog.read không đọc được ảnh private.',
      );
      const deniedPath = `products/${product.data.productId}/${crypto.randomUUID()}.png`;
      const deniedUpload = await business.storage
        .from('product-images')
        .upload(deniedPath, pixel, { contentType: 'image/png', upsert: false });
      assert(Boolean(deniedUpload.error), 'Business ghi được ảnh private.');
      await business.storage.from('product-images').remove([path]);
      const stillReadable = await catalog.storage
        .from('product-images')
        .download(path);
      assert(!stillReadable.error, 'Business xóa được ảnh private.');
      const attached = await expectEnvelope(
        catalog,
        'attach_product_image',
        {
          p_product_id: product.data.productId,
          p_object_path: path,
          p_sort_order: 0,
          p_is_primary: true,
          p_idempotency_key: crypto.randomUUID(),
        },
        true,
      );
      await expectEnvelope(
        catalog,
        'remove_product_image',
        {
          p_product_image_id: attached.data.productImageId,
          p_idempotency_key: crypto.randomUUID(),
        },
        true,
      );
      const removed = await catalog.storage
        .from('product-images')
        .remove([path]);
      assert(!removed.error, 'Nhân viên catalog không xóa được ảnh của mình.');
      storagePaths.splice(storagePaths.indexOf(path), 1);
      return attached.correlationId;
    },
  );

  await passCase(
    'legacy archive tách khỏi tồn và quyền tra cứu cấp riêng',
    async () => {
      const run = await expectEnvelope(
        owner,
        'create_import_run',
        {
          p_target_type: 'LEGACY_SALES_ARCHIVE',
          p_template_version: 1,
          p_file_name: 'du-lieu-cu-tong-hop.xlsx',
          p_file_sha256: 'f'.repeat(64),
          p_mode: 'CREATE_ONLY',
          p_idempotency_key: crypto.randomUUID(),
        },
        true,
      );
      const sourceNumber = `HD-${marker}`;
      const productLabel = `LEGACY-${marker}`;
      const sourceOnly = { kind: 'SOURCE_LABEL_ONLY', confirmed: true };
      await expectEnvelope(
        owner,
        'save_legacy_import_mapping',
        {
          p_import_run_id: run.data.importRunId,
          p_mapping: {
            staff: { 'Nhân viên tổng hợp': sourceOnly },
            channel: { 'Kênh tổng hợp': sourceOnly },
            customer: { 'Khách tổng hợp': sourceOnly },
            product: { [productLabel]: sourceOnly },
          },
        },
        true,
      );
      const before = await admin
        .from('inventory_balances')
        .select('product_id,on_hand_qty')
        .eq('product_id', product.data.productId)
        .single();
      await expectEnvelope(
        owner,
        'validate_import_rows',
        {
          p_import_run_id: run.data.importRunId,
          p_chunk_index: 0,
          p_rows: [
            {
              rowNumber: 2,
              values: {
                sourceGroupIndex: 1,
                sourceSaleNumber: sourceNumber,
                sourceRowStart: 2,
                sourceRowNumber: 2,
                lineNumber: 1,
                soldOn: '2026-08-21',
                staffLabel: 'Nhân viên tổng hợp',
                channelLabel: 'Kênh tổng hợp',
                customerLabel: 'Khách tổng hợp',
                customerPhone: '',
                paymentLabel: 'Tiền mặt',
                paymentMethod: 'CASH',
                statusLabel: 'Hoàn thành',
                note: '',
                productCode: productLabel,
                productName: 'Sản phẩm tổng hợp',
                quantity: '1',
                unitPrice: '10000',
                unitPriceProvenance: 'SOURCE_VALUE',
                lineDiscount: '0',
                lineTotal: '10000',
                lineTotalProvenance: 'SOURCE_VALUE',
                warningCodes: [],
                openingSuggestions: [],
              },
            },
          ],
          p_is_last_chunk: true,
        },
        true,
      );
      await expectEnvelope(
        owner,
        'validate_legacy_sales_import',
        { p_import_run_id: run.data.importRunId },
        true,
      );
      const deniedRead = await expectEnvelope(
        business,
        'get_legacy_sales',
        { p_filters: {}, p_limit: 5 },
        false,
      );
      const committed = await expectEnvelope(
        owner,
        'commit_legacy_sales_import',
        {
          p_import_run_id: run.data.importRunId,
          p_idempotency_key: crypto.randomUUID(),
        },
        true,
      );
      const after = await admin
        .from('inventory_balances')
        .select('product_id,on_hand_qty')
        .eq('product_id', product.data.productId)
        .single();
      assert(
        before.data.on_hand_qty === after.data.on_hand_qty,
        'Legacy làm đổi tồn kho.',
      );
      assert(
        committed.data.isOperational === false,
        'Legacy bị đánh dấu operational.',
      );
      assert(
        deniedRead.error.code === 'PERMISSION_DENIED',
        'Business đọc legacy trước khi cấp quyền.',
      );
      await expectEnvelope(
        owner,
        'set_staff_permission_override',
        {
          p_user_id: businessUser.id,
          p_permission_code: 'legacy.sale.read',
          p_effect: 'GRANT',
          p_reason: 'Kiểm thử quyền đọc riêng',
          p_idempotency_key: crypto.randomUUID(),
        },
        true,
      );
      const allowedRead = await expectEnvelope(
        business,
        'get_legacy_sales',
        {
          p_filters: { importRunId: run.data.importRunId },
          p_limit: 5,
        },
        true,
      );
      assert(
        allowedRead.data.items.length === 1,
        'Quyền đọc riêng không thấy archive.',
      );
      assert(
        allowedRead.data.items[0].isOperational === false,
        'Read DTO sai boundary.',
      );
      return committed.correlationId;
    },
  );

  console.log(`Cloud security Phase 1B: ${passed} trường hợp đã qua.`);
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : 'Cloud security Phase 1B thất bại.';
  console.error(message);
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error(
      cleanupError instanceof Error
        ? cleanupError.message
        : 'Không thể dọn dữ liệu test Phase 1B.',
    );
    process.exitCode = 1;
  }
}
