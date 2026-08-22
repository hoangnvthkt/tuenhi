import { createBrowserRouter, RouterProvider } from 'react-router';
import type { SessionApi } from '../features/auth/session-context';
import type { NotificationApi } from '../features/notifications/notification-api';
import { appRoutes } from './app-routes';
import { AppProviders } from './AppProviders';

const router = createBrowserRouter(appRoutes);

export function App({
  sessionApi,
  notificationApi,
}: {
  sessionApi?: SessionApi;
  notificationApi?: NotificationApi;
}) {
  return (
    <AppProviders sessionApi={sessionApi} notificationApi={notificationApi}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
