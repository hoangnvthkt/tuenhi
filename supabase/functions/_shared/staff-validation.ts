export type EmployeeRole = 'SALES_WAREHOUSE' | 'BUSINESS' | 'WAREHOUSE_VIEWER';

export type ValidationResult<T> =
  { ok: true; value: T } | { ok: false; message: string };

export type CreateEmployeeInput = {
  email: string;
  displayName: string;
  roleTemplate: EmployeeRole;
  temporaryPassword: string;
  idempotencyKey: string;
  pendingUserId?: string;
};

export type StaffActionInput = {
  userId: string;
  reason: string;
  idempotencyKey: string;
};

export type ResetPasswordInput = StaffActionInput & {
  temporaryPassword: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])[\s\S]{10,128}$/;

function recordValue(input: unknown): Record<string, unknown> | null {
  return typeof input === 'object' && input !== null
    ? (input as Record<string, unknown>)
    : null;
}

function invalid(message: string): ValidationResult<never> {
  return { ok: false, message };
}

export function parseCreateEmployeeInput(
  input: unknown,
): ValidationResult<CreateEmployeeInput> {
  const value = recordValue(input);
  if (!value) return invalid('Dữ liệu gửi lên chưa hợp lệ.');

  const email =
    typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
  const displayName =
    typeof value.displayName === 'string' ? value.displayName.trim() : '';
  const roleTemplate = value.roleTemplate;
  const temporaryPassword = value.temporaryPassword;
  const idempotencyKey = value.idempotencyKey;
  const pendingUserId = value.pendingUserId;

  if (!emailPattern.test(email) || email.length > 320) {
    return invalid('Email chưa đúng định dạng.');
  }
  if (displayName.length < 1 || displayName.length > 120) {
    return invalid('Tên hiển thị phải có từ 1 đến 120 ký tự.');
  }
  if (
    roleTemplate !== 'SALES_WAREHOUSE' &&
    roleTemplate !== 'BUSINESS' &&
    roleTemplate !== 'WAREHOUSE_VIEWER'
  ) {
    return invalid('Vai trò nhân viên chưa hợp lệ.');
  }
  if (
    typeof temporaryPassword !== 'string' ||
    !passwordPattern.test(temporaryPassword)
  ) {
    return invalid(
      'Mật khẩu phải có từ 10 đến 128 ký tự, gồm chữ thường, chữ hoa và số.',
    );
  }
  if (typeof idempotencyKey !== 'string' || !uuidPattern.test(idempotencyKey)) {
    return invalid('Mã yêu cầu chưa hợp lệ.');
  }
  if (
    pendingUserId !== undefined &&
    (typeof pendingUserId !== 'string' || !uuidPattern.test(pendingUserId))
  ) {
    return invalid('Mã tài khoản chờ hoàn tất chưa hợp lệ.');
  }

  return {
    ok: true,
    value: {
      email,
      displayName,
      roleTemplate,
      temporaryPassword,
      idempotencyKey,
      ...(typeof pendingUserId === 'string' ? { pendingUserId } : {}),
    },
  };
}

export function parseStaffActionInput(
  input: unknown,
): ValidationResult<StaffActionInput> {
  const value = recordValue(input);
  if (!value) return invalid('Dữ liệu gửi lên chưa hợp lệ.');

  const userId = value.userId;
  const reason = typeof value.reason === 'string' ? value.reason.trim() : '';
  const idempotencyKey = value.idempotencyKey;

  if (typeof userId !== 'string' || !uuidPattern.test(userId)) {
    return invalid('Mã tài khoản chưa hợp lệ.');
  }
  if (reason.length < 1 || reason.length > 500) {
    return invalid('Vui lòng nhập lý do, tối đa 500 ký tự.');
  }
  if (typeof idempotencyKey !== 'string' || !uuidPattern.test(idempotencyKey)) {
    return invalid('Mã yêu cầu chưa hợp lệ.');
  }

  return { ok: true, value: { userId, reason, idempotencyKey } };
}

export function parseResetPasswordInput(
  input: unknown,
): ValidationResult<ResetPasswordInput> {
  const action = parseStaffActionInput(input);
  if (!action.ok) return action;

  const value = recordValue(input);
  const temporaryPassword = value?.temporaryPassword;
  if (
    typeof temporaryPassword !== 'string' ||
    !passwordPattern.test(temporaryPassword)
  ) {
    return invalid(
      'Mật khẩu phải có từ 10 đến 128 ký tự, gồm chữ thường, chữ hoa và số.',
    );
  }

  return { ok: true, value: { ...action.value, temporaryPassword } };
}
