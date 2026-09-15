import { lazy, Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { useSession } from '@/features/auth';
import { NotificationCenter } from '@/features/notifications';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { PendingFinancialCommandRecoveryBanner } from '@/shared/ui/feedback/PendingFinancialCommandRecoveryBanner';
import { navigationItems } from './navigation-items';

const roleLabels = {
  SALES_WAREHOUSE: 'Bán hàng & kho',
  BUSINESS: 'Kinh doanh',
  OWNER: 'Chủ cửa hàng',
} as const;

const CatalogRealtimeBridge = lazy(() =>
  import('@/features/catalog').then((module) => ({
    default: module.CatalogRealtimeBridge,
  })),
);

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
                `app-nav-link tone-${item.tone} relative inline-flex min-h-11 items-center justify-center gap-2 text-sm font-semibold`,
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700',
                isActive
                  ? 'text-teal-800'
                  : 'text-slate-600 hover:text-slate-950',
                mobile
                  ? 'app-nav-mobile min-w-0 flex-1 flex-col px-0.5 py-2'
                  : 'rounded-xl px-3',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <span className="nav-icon">
                  <item.icon size={21} weight="regular" aria-hidden="true" />
                </span>
                <span className="whitespace-nowrap">{item.label}</span>
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

  return (
    <div className="app-shell min-h-screen text-slate-900">
      <Suspense fallback={null}>
        <CatalogRealtimeBridge isOnline={isOnline} />
      </Suspense>
      <header className="border-b border-slate-200 bg-white">
        <div className="app-header mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex shrink-0 items-center gap-3">
            <img src="/logo.svg" alt="" className="h-10 w-10 rounded-xl" />
            <div>
              <p className="text-lg font-bold tracking-tight text-teal-800">
                Tuệ Nhi
              </p>
              <p className="text-sm text-slate-600">Bán hàng &amp; Kho</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <nav
              aria-label="Điều hướng máy tính"
              className="hidden xl:flex xl:items-center xl:gap-1"
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
                    <span className="block max-w-24 truncate text-sm font-medium text-slate-900 sm:max-w-36">
                      {session.displayName}
                    </span>
                    <span className="hidden whitespace-nowrap text-xs text-slate-500 sm:block">
                      {roleLabels[session.roleTemplate]}
                    </span>
                  </span>
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                  <Link
                    to="/change-password"
                    className="flex min-h-11 items-center rounded-lg px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                  >
                    Đổi mật khẩu
                  </Link>
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

      {session ? (
        <PendingFinancialCommandRecoveryBanner
          userId={session.userId}
          online={isOnline}
        />
      ) : null}

      <main className="app-content mx-auto max-w-7xl px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 xl:pb-8">
        <Outlet />
      </main>

      <nav
        aria-label="Điều hướng di động"
        className="fixed bottom-0 left-0 right-0 z-10 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] xl:hidden"
      >
        <NavigationLinks mobile permissions={session?.permissions ?? []} />
      </nav>
    </div>
  );
}
