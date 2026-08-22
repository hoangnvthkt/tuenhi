import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useSession } from './use-session';

const loginSchema = z.object({
  email: z.email('Email chưa đúng định dạng.'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu.'),
});

type LoginValues = z.infer<typeof loginSchema>;

function safeLoginError(error: unknown) {
  if (
    error instanceof Error &&
    error.message === 'Email hoặc mật khẩu không đúng.'
  ) {
    return error.message;
  }

  return 'Không thể đăng nhập. Vui lòng thử lại.';
}

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useSession();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    try {
      await signIn(email, password);
      navigate('/', { replace: true });
    } catch (error) {
      setServerError(safeLoginError(error));
    }
  });

  return (
    <main className="grid min-h-screen bg-slate-50 px-4 py-10 sm:place-items-center">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-8">
          <p className="text-sm font-semibold text-teal-700">TUỆ NHI</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Đăng nhập bán hàng
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Sử dụng tài khoản được chủ cửa hàng cấp.
          </p>
        </div>

        <form className="space-y-5" noValidate onSubmit={submit}>
          <div>
            <label
              className="mb-2 block text-sm font-medium text-slate-800"
              htmlFor="email"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition-colors focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
              {...register('email')}
            />
            {errors.email ? (
              <p id="email-error" className="mt-2 text-sm text-red-700">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <div>
            <label
              className="mb-2 block text-sm font-medium text-slate-800"
              htmlFor="password"
            >
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition-colors focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
              {...register('password')}
            />
            {errors.password ? (
              <p id="password-error" className="mt-2 text-sm text-red-700">
                {errors.password.message}
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
            {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      </section>
    </main>
  );
}
