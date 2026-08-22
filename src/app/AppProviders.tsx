import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { AuthProvider } from '../features/auth/AuthProvider';
import type { SessionApi } from '../features/auth/session-context';
import { createQueryClient } from '../lib/query/create-query-client';

type AppProvidersProps = {
  children: ReactNode;
  sessionApi?: SessionApi;
};

export function AppProviders({ children, sessionApi }: AppProvidersProps) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider api={sessionApi}>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
