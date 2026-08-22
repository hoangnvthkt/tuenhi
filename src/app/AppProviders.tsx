import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ToastProvider } from '../components/feedback/ToastProvider';
import { AuthProvider } from '../features/auth/AuthProvider';
import type { SessionApi } from '../features/auth/session-context';
import {
  createNotificationApi,
  type NotificationApi,
} from '../features/notifications/notification-api';
import { NotificationApiContext } from '../features/notifications/notification-context';
import { createQueryClient } from '../lib/query/create-query-client';

type AppProvidersProps = {
  children: ReactNode;
  sessionApi?: SessionApi;
  notificationApi?: NotificationApi;
};

export function AppProviders({
  children,
  sessionApi,
  notificationApi,
}: AppProvidersProps) {
  const [queryClient] = useState(createQueryClient);
  const [resolvedNotificationApi] = useState(
    () => notificationApi ?? createNotificationApi(),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider api={sessionApi}>
        <NotificationApiContext.Provider value={resolvedNotificationApi}>
          <ToastProvider>{children}</ToastProvider>
        </NotificationApiContext.Provider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
