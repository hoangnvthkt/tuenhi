import { createClient } from '@supabase/supabase-js';

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
  { headers: { Authorization: `Bearer ${accessToken}` } },
);
assert(
  keyResponse.ok,
  'Không thể lấy khóa service_role cho runner Cloud tạm thời.',
);
const apiKeys = await keyResponse.json();
const serviceKey = apiKeys.find(
  (item) => item.name === 'service_role',
)?.api_key;
assert(serviceKey, 'Project chưa trả khóa service_role cho runner.');

const admin = createClient(url, serviceKey, {
  db: { schema: 'api' },
  auth: { persistSession: false, autoRefreshToken: false },
});
const browser = () =>
  createClient(url, publishableKey, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
const runId = crypto.randomUUID();
const marker = runId.replaceAll('-', '').slice(0, 18).toUpperCase();
const password = `Tn!${crypto.randomUUID()}aA9`;
const authIds = [];
const profileIds = [];
let passed = 0;

async function createIdentity(label, roleTemplate, createdBy = null) {
  const email = `codex-phase1c-${label}-${runId}@example.invalid`;
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
    display_name: `codex-phase1c-${label}-${marker}`,
    role_template: roleTemplate,
    is_active: true,
    must_change_password: false,
    created_by: createdBy,
  });
  assert(!profileError, `Không thể tạo profile ${label}.`);
  profileIds.push(data.user.id);
  const client = browser();
  const { error: loginError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  assert(!loginError, `Không thể đăng nhập JWT thật cho ${label}.`);
  return { id: data.user.id, client };
}

async function rpc(client, name, args, ok = true) {
  const result = await client.rpc(name, args);
  assert(
    !result.error,
    `RPC ${name} không trả envelope (${result.error?.code ?? 'UNKNOWN'}: ${result.error?.message ?? 'không rõ lỗi'}).`,
  );
  assert(envelope(result.data), `RPC ${name} trả sai cấu trúc.`);
  assert(result.data.ok === ok, `RPC ${name} trả trạng thái ngoài dự kiến.`);
  return result.data;
}
async function pass(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}
async function cleanup() {
  let failed = false;
  if (profileIds.length > 0) {
    const { data, error } = await admin.rpc('cleanup_phase1c_test_users', {
      p_user_ids: profileIds,
    });
    failed ||= Boolean(error) || !data?.ok || data.data.remainingProfiles !== 0;
  }
  for (const id of authIds.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(id);
    failed ||= Boolean(error);
  }
  if (failed) throw new Error('Dọn dữ liệu test Phase 1C chưa sạch.');
}

