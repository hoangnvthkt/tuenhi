import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import { CustomerDebtPanel } from './CustomerDebtPanel';
import { FinancialOutcomeUnknownError } from '@/shared/api/financial-command';
const customerId = '40000000-0000-4000-8000-000000000001',
  userId = '10000000-0000-4000-8000-000000000001',
  key = '50000000-0000-4000-8000-000000000001';
const state = vi.hoisted(() => ({
  permissions: [] as string[],
  online: true,
  run: vi.fn(),
}));
vi.mock('@/features/auth', async (original) => ({
  ...(await original<typeof import('@/features/auth')>()),
  useSession: () => ({ session: { userId, permissions: state.permissions } }),
}));
vi.mock('@/shared/hooks/use-online-status', () => ({
  useOnlineStatus: () => state.online,
}));
vi.mock('@/shared/hooks/use-financial-command', () => ({
  useFinancialCommand: () => state.run,
}));
const api = {
  detail: vi.fn(),
  entries: vi.fn(),
  collect: vi.fn(),
  adjust: vi.fn(),
  parseMutationResponse: vi.fn(),
};
function renderPanel() {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ToastProvider>
          <CustomerDebtPanel customerId={customerId} api={api} />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  state.online = true;
  state.permissions = [
    'customer.debt.read',
    'customer.debt.collect',
    'customer.debt.adjust',
  ];
  api.detail.mockResolvedValue({ customerId, balance: '20000', version: 2 });
  api.entries.mockResolvedValue({ items: [], nextCursor: null });
  state.run.mockImplementation(async ({ invoke }) => invoke(key));
});
it('records a 20000 transfer and refreshes the balance to zero', async () => {
  const user = userEvent.setup();
  api.collect.mockImplementation(async () => {
    api.detail.mockResolvedValue({ customerId, balance: '0', version: 3 });
    return { customerId, balance: '0', version: 3, entryId: key };
  });
  renderPanel();
  await screen.findByText('20.000 ₫');
  await user.click(screen.getByRole('button', { name: 'Thu nợ' }));
  await user.type(screen.getByLabelText('Chuyển khoản thu nợ'), '20000');
  await user.click(screen.getByRole('button', { name: 'Ghi nhận thu nợ' }));
  expect(api.collect).toHaveBeenCalledExactlyOnceWith({
    customerId,
    expectedVersion: 2,
    cashAmount: '0',
    bankTransferAmount: '20000',
    note: '',
    idempotencyKey: key,
  });
  await waitFor(() =>
    expect(screen.getByTestId('customer-debt-balance')).toHaveTextContent(
      '0 ₫',
    ),
  );
});
it('requires a reason before adjusting the balance and keeps the operation distinct from collecting', async () => {
  const user = userEvent.setup();
  api.adjust.mockResolvedValue({
    customerId,
    balance: '50000',
    version: 3,
    entryId: key,
  });
  renderPanel();
  await screen.findByText('20.000 ₫');
  await user.click(screen.getByRole('button', { name: 'Chỉnh số dư nợ' }));
  const amount = screen.getByLabelText('Số nợ mới');
  await user.clear(amount);
  await user.type(amount, '50000');
  expect(screen.getByRole('button', { name: 'Lưu số dư nợ' })).toBeDisabled();
  await user.type(screen.getByLabelText('Lý do điều chỉnh'), 'Nhập nợ cũ');
  await user.click(screen.getByRole('button', { name: 'Lưu số dư nợ' }));
  expect(api.adjust).toHaveBeenCalledExactlyOnceWith({
    customerId,
    expectedVersion: 2,
    newBalance: '50000',
    reason: 'Nhập nợ cũ',
    idempotencyKey: key,
  });
  expect(api.collect).not.toHaveBeenCalled();
});
it('blocks invalid or excessive collections', async () => {
  const user = userEvent.setup();
  renderPanel();
  await screen.findByText('20.000 ₫');
  await user.click(screen.getByRole('button', { name: 'Thu nợ' }));
  await user.type(screen.getByLabelText('Tiền mặt thu nợ'), '20001');
  expect(
    screen.getByRole('button', { name: 'Ghi nhận thu nợ' }),
  ).toBeDisabled();
  await user.clear(screen.getByLabelText('Tiền mặt thu nợ'));
  await user.type(screen.getByLabelText('Tiền mặt thu nợ'), '1.001');
  expect(
    screen.getByRole('button', { name: 'Ghi nhận thu nợ' }),
  ).toBeDisabled();
  expect(api.collect).not.toHaveBeenCalled();
});
it('supports read-only access', async () => {
  state.permissions = ['customer.debt.read'];
  renderPanel();
  await screen.findByText('20.000 ₫');
  expect(
    screen.queryByRole('button', { name: 'Thu nợ' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Chỉnh số dư nợ' }),
  ).not.toBeInTheDocument();
});
it('blocks collection and adjustment when offline', async () => {
  state.online = false;
  renderPanel();
  await screen.findByText('20.000 ₫');
  expect(screen.getByRole('button', { name: 'Thu nợ' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Chỉnh số dư nợ' })).toBeDisabled();
  expect(state.run).not.toHaveBeenCalled();
});
it('resumes only the saved request after reload without inventing a new collection', async () => {
  const user = userEvent.setup();
  const marker = {
    version: 1,
    userId,
    commandName: 'customer.debt.collect',
    entityId: customerId,
    idempotencyKey: key,
    createdAt: '2026-10-06T10:00:00.000Z',
  };
  localStorage.setItem(
    `tuenhi:pending-financial-command:v1:${userId}:customer.debt.collect:${customerId}`,
    JSON.stringify(marker),
  );
  state.run.mockImplementation(async (options) => {
    expect(options.resumeOnly).toBe(true);
    expect(options.retryPending).toBe(false);
    // On reload no immutable original payload exists; this callback must never be used to write.
    return { customerId, balance: '0', version: 3, entryId: key };
  });
  renderPanel();
  await screen.findByText('20.000 ₫');
  expect(screen.getByRole('button', { name: 'Thu nợ' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Đối soát công nợ' }));
  expect(state.run).toHaveBeenCalledOnce();
  expect(api.collect).not.toHaveBeenCalled();
  expect(api.adjust).not.toHaveBeenCalled();
});
it('keeps financial controls locked until the collection finishes', async () => {
  const user = userEvent.setup();
  let finish!: () => void;
  api.collect.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  renderPanel();
  await screen.findByText('20.000 ₫');
  await user.click(screen.getByRole('button', { name: 'Thu nợ' }));
  await user.type(screen.getByLabelText('Tiền mặt thu nợ'), '20000');
  const submit = screen.getByRole('button', { name: 'Ghi nhận thu nợ' });
  await user.dblClick(submit);
  expect(api.collect).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Chỉnh số dư nợ' })).toBeDisabled();
  finish();
  await screen.findByText('Đã ghi nhận khách trả nợ');
});
it('loads the next history page with its exact cursor', async () => {
  const cursor = { occurredAt: '2026-10-06T10:00:00.000Z', id: key };
  api.entries
    .mockResolvedValueOnce({ items: [], nextCursor: cursor })
    .mockResolvedValue({ items: [], nextCursor: null });
  renderPanel();
  await userEvent
    .setup()
    .click(await screen.findByRole('button', { name: 'Xem thêm lịch sử' }));
  await waitFor(() =>
    expect(api.entries).toHaveBeenLastCalledWith(customerId, cursor),
  );
});
it('blocks new financial requests while the prior collection is unresolved', async () => {
  const user = userEvent.setup();
  state.run.mockRejectedValue(new FinancialOutcomeUnknownError(key));
  renderPanel();
  await screen.findByText('20.000 ₫');
  await user.click(screen.getByRole('button', { name: 'Thu nợ' }));
  await user.type(screen.getByLabelText('Tiền mặt thu nợ'), '20000');
  await user.click(screen.getByRole('button', { name: 'Ghi nhận thu nợ' }));
  expect(
    await screen.findByRole('button', { name: 'Đối soát công nợ' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Thu nợ' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Chỉnh số dư nợ' })).toBeDisabled();
});
