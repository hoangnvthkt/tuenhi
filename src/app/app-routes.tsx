import type { RouteObject } from 'react-router';
import { ChangePasswordPage } from '../features/auth/ChangePasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireSession } from '../features/auth/RequireSession';
import { StaffPage } from '../features/staff/StaffPage';
import { AppShell } from './layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { FoundationSectionPage } from './pages/FoundationSectionPage';

function foundationPage(title: string) {
  return (
    <FoundationSectionPage
      title={title}
      description={`Phân hệ ${title} sẽ được kích hoạt trong giai đoạn đã được phê duyệt.`}
    />
  );
}

export const appRoutes: RouteObject[] = [
  {
    path: 'login',
    element: <LoginPage />,
  },
  {
    element: <RequireSession />,
    children: [
      { path: 'change-password', element: <ChangePasswordPage /> },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'products', element: foundationPage('Hàng hóa') },
          { path: 'pos', element: foundationPage('Bán hàng') },
          { path: 'sales', element: foundationPage('Hóa đơn') },
          { path: 'more', element: foundationPage('Nhiều hơn') },
          {
            element: <RequireSession permission="staff.manage" />,
            children: [{ path: 'staff', element: <StaffPage /> }],
          },
          { path: '*', element: foundationPage('Không tìm thấy trang') },
        ],
      },
    ],
  },
];
