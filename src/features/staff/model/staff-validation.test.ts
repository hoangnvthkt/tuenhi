import { describe, expect, it } from 'vitest';
import {
  parseCreateEmployeeInput,
  parseResetPasswordInput,
  parseStaffActionInput,
} from '../../../../supabase/functions/_shared/staff-validation';

const validCreate = {
  email: 'nhanvien@example.com',
  displayName: 'Nguyễn Văn An',
  roleTemplate: 'SALES_WAREHOUSE',
  temporaryPassword: 'Matkhau123',
  idempotencyKey: '00000000-0000-4000-8000-000000000100',
};

describe('staff Edge Function validation', () => {
  it('normalizes a valid employee create payload', () => {
    expect(
      parseCreateEmployeeInput({
        ...validCreate,
        email: '  NHANVIEN@example.com ',
      }),
    ).toEqual({ ok: true, value: validCreate });
  });

  it.each(['OWNER', 'MANAGER', ''])(
    'rejects employee role %j',
    (roleTemplate) => {
      expect(
        parseCreateEmployeeInput({ ...validCreate, roleTemplate }),
      ).toEqual(expect.objectContaining({ ok: false }));
    },
  );

  it.each(['matkhau123', 'MATKHAU123', 'Matkhaumoi', 'Mat1'])(
    'rejects weak password %j',
    (temporaryPassword) => {
      expect(
        parseCreateEmployeeInput({ ...validCreate, temporaryPassword }),
      ).toEqual(expect.objectContaining({ ok: false }));
    },
  );

  it('requires a reason for activation changes', () => {
    expect(
      parseStaffActionInput({
        userId: '00000000-0000-4000-8000-000000000101',
        reason: '   ',
        idempotencyKey: '00000000-0000-4000-8000-000000000102',
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it('validates reset password and target identity together', () => {
    expect(
      parseResetPasswordInput({
        userId: '00000000-0000-4000-8000-000000000101',
        reason: 'Nhân viên quên mật khẩu',
        temporaryPassword: 'Matkhau456',
        idempotencyKey: '00000000-0000-4000-8000-000000000102',
      }),
    ).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ temporaryPassword: 'Matkhau456' }),
      }),
    );
  });
});
