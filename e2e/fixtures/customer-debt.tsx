import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import {
  SessionContextValue,
  type SessionValue,
} from '../../src/features/auth';
import { CustomerDebtPanel } from '../../src/features/customer-debt';
import type { CustomerDebtApi } from '../../src/features/customer-debt/api/customer-debt-api';
import { CheckoutDialog } from '../../src/features/sales/components/CheckoutDialog';
import type { PosPaymentMethod } from '../../src/features/sales/model/pos-types';
import { ToastProvider } from '../../src/shared/ui/feedback/ToastProvider';
import { calculatePaymentAllocation } from '../../src/shared/lib/numeric/payment-allocation';
import '../../src/styles/index.css';

// Every business operation is in-memory. The test aborts all nonlocal HTTP traffic.
const customerId = '40000000-0000-4000-8000-000000000001';
let balance = '0',
  version = 1;
const api: CustomerDebtApi = {
  detail: async () => ({ customerId, balance, version }),
  entries: async () => ({ items: [], nextCursor: null }),
  collect: async ({ cashAmount, bankTransferAmount, idempotencyKey }) => {
    const allocation = calculatePaymentAllocation(
      balance,
      cashAmount,
      bankTransferAmount,
    );
    if (!allocation.ok) throw new Error(allocation.message);
    balance = allocation.debt;
    version++;
    return { customerId, balance, version, entryId: idempotencyKey };
  },
  adjust: async ({ newBalance, idempotencyKey }) => {
    balance = newBalance;
    version++;
    return { customerId, balance, version, entryId: idempotencyKey };
  },
  parseMutationResponse: () => {
    throw new Error('Fixture never needs outcome lookup');
  },
};
const session: SessionValue = {
  status: 'authenticated',
  errorMessage: null,
  session: {
    userId: '10000000-0000-4000-8000-000000000001',
    email: 'local@example.invalid',
    displayName: 'Local Owner',
    roleTemplate: 'OWNER',
    isActive: true,
    mustChangePassword: false,
    permissions: [
      'customer.debt.read',
      'customer.debt.collect',
      'customer.debt.adjust',
    ],
  },
  refresh: async () => {},
  signIn: async () => {},
  changePassword: async () => {},
  signOut: async () => {},
};
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
export function Demo() {
  const [payment, setPayment] = useState<PosPaymentMethod | null>('SPLIT');
  return (
    <MemoryRouter>
      <SessionContextValue value={session}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <main className="mx-auto max-w-xl space-y-4 p-4">
              <h1 className="text-2xl font-semibold">Khách hàng KH01</h1>
              <CustomerDebtPanel customerId={customerId} api={api} />
              {payment ? (
                <CheckoutDialog
                  payment={payment}
                  total="100000"
                  customerId={customerId}
                  saving={false}
                  onPaymentChange={setPayment}
                  onCancel={() => setPayment(null)}
                  onConfirm={(_, allocation) => {
                    if (!allocation) throw new Error('Allocation required');
                    const result = calculatePaymentAllocation(
                      '100000',
                      allocation.cashAmount,
                      allocation.bankTransferAmount,
                    );
                    if (!result.ok) throw new Error(result.message);
                    balance = result.debt;
                    version++;
                    void queryClient.invalidateQueries();
                    setPayment(null);
                  }}
                />
              ) : null}
            </main>
          </ToastProvider>
        </QueryClientProvider>
      </SessionContextValue>
    </MemoryRouter>
  );
}
createRoot(document.getElementById('root')!).render(<Demo />);
