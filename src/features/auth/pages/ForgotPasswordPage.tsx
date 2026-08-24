import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import {
  createPasswordResetApi,
  type PasswordResetApi,
} from '../api/password-reset-api';

const forgotPasswordSchema = z.object({
  email: z.email('Email chưa đúng định dạng.'),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordPage({
  api: providedApi,
}: {
  api?: PasswordResetApi;
}) {
  const [api] = useState(() => providedApi ?? createPasswordResetApi());
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const submit = handleSubmit(async ({ email }) => {
    setServerError(null);
    try {
      await api.request(email);
      setSent(true);
    } catch {
      setServerError('Không thể gửi yêu cầu. Vui lòng thử lại sau.');
    }
  });

  return (
    <main className="grid min-h-screen bg-slate-50 px-4 py-10 sm:place-items-center">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-7">
          <p className="text-sm font-semibold text-teal-700">TUỆ NHI</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Đặt lại mật khẩu
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Nhập email tài khoản để nhận hướng dẫn tạo mật khẩu mới.
          </p>
        </div>

        {sent ? (
          <div className="space-y-5">
            <p
              role="status"
              className="rounded-lg bg-teal-50 px-3 py-3 text-sm leading-6 text-teal-950"
            >
              Nếu email phù hợp với một tài khoản, hướng dẫn đặt lại mật khẩu đã
              được gửi. Vui lòng kiểm tra hộp thư và thư rác.
            </p>
            <Link
              to="/login"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              Quay lại đăng nhập
            </Link>
          </div>
        ) : (
          <form className="space-y-5" noValidate onSubmit={submit}>
            <div>
              <label
                className="mb-2 block text-sm font-medium text-slate-800"
                htmlFor="recovery-email"
              >
                Email
              </label>
              <input
                id="recovery-email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={
                  errors.email ? 'recovery-email-error' : undefined
                }
                className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition-colors focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
                {...register('email')}
              />
              {errors.email ? (
                <p
                  id="recovery-email-error"
                  className="mt-2 text-sm text-red-700"
                >
                  {errors.email.message}
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
              {isSubmitting ? 'Đang gửi…' : 'Gửi hướng dẫn'}
            </button>
            <Link
              to="/login"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              Quay lại đăng nhập
            </Link>
          </form>
        )}
      </section>
    </main>
  );
}
