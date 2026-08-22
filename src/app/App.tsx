import { createBrowserRouter, RouterProvider } from 'react-router';
import type { SessionApi } from '../features/auth/session-context';
import { appRoutes } from './app-routes';
import { AppProviders } from './AppProviders';

const router = createBrowserRouter(appRoutes);

export function App({ sessionApi }: { sessionApi?: SessionApi }) {
  return (
    <AppProviders sessionApi={sessionApi}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
