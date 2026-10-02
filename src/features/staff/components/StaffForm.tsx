import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { CreateStaffInput } from '../api/staff-api';

const staffFormSchema = z.object({
  email: z.email('Email chưa đúng định dạng.'),
  displayName: z.string().trim().min(1, 'Vui lòng nhập tên hiển thị.').max(120),
  roleTemplate: z.enum(['SALES_WAREHOUSE', 'BUSINESS', 'WAREHOUSE_VIEWER']),
  temporaryPassword: z
    .string()
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{10,128}$/,
      'Mật khẩu phải có ít nhất 10 ký tự, gồm chữ thường, chữ hoa và số.',
    ),
});

export function StaffForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (values: CreateStaffInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateStaffInput>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      email: '',
      displayName: '',
      roleTemplate: 'SALES_WAREHOUSE',
      temporaryPassword: '',
    },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await onSubmit(values);
      reset();
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Không thể tạo tài khoản. Vui lòng thử lại.',
      );
    }
  });

  return (
    <form noValidate onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
      <div>
        <label
          htmlFor="staff-email"
          className="mb-2 block text-sm font-medium text-slate-800"
        >
          Email nhân viên
        </label>
        <input
          id="staff-email"
          type="email"
          autoComplete="off"
          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
          {...register('email')}
        />
        {errors.email ? (
          <p className="mt-2 text-sm text-red-700">{errors.email.message}</p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="staff-name"
          className="mb-2 block text-sm font-medium text-slate-800"
        >
          Tên hiển thị
        </label>
        <input
          id="staff-name"
          type="text"
          autoComplete="off"
          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
          {...register('displayName')}
        />
        {errors.displayName ? (
          <p className="mt-2 text-sm text-red-700">
            {errors.displayName.message}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="staff-role"
          className="mb-2 block text-sm font-medium text-slate-800"
        >
          Vai trò
        </label>
        <select
          id="staff-role"
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
          {...register('roleTemplate')}
        >
          <option value="SALES_WAREHOUSE">Bán hàng &amp; Kho</option>
          <option value="BUSINESS">Nhân viên kinh doanh</option>
          <option value="WAREHOUSE_VIEWER">Kho — chỉ xem</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="staff-temporary-password"
          className="mb-2 block text-sm font-medium text-slate-800"
        >
          Mật khẩu tạm
        </label>
        <input
          id="staff-temporary-password"
          type="password"
          autoComplete="new-password"
          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
          {...register('temporaryPassword')}
        />
        {errors.temporaryPassword ? (
          <p className="mt-2 text-sm text-red-700">
            {errors.temporaryPassword.message}
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            Ít nhất 10 ký tự, có chữ thường, chữ hoa và số.
          </p>
        )}
      </div>

      {serverError ? (
        <p
          role="alert"
          className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {serverError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3 sm:col-span-2 sm:justify-end">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg px-4 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Hủy
          </button>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {isSubmitting ? 'Đang tạo…' : 'Tạo tài khoản'}
        </button>
      </div>
    </form>
  );
}
