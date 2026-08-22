import { createClient } from '@supabase/supabase-js';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường bắt buộc: ${name}`);
  return value;
}

function requirePasswordPolicy(password) {
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])[\s\S]{10,128}$/.test(password)) {
    throw new Error(
      'BOOTSTRAP_OWNER_PASSWORD phải có từ 10 đến 128 ký tự, gồm chữ thường, chữ hoa và số.',
    );
  }
}

async function findAuthUserByEmail(admin, email) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw new Error('Không thể kiểm tra tài khoản Auth hiện có.');
    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email,
    );
    if (match) return match;
    if (data.users.length < 100) return null;
  }
  throw new Error('Danh sách tài khoản vượt giới hạn kiểm tra bootstrap.');
}

async function main() {
  const url = required('SUPABASE_URL');
  const secretKey = required('SUPABASE_SECRET_KEY');
  const email = required('BOOTSTRAP_OWNER_EMAIL').toLowerCase();
  const password = required('BOOTSTRAP_OWNER_PASSWORD');
  const displayName = required('BOOTSTRAP_OWNER_DISPLAY_NAME');
  requirePasswordPolicy(password);

  const admin = createClient(url, secretKey, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: owners, error: ownerError } = await admin
    .from('profiles')
    .select('id,is_active')
    .eq('role_template', 'OWNER');
  if (ownerError) {
    throw new Error(
      'Migration Phase 1A chưa sẵn sàng hoặc không thể đọc hồ sơ.',
    );
  }

  const activeOwner = owners.find((owner) => owner.is_active);
  if (activeOwner) {
    console.log(`Owner đã tồn tại: ${activeOwner.id}`);
    return;
  }
  if (owners.length > 0) {
    throw new Error(
      'Đã có hồ sơ owner nhưng đang bị khóa. Không tự tạo owner mới; cần kiểm tra thủ công.',
    );
  }

  let authUser = await findAuthUserByEmail(admin, email);
  if (!authUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user)
      throw new Error('Không thể tạo tài khoản Auth owner.');
    authUser = data.user;
  }

  const { data: finalization, error: finalizationError } = await admin.rpc(
    'finalize_staff_profile',
    {
      p_user_id: authUser.id,
      p_email: email,
      p_display_name: displayName,
      p_role_template: 'OWNER',
      p_created_by: authUser.id,
      p_idempotency_key: crypto.randomUUID(),
    },
  );

  if (
    finalizationError ||
    typeof finalization !== 'object' ||
    finalization === null ||
    finalization.ok !== true
  ) {
    throw new Error(
      'Auth owner đã tồn tại nhưng không thể hoàn tất hồ sơ owner.',
    );
  }

  console.log(`Bootstrap owner hoàn tất: ${authUser.id}`);
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : 'Bootstrap owner thất bại.';
  console.error(message);
  process.exitCode = 1;
});
