import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import {
  SessionContextValue,
  type SessionValue,
} from '../../src/features/auth';
import {
  PurchaseReturnPage,
  SupplierDebtPage,
  SupplierPayPage,
  WriteOffPage,
} from '../../src/features/supplier-debt';
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
      'supplier.debt.read',
      'supplier.debt.pay',
      'supplier.debt.adjust',
      'purchase.return.post',
      'inventory.writeoff.post',
      'report.cost_profit.read',
      'catalog.read',
    ],
  },
  refresh: async () => {},
  signIn: async () => {},
  changePassword: async () => {},
  signOut: async () => {},
};
const start =
  new URLSearchParams(window.location.search).get('path') ??
  '/more/supplier-debts';
createRoot(document.getElementById('root')!).render(
  <SessionContextValue value={session}>
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ToastProvider>
        <MemoryRouter initialEntries={[start]}>
          <main className="mx-auto max-w-7xl p-4">
            <Routes>
              <Route
                path="/more/supplier-debts"
                element={<SupplierDebtPage />}
              />
              <Route
                path="/more/supplier-debts/:supplierId/pay"
                element={<SupplierPayPage />}
              />
              <Route
                path="/more/purchases/:receiptId/return"
                element={<PurchaseReturnPage />}
              />
              <Route path="/more/write-offs" element={<WriteOffPage />} />
            </Routes>
          </main>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  </SessionContextValue>,
);
