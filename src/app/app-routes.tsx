import { Suspense } from 'react';
import type { RouteObject } from 'react-router';
import { RequireSession } from '@/features/auth';
import { AppShell } from './layout/AppShell';
import { FoundationSectionPage } from './pages/FoundationSectionPage';
import { MorePage } from './pages/MorePage';
import { administrationRoutes } from './routes/administration-routes';
import {
  changePasswordRoute,
  forgotPasswordRoute,
  loginRoute,
} from './routes/auth-routes';
import { catalogRoutes } from './routes/catalog-routes';
import { operationRoutes } from './routes/operation-routes';
import { reportRoutes } from './routes/report-routes';
import { RouteLoading } from './routes/RouteLoading';

function foundationPage(title: string) {
  return (
    <FoundationSectionPage
      title={title}
      description={`Phân hệ ${title} sẽ được kích hoạt trong giai đoạn đã được phê duyệt.`}
    />
  );
}

export const appRoutes: RouteObject[] = [
  loginRoute,
  forgotPasswordRoute,
  {
    element: <RequireSession />,
    children: [
      changePasswordRoute,
      {
        element: (
          <Suspense fallback={<RouteLoading />}>
            <AppShell />
          </Suspense>
        ),
        children: [
          ...reportRoutes,
          ...catalogRoutes,
          ...operationRoutes,
          { path: 'more', element: <MorePage /> },
          ...administrationRoutes,
          { path: '*', element: foundationPage('Không tìm thấy trang') },
        ],
      },
    ],
  },
];
