import { createBrowserRouter, RouterProvider } from 'react-router';
import { appRoutes } from './app-routes';
import { AppProviders } from './AppProviders';

const router = createBrowserRouter(appRoutes);

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
