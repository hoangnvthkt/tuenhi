import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useSession } from '../hooks/use-session';

const passwordPolicyMessage =
  'Mật khẩu phải có ít nhất 10 ký tự, gồm chữ thường, chữ hoa và số.';

const passwordChangeSchema = z
  .object({
    password: z
      .string()
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{10,}$/,
        passwordPolicyMessage,
      ),
    confirmation: z.string(),
  })
  .refine(({ confirmation, password }) => confirmation === password, {
    path: ['confirmation'],
    message: 'Mật khẩu nhập lại chưa khớp.',
  });

type PasswordChangeValues = z.infer<typeof passwordChangeSchema>;

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { changePassword, signOut } = useSession();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordChangeValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { password: '', confirmation: '' },
  });

  const submit = handleSubmit(async ({ password }) => {
    setServerError(null);
    try {
      await changePassword(password);
      navigate('/', { replace: true });
    } catch {
      setServerError('Không thể đổi mật khẩu. Vui lòng thử lại.');
    }
  });

  return (
    <main className="grid min-h-screen bg-slate-50 px-4 py-10 sm:place-items-center">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-7">
          <p className="text-sm font-semibold text-teal-700">
            BẢO MẬT TÀI KHOẢN
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Tạo mật khẩu mới
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Bạn cần đổi mật khẩu tạm trước khi sử dụng hệ thống.
          </p>
        </div>

        <form className="space-y-5" noValidate onSubmit={submit}>
          <div>
            <label
              className="mb-2 block text-sm font-medium text-slate-800"
              htmlFor="new-password"
            >
              Mật khẩu mới
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password ? 'new-password-error' : 'password-hint'
              }
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition-colors focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
              {...register('password')}
            />
            <p id="password-hint" className="mt-2 text-sm text-slate-600">
              Ít nhất 10 ký tự, có chữ thường, chữ hoa và số.
            </p>
            {errors.password ? (
              <p id="new-password-error" className="mt-2 text-sm text-red-700">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <div>
            <label
              className="mb-2 block text-sm font-medium text-slate-800"
              htmlFor="new-password-confirmation"
            >
              Nhập lại mật khẩu mới
            </label>
            <input
              id="new-password-confirmation"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmation)}
              aria-describedby={
                errors.confirmation ? 'confirmation-error' : undefined
              }
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition-colors focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
              {...register('confirmation')}
            />
            {errors.confirmation ? (
              <p id="confirmation-error" className="mt-2 text-sm text-red-700">
                {errors.confirmation.message}
              </p>
            ) : null}
          </div>

          {serverError ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {serverError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="min-h-11 w-full rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Đang đổi mật khẩu…' : 'Đổi mật khẩu'}
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-11 w-full rounded-lg px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            Đăng xuất
          </button>
        </form>
      </section>
    </main>
  );
}
