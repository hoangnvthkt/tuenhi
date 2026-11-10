import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import {
  SessionContextValue,
  type SessionValue,
} from '../../src/features/auth';
import {
  ExpiryPage,
  InventoryFeaturesCard,
  ProductTrackingCard,
  PurchaseLotsSection,
} from '../../src/features/lots';
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
      'settings.manage',
      'catalog.basic.manage',
      'inventory.read',
      'inventory.adjustment.post',
      'inventory.writeoff.post',
      'purchase.draft.manage',
    ],
  },
  refresh: async () => {},
  signIn: async () => {},
  changePassword: async () => {},
  signOut: async () => {},
};
const start =
  new URLSearchParams(window.location.search).get('path') ?? '/more/expiry';
createRoot(document.getElementById('root')!).render(
  <SessionContextValue value={session}>
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ToastProvider>
        <MemoryRouter initialEntries={[start]}>
          <main className="mx-auto max-w-7xl space-y-5 p-4">
            <Routes>
              <Route path="/more/expiry" element={<ExpiryPage />} />
              <Route
                path="/product"
                element={
                  <ProductTrackingCard
                    productId="30000001-0000-4000-8000-000000000001"
                    unitName="Hộp"
                  />
                }
              />
              <Route
                path="/purchase"
                element={
                  <PurchaseLotsSection
                    receiptId="40000000-0000-4000-8000-000000000001"
                    version={1}
                    editable
                  />
                }
              />
              <Route path="/settings" element={<InventoryFeaturesCard />} />
            </Routes>
          </main>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  </SessionContextValue>,
);
