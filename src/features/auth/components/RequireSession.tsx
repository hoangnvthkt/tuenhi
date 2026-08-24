import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '../hooks/use-session';

export function RequireSession({
  permission,
}: {
  permission?: string | readonly string[];
}) {
  const location = useLocation();
  const { status, session, errorMessage } = useSession();

  if (status === 'loading') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <p role="status" className="text-sm text-slate-600">
          Đang kiểm tra phiên đăng nhập…
        </p>
      </main>
    );
  }

  if (status === 'anonymous') {
    return <Navigate replace to="/login" state={{ from: location }} />;
  }

  if (status === 'error' || !session) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <div
          role="alert"
          className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 text-sm text-red-800 shadow-sm"
        >
          {errorMessage ??
            'Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại.'}
        </div>
      </main>
    );
  }

  if (session.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate replace to="/change-password" />;
  }

  const requiredPermissions =
    typeof permission === 'string' ? [permission] : (permission ?? []);
  if (
    requiredPermissions.length > 0 &&
    !requiredPermissions.some((item) => session.permissions.includes(item))
  ) {
    return (
      <main className="grid min-h-[50vh] place-items-center px-4">
        <p role="alert" className="text-sm text-slate-700">
          Bạn không có quyền truy cập chức năng này.
        </p>
      </main>
    );
  }

  return <Outlet />;
}
