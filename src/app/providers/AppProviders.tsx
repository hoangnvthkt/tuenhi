import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import { AuthProvider, type SessionApi } from '@/features/auth';
import {
  createNotificationApi,
  type NotificationApi,
  NotificationApiContext,
} from '@/features/notifications';
import { createQueryClient } from '@/shared/lib/query/create-query-client';

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
