import { createClient } from '@supabase/supabase-js';
import { assertSyntheticTestsAllowed } from './project-lifecycle.mjs';

function required(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Thiếu biến môi trường bắt buộc: ${names.join(' hoặc ')}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function envelope(value) {
  return (
    typeof value === 'object' && value !== null && typeof value.ok === 'boolean'
  );
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
  {
    headers: { Authorization: `Bearer ${accessToken}` },
  },
);
assert(
  keyResponse.ok,
  'Không thể lấy service key tạm thời cho Cloud test Phase 1E.',
);
const serviceKey = (await keyResponse.json()).find(
  (item) => item.name === 'service_role',
)?.api_key;
assert(serviceKey, 'Project không trả service_role key cho Cloud test.');

const admin = createClient(url, serviceKey, {
  db: { schema: 'api' },
  auth: { persistSession: false, autoRefreshToken: false },
});
await assertSyntheticTestsAllowed(admin);
const browser = () =>
  createClient(url, publishableKey, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
const runId = crypto.randomUUID();
const marker = runId.replaceAll('-', '').slice(0, 16).toUpperCase();
const password = `Tn!${crypto.randomUUID()}aA9`;
const testPrefix = process.env.PHASE_TEST_PREFIX ?? 'phase1e';
const phaseLabel = process.env.PHASE_TEST_LABEL ?? 'Phase 1E';
const cleanupRpc =
  process.env.PHASE_TEST_CLEANUP_RPC ?? 'cleanup_phase1e_test_users';
const authIds = [];
let passed = 0;

async function rpc(client, name, args, ok = true) {
  const { data, error } = await client.rpc(name, args);
  assert(
    !error,
    `RPC ${name} không trả envelope: ${error?.message ?? 'không rõ lỗi'}`,
  );
  assert(envelope(data), `RPC ${name} trả sai envelope.`);
  assert(data.ok === ok, `RPC ${name} trả trạng thái ngoài dự kiến.`);
  return data;
}
async function pass(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}
async function identity(label, role, createdBy = null) {
  const email = `codex-${testPrefix}-${label}-${runId}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert(!error && data.user, `Không thể tạo Auth user ${label}.`);
  authIds.push(data.user.id);
  const { error: profileError } = await admin.from('profiles').insert({
    id: data.user.id,
    email,
    display_name: `${phaseLabel} ${label} ${marker}`,
    role_template: role,
    is_active: true,
    must_change_password: false,
    created_by: createdBy,
  });
  assert(!profileError, `Không thể tạo profile ${label}.`);
  const client = browser();
  const { error: loginError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  assert(!loginError, `Không thể đăng nhập JWT cho ${label}.`);
  return { id: data.user.id, client };
}
async function authIdentity(label) {
  const email = `codex-${testPrefix}-${label}-${runId}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert(!error && data.user, `Không thể tạo Auth user ${label}.`);
  authIds.push(data.user.id);
  return { id: data.user.id, email };
}
async function bootstrapOwnerIdentity(label) {
  const auth = await authIdentity(label);
  const result = await rpc(admin, 'finalize_staff_profile', {
    p_user_id: auth.id,
    p_email: auth.email,
    p_display_name: `${phaseLabel} owner ${marker}`,
    p_role_template: 'OWNER',
    p_created_by: auth.id,
    p_idempotency_key: crypto.randomUUID(),
  });
  assert(result.data?.created === true, 'Bootstrap owner không tạo profile.');
  const { error: updateError } = await admin
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', auth.id);
  assert(!updateError, 'Không thể hoàn tất profile owner test.');
  const client = browser();
  const { error: loginError } = await client.auth.signInWithPassword({
    email: auth.email,
    password,
  });
  assert(!loginError, 'Không thể đăng nhập JWT owner bootstrap.');
  return { id: auth.id, client };
}
async function activeOwnerExists() {
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .eq('role_template', 'OWNER')
    .eq('is_active', true)
    .limit(1);
  assert(!error, 'Không thể kiểm tra owner hiện có trước Cloud test.');
  return (data?.length ?? 0) > 0;
}
async function assertSecondBootstrapDenied() {
  const auth = await authIdentity('second-bootstrap');
  const result = await rpc(
    admin,
    'finalize_staff_profile',
    {
      p_user_id: auth.id,
      p_email: auth.email,
      p_display_name: `${phaseLabel} second bootstrap ${marker}`,
      p_role_template: 'OWNER',
      p_created_by: auth.id,
      p_idempotency_key: crypto.randomUUID(),
    },
    false,
  );
  assert(
    result.error?.code === 'PERMISSION_DENIED',
    'Môi trường đã có owner vẫn cho phép bootstrap owner thứ hai.',
  );
}
async function cleanup() {
  let failed = false;
  let cleanupProfileIds = [];
  if (authIds.length) {
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .in('id', authIds);
    failed ||= Boolean(error);
    cleanupProfileIds = data?.map((profile) => profile.id) ?? [];
  }
  if (cleanupProfileIds.length) {
    const { data, error } = await admin.rpc(cleanupRpc, {
      p_user_ids: cleanupProfileIds,
    });
    failed ||= Boolean(error) || !data?.ok || data.data.remainingProfiles !== 0;
  }
  for (const id of authIds.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(id);
    failed ||= Boolean(error);
  }
  if (failed)
    throw new Error(`Dọn dữ liệu Cloud test ${phaseLabel} chưa sạch.`);
}

try {
  let owner;
  if (await activeOwnerExists()) {
    await pass(
      'môi trường đã có owner chặn bootstrap owner thứ hai',
      async () => {
        await assertSecondBootstrapDenied();
      },
    );
    owner = await identity('owner', 'OWNER');
  } else {
    await pass('bootstrap owner đầu tiên vẫn được phép', async () => {
      owner = await bootstrapOwnerIdentity('owner');
    });
  }
  const staff = await identity('staff', 'SALES_WAREHOUSE', owner.id);

  await pass(
    'owner không thể lách Auth hardening bằng finalize_staff_profile',
    async () => {
      const guarded = await authIdentity('hardening-rpc');
      const result = await rpc(
        admin,
        'finalize_staff_profile',
        {
          p_user_id: guarded.id,
          p_email: guarded.email,
          p_display_name: `${phaseLabel} hardening RPC ${marker}`,
          p_role_template: 'SALES_WAREHOUSE',
          p_created_by: owner.id,
          p_idempotency_key: crypto.randomUUID(),
        },
        false,
      );
      assert(
        result.error?.code === 'PRODUCTION_AUTH_HARDENING_REQUIRED',
        'PRE_PRODUCTION vẫn cho phép tạo profile nhân viên trực tiếp.',
      );
    },
  );

  await pass(
    'owner không thể tạo nhân viên qua Edge Function trước Auth hardening',
    async () => {
      const email = `codex-${testPrefix}-hardening-edge-${runId}@example.invalid`;
      const { data, error } = await owner.client.functions.invoke(
        'create-employee',
        {
          body: {
            email,
            displayName: `${phaseLabel} hardening Edge ${marker}`,
            roleTemplate: 'SALES_WAREHOUSE',
            temporaryPassword: password,
            idempotencyKey: crypto.randomUUID(),
          },
        },
      );

      if (envelope(data) && data.ok === true && data.data?.userId) {
        authIds.push(data.data.userId);
      }

      let result = data;
      if (error?.context instanceof Response) {
        result = await error.context.clone().json();
      }
      assert(
        envelope(result) &&
          result.ok === false &&
          result.error?.code === 'PRODUCTION_AUTH_HARDENING_REQUIRED',
        'PRE_PRODUCTION vẫn cho phép Edge Function tạo nhân viên.',
      );
    },
  );

  const product = await rpc(owner.client, 'save_product', {
    p_product_id: null,
    p_expected_version: null,
    p_product: {
      sku: `P1E-${marker}`,
      barcode: null,
      name: `Sản phẩm Phase 1E ${marker}`,
      categoryId: null,
      unitName: 'Hộp',
      description: null,
      minStockQty: '0',
      isActive: true,
    },
    p_idempotency_key: crypto.randomUUID(),
  });
  const productId = product.data.productId;
  await rpc(owner.client, 'set_product_sale_price', {
    p_product_id: productId,
    p_sale_price: '60000',
    p_change_reason: 'Cloud test Phase 1E',
    p_idempotency_key: crypto.randomUUID(),
  });
  const opening = await rpc(owner.client, 'save_opening_stock_draft', {
    p_count_id: null,
    p_expected_version: null,
    p_note: 'Cloud test Phase 1E',
    p_lines: [
      {
        productId,
        countedQty: '15',
        openingUnitCost: '43333.33',
        sourceSuggestionId: null,
        confirmedUnverified: false,
      },
    ],
    p_idempotency_key: crypto.randomUUID(),
  });
  const openingSubmitted = await rpc(owner.client, 'submit_opening_stock', {
    p_count_id: opening.data.countId,
    p_expected_version: opening.data.version,
    p_idempotency_key: crypto.randomUUID(),
  });
  await rpc(owner.client, 'post_opening_stock', {
    p_count_id: opening.data.countId,
    p_expected_version: openingSubmitted.data.version,
    p_idempotency_key: crypto.randomUUID(),
  });
  const channels = await rpc(staff.client, 'list_sales_channels', {
    p_include_inactive: false,
  });
  const channelId = channels.data.items[0]?.id;
  assert(channelId, 'Không có kênh bán hoạt động cho Cloud test.');

  async function sale(quantity) {
    const draft = await rpc(staff.client, 'save_sale_draft', {
      p_sale_id: null,
      p_expected_version: null,
      p_customer_id: null,
      p_sales_channel_id: channelId,
      p_lines: [{ productId, quantity, lineDiscountAmount: '0', lineOrder: 0 }],
      p_order_discount: '0',
      p_note: 'Cloud test Phase 1E',
      p_idempotency_key: crypto.randomUUID(),
    });
    return rpc(staff.client, 'complete_sale', {
      p_sale_id: draft.data.sale.id,
      p_expected_version: draft.data.sale.version,
      p_payment_method: 'CASH',
      p_idempotency_key: crypto.randomUUID(),
    });
  }
  const firstSale = await sale('6');

  await pass(
    'nhân viên tạo/hoàn tất trả hàng và invoice DTO không có cost',
    async () => {
      const lookup = await rpc(staff.client, 'lookup_sale_for_return', {
        p_full_sale_number: firstSale.data.saleNumber,
      });
      const requested = await rpc(staff.client, 'create_sale_return_request', {
        p_original_sale_id: lookup.data.saleId,
        p_reason: 'Cloud test trả một phần',
        p_lines: [
          { originalSaleLineId: lookup.data.lines[0].id, requestedQty: '1' },
        ],
        p_idempotency_key: crypto.randomUUID(),
      });
      const detail = await rpc(staff.client, 'get_sale_return', {
        p_return_id: requested.data.returnId,
      });
      const completeArgs = {
        p_return_id: requested.data.returnId,
        p_expected_version: detail.data.version,
        p_lines: [
          { saleReturnLineId: detail.data.lines[0].id, acceptedQty: '1' },
        ],
        p_refund_method: 'BANK_TRANSFER',
        p_idempotency_key: crypto.randomUUID(),
      };
      const [completed, retried] = await Promise.all([
        rpc(staff.client, 'complete_sale_return', completeArgs),
        rpc(staff.client, 'complete_sale_return', completeArgs),
      ]);
      assert(
        completed.data.returnNumber.startsWith('TH'),
        'Phiếu trả không được cấp mã TH.',
      );
      assert(
        completed.data.returnNumber === retried.data.returnNumber,
        'Retry tạo phiếu trả trùng.',
      );
      const valuation = await rpc(owner.client, 'get_inventory_valuation', {
        p_cursor_name: null,
        p_cursor_id: null,
        p_limit: 20,
      });
      const line = valuation.data.items.find(
        (item) => item.productId === productId,
      );
      assert(
        line?.onHandQty === '10.000',
        'Trả một hàng không khôi phục đúng số lượng tồn.',
      );
      assert(
        line?.inventoryValue === '433333.30',
        'Trả một hàng không khôi phục đúng giá trị tồn.',
      );
      const invoice = await rpc(staff.client, 'get_sale_invoice', {
        p_sale_id: firstSale.data.saleId,
      });
      assert(invoice.data.version === 2, 'Invoice DTO chưa nâng Version 2.');
      assert(
        !/cost|profit|inventoryValue|avgUnitCost/i.test(
          JSON.stringify(invoice.data),
        ),
        'Invoice DTO làm lộ giá vốn.',
      );
    },
  );

  await pass('owner hủy sale khác và payment được đảo', async () => {
    const secondSale = await sale('1');
    const detail = await rpc(owner.client, 'get_sale_detail', {
      p_sale_id: secondSale.data.saleId,
    });
    const cancelled = await rpc(owner.client, 'cancel_sale', {
      p_sale_id: secondSale.data.saleId,
      p_expected_version: detail.data.version,
      p_reason: 'Cloud test hủy hóa đơn',
      p_idempotency_key: crypto.randomUUID(),
    });
    assert(
      cancelled.data.status === 'CANCELLED',
      'Hủy hóa đơn không đổi trạng thái.',
    );
    const invoice = await rpc(owner.client, 'get_sale_invoice', {
      p_sale_id: secondSale.data.saleId,
    });
    assert(
      invoice.data.sale.paymentStatus === 'REVERSED',
      'Hủy hóa đơn không đảo payment.',
    );
  });

  await pass(
    'nhân viên kiểm kho, owner ghi sổ và bị chặn khỏi cost private',
    async () => {
      const count = await rpc(staff.client, 'save_stock_count', {
        p_count_id: null,
        p_expected_version: null,
        p_note: 'Cloud test kiểm kho',
        p_lines: [{ productId, countedQty: '9' }],
        p_idempotency_key: crypto.randomUUID(),
      });
      const submitted = await rpc(staff.client, 'submit_stock_count', {
        p_count_id: count.data.countId,
        p_expected_version: count.data.version,
        p_idempotency_key: crypto.randomUUID(),
      });
      const posted = await rpc(owner.client, 'post_stock_count', {
        p_count_id: count.data.countId,
        p_expected_version: submitted.data.version,
        p_estimated_costs: [],
        p_idempotency_key: crypto.randomUUID(),
      });
      assert(
        posted.data.status === 'POSTED',
        'Phiếu kiểm kho không được ghi sổ.',
      );
      const valuation = await rpc(
        staff.client,
        'get_inventory_valuation',
        {
          p_cursor_name: null,
          p_cursor_id: null,
          p_limit: 10,
        },
        false,
      );
      assert(
        valuation.error.code === 'PERMISSION_DENIED',
        'Nhân viên xem được valuation.',
      );
      const session = await staff.client.auth.getSession();
      const response = await fetch(
        `${url}/rest/v1/sale_return_line_costs?select=*`,
        {
          headers: {
            apikey: publishableKey,
            Authorization: `Bearer ${session.data.session.access_token}`,
            'Accept-Profile': 'app_private',
          },
        },
      );
      assert(!response.ok, 'Browser truy cập được private return cost.');
    },
  );

  await pass(
    'báo cáo Phase 1F đối soát ledger và không lộ cost cho nhân viên',
    async () => {
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts()
        .reduce((value, item) => ({ ...value, [item.type]: item.value }), {});
      const date = `${today.year}-${today.month}-${today.day}`;
      const report = await rpc(staff.client, 'get_revenue_report', {
        p_from: date,
        p_to: date,
        p_scope: 'OWN',
      });
      assert(
        report.data.version === 1 &&
          report.data.summary.netRevenue !== undefined,
        'Revenue report không trả DTO v1.',
      );
      assert(
        !/cogs|cost|profit|inventoryValue/i.test(JSON.stringify(report.data)),
        'Revenue report nhân viên làm lộ dữ liệu giá vốn.',
      );
      const denied = await rpc(
        staff.client,
        'get_owner_dashboard',
        { p_from: date, p_to: date },
        false,
      );
      assert(
        denied.error.code === 'PERMISSION_DENIED',
        'Nhân viên gọi được owner dashboard.',
      );
      const ownerDashboard = await rpc(owner.client, 'get_owner_dashboard', {
        p_from: date,
        p_to: date,
      });
      assert(
        Number(ownerDashboard.data.grossProfit).toFixed(2) ===
          (
            Number(ownerDashboard.data.netRevenue) -
            Number(ownerDashboard.data.netCogs)
          ).toFixed(2),
        'Owner dashboard không đối soát net revenue - net COGS.',
      );
      const events = await rpc(owner.client, 'get_profit_report', {
        p_from: date,
        p_to: date,
        p_cursor_occurred_at: null,
        p_cursor_id: null,
        p_limit: 50,
      });
      assert(
        events.data.items.some(
          (item) => item.eventType === 'RETURN_COMPLETED',
        ) &&
          events.data.items.some((item) => item.eventType === 'SALE_CANCELLED'),
        'Profit report không trả sự kiện trả hàng và hủy hóa đơn.',
      );
    },
  );
} finally {
  await cleanup();
}
console.log(`Cloud ${phaseLabel} passed ${passed} cases.`);
