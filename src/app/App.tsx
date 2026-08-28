import { createBrowserRouter, RouterProvider } from 'react-router';
import type { SessionApi } from '@/features/auth';
import type { NotificationApi } from '@/features/notifications';
import { appRoutes } from './app-routes';
import { AppProviders } from './providers/AppProviders';
import { AppErrorBoundary } from './errors/AppErrorBoundary';

const router = createBrowserRouter(appRoutes);

export function App({
  sessionApi,
  notificationApi,
}: {
  sessionApi?: SessionApi;
  notificationApi?: NotificationApi;
}) {
  return (
    <AppErrorBoundary>
      <AppProviders sessionApi={sessionApi} notificationApi={notificationApi}>
        <RouterProvider router={router} />
      </AppProviders>
    </AppErrorBoundary>
  );
}
