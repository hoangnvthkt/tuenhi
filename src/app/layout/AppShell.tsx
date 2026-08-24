import { NavLink, Outlet } from 'react-router';
import { useSession } from '@/features/auth';
import { useCatalogRealtime } from '../../features/catalog/use-catalog-realtime';
import { NotificationCenter } from '@/features/notifications';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { navigationItems } from './navigation-items';

const roleLabels = {
  SALES_WAREHOUSE: 'Bán hàng & kho',
  BUSINESS: 'Kinh doanh',
  OWNER: 'Chủ cửa hàng',
} as const;

function NavigationLinks({
  mobile,
  permissions,
}: {
  mobile: boolean;
  permissions: readonly string[];
}) {
  return (
    <>
      {navigationItems
        .filter(
          (item) =>
            !('permission' in item) || permissions.includes(item.permission),
        )
        .map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                'relative inline-flex min-h-11 items-center justify-center px-3 text-sm font-medium',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700',
                isActive
                  ? 'text-teal-800'
                  : 'text-slate-600 hover:text-slate-950',
                mobile ? 'flex-1' : 'rounded-md',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <span>{item.label}</span>
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className={
                      mobile
                        ? 'absolute bottom-1 h-1 w-1 rounded-full bg-current'
                        : 'absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-current'
                    }
                  />
                ) : null}
              </>
            )}
          </NavLink>
        ))}
    </>
  );
}

export function AppShell() {
  const isOnline = useOnlineStatus();
  const { session, signOut } = useSession();
  useCatalogRealtime({ isOnline });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3 sm:px-6">
          <div>
            <p className="text-lg font-bold tracking-tight text-teal-800">
              Tuệ Nhi
            </p>
            <p className="text-sm text-slate-600">Bán hàng &amp; Kho</p>
          </div>
          <div className="flex min-w-0 items-center gap-5">
            <nav
              aria-label="Điều hướng máy tính"
              className="hidden lg:flex lg:items-center lg:gap-1"
            >
              <NavigationLinks
                mobile={false}
                permissions={session?.permissions ?? []}
              />
            </nav>
            <NotificationCenter />
            {session ? (
              <details className="relative">
                <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg px-3 text-left hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
                  <span className="min-w-0">
                    <span className="block max-w-36 truncate text-sm font-medium text-slate-900">
                      {session.displayName}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {roleLabels[session.roleTemplate]}
                    </span>
                  </span>
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                  >
                    Đăng xuất
                  </button>
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </header>

      {!isOnline ? (
        <div
          role="status"
          className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          Bạn đang ngoại tuyến. Các thao tác ghi sổ sẽ bị khóa.
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-4 py-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:pb-8">
        <Outlet />
      </main>

      <nav
        aria-label="Điều hướng di động"
        className="fixed bottom-0 left-0 right-0 z-10 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <NavigationLinks mobile permissions={session?.permissions ?? []} />
      </nav>
    </div>
  );
}