try {
  const owner = await createIdentity('owner', 'OWNER');
  const staff = await createIdentity('staff', 'SALES_WAREHOUSE', owner.id);

  await pass('JWT nhân viên bị chặn khỏi cost RPC và valuation', async () => {
    const list = await rpc(staff.client, 'list_purchase_receipts', {
      p_filters: {},
      p_cursor_updated_at: null,
      p_cursor_id: null,
      p_limit: 10,
    });
    assert(
      Array.isArray(list.data.items),
      'Nhân viên không đọc được operational list.',
    );
    const cost = await rpc(
      staff.client,
      'get_purchase_receipt_cost_detail',
      {
        p_receipt_id: crypto.randomUUID(),
      },
      false,
    );
    assert(
      cost.error.code === 'PERMISSION_DENIED',
      'Nhân viên lấy được cost DTO.',
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
  });

  await pass(
    'app_private cost ledger không được expose qua Data API',
    async () => {
      const { data } = await staff.client.auth.getSession();
      const response = await fetch(
        `${url}/rest/v1/inventory_cost_balances?select=*`,
        {
          headers: {
            apikey: publishableKey,
            Authorization: `Bearer ${data.session.access_token}`,
            'Accept-Profile': 'app_private',
          },
        },
      );
      assert(!response.ok, 'Browser truy cập được app_private cost ledger.');
    },
  );

  const makeProduct = async (suffix) => {
    const result = await rpc(owner.client, 'save_product', {
      p_product_id: null,
      p_expected_version: null,
      p_product: {
        sku: `P1C-${suffix}-${marker}`,
        barcode: null,
        name: `Sản phẩm ${suffix} ${marker}`,
        categoryId: null,
        unitName: 'Hộp',
        description: null,
        minStockQty: '0',
        isActive: true,
      },
      p_idempotency_key: crypto.randomUUID(),
    });
    return result.data.productId;
  };
  const purchaseProductId = await makeProduct('PN');
  const openingProductId = await makeProduct('MS');

  await pass(
    'nhân viên submit, owner post đồng thời idempotent, DTO nhân viên không có cost',
    async () => {
      const draft = await rpc(staff.client, 'save_purchase_receipt_draft', {
        p_receipt_id: null,
        p_expected_version: null,
        p_supplier_id: null,
        p_received_at: new Date().toISOString(),
        p_note: 'Cloud JWT Phase 1C',
        p_lines: [{ productId: purchaseProductId, receivedQty: '2.500' }],
        p_idempotency_key: crypto.randomUUID(),
      });
      const receiptId = draft.data.receiptId;
      const detail = await rpc(
        staff.client,
        'get_purchase_receipt_operational',
        {
          p_receipt_id: receiptId,
        },
      );
      const submitted = await rpc(staff.client, 'submit_purchase_receipt', {
        p_receipt_id: receiptId,
        p_expected_version: draft.data.version,
        p_idempotency_key: crypto.randomUUID(),
      });
      const key = crypto.randomUUID();
      const args = {
        p_receipt_id: receiptId,
        p_expected_version: submitted.data.version,
        p_cost_lines: [{ lineId: detail.data.lines[0].id, unitCost: '40000' }],
        p_idempotency_key: key,
      };
      const [first, second] = await Promise.all([
        rpc(owner.client, 'post_purchase_receipt', args),
        rpc(owner.client, 'post_purchase_receipt', args),
      ]);
      assert(
        first.data.receiptNumber === second.data.receiptNumber,
        'Retry đồng thời tạo kết quả khác nhau.',
      );
      const operational = await rpc(
        staff.client,
        'get_purchase_receipt_operational',
        {
          p_receipt_id: receiptId,
        },
      );
      assert(
        !JSON.stringify(operational.data).match(
          /unitCost|lineCost|inventoryValue|avgUnitCost/,
        ),
        'Operational DTO làm lộ trường giá vốn.',
      );
      const ownerCost = await rpc(
        owner.client,
        'get_purchase_receipt_cost_detail',
        {
          p_receipt_id: receiptId,
        },
      );
      assert(
        ownerCost.data.totalCost === '100000.00',
        'Owner nhận sai tổng giá nhập.',
      );
    },
  );

  await pass('opening post cập nhật valuation owner-only', async () => {
    const draft = await rpc(owner.client, 'save_opening_stock_draft', {
      p_count_id: null,
      p_expected_version: null,
      p_note: 'Cloud JWT opening',
      p_lines: [
        {
          productId: openingProductId,
          countedQty: '3',
          openingUnitCost: '12500',
          sourceSuggestionId: null,
          confirmedUnverified: false,
        },
      ],
      p_idempotency_key: crypto.randomUUID(),
    });
    const counted = await rpc(owner.client, 'submit_opening_stock', {
      p_count_id: draft.data.countId,
      p_expected_version: draft.data.version,
      p_idempotency_key: crypto.randomUUID(),
    });
    await rpc(owner.client, 'post_opening_stock', {
      p_count_id: draft.data.countId,
      p_expected_version: counted.data.version,
      p_idempotency_key: crypto.randomUUID(),
    });
    const valuation = await rpc(owner.client, 'get_inventory_valuation', {
      p_cursor_name: null,
      p_cursor_id: null,
      p_limit: 100,
    });
    const item = valuation.data.items.find(
      (row) => row.productId === openingProductId,
    );
    assert(
      item?.onHandQty === '3.000' && item.inventoryValue === '37500.00',
      'Valuation opening không khớp.',
    );
  });
} finally {
  await cleanup();
}

console.log(`Phase 1C Cloud JWT: ${passed} kiểm tra đã đạt.`);
