import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import {
  SessionContextValue,
  type SessionValue,
} from '../../src/features/auth';
import { DashboardPage } from '../../src/features/dashboard';
import { SettlementReportPage } from '../../src/features/reports/pages/SettlementReportPage';
import '../../src/styles/index.css';
const session: SessionValue = {
  status: 'authenticated',
  errorMessage: null,
  session: {
    userId: '10000000-0000-4000-8000-000000000001',
    email: 'local@example.invalid',
    displayName: 'Local owner',
    roleTemplate: 'OWNER',
    isActive: true,
    mustChangePassword: false,
    permissions: [
      'dashboard.operational.read',
      'report.all_revenue.read',
      'report.cost_profit.read',
    ],
  },
  refresh: async () => {},
  signIn: async () => {},
  changePassword: async () => {},
  signOut: async () => {},
};
createRoot(document.getElementById('root')!).render(
  <SessionContextValue value={session}>
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter
        initialEntries={['/?period=today&from=2026-10-16&to=2026-10-16']}
      >
        <main className="mx-auto max-w-7xl p-4">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route
              path="/reports/settlements"
              element={<SettlementReportPage />}
            />
          </Routes>
        </main>
      </MemoryRouter>
    </QueryClientProvider>
  </SessionContextValue>,
);
