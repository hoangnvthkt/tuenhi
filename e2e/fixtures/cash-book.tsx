import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import {
  SessionContextValue,
  type SessionValue,
} from '../../src/features/auth';
import {
  CashBookPage,
  CashShiftPage,
  CashVoucherPage,
} from '../../src/features/cash-book';
import { ToastProvider } from '../../src/shared/ui/feedback/ToastProvider';
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
      'cash.book.read',
      'cash.voucher.create',
      'cash.shift.manage',
      'cash.opening.set',
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
      <ToastProvider>
        <MemoryRouter
          initialEntries={[
            '/cash-book?fund=CASH&period=month&from=2026-10-01&to=2026-10-31',
          ]}
        >
          <main className="mx-auto max-w-7xl p-4">
            <Routes>
              <Route path="/cash-book" element={<CashBookPage />} />
              <Route path="/cash-book/shift" element={<CashShiftPage />} />
              <Route
                path="/cash-book/vouchers/new"
                element={<CashVoucherPage />}
              />
            </Routes>
          </main>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  </SessionContextValue>,
);
