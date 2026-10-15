import { SessionContextValue, type SessionValue } from '@/features/auth';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '@/shared/testing/render-with-query-client';
import { CustomerPicker } from './CustomerPicker';
import { useState } from 'react';
const mocks = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  customerDetail: vi.fn(),
  saveCustomer: vi.fn(),
}));
vi.mock('@/features/directories', async (original) => ({
  ...(await original<typeof import('@/features/directories')>()),
  createDirectoryApi: () => mocks,
}));
vi.mock('@/features/connected-explorer', () => ({
  createCustomerExplorerApi: () => mocks,
}));
const customer = (id: string, name: string) => ({
  id,
  name,
  phone: null,
  email: null,
  code: null,
  address: null,
  isActive: true,
  version: 1,
});
beforeEach(() => vi.clearAllMocks());

function CompactPicker({
  initialValue = null,
}: {
  initialValue?: string | null;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <CustomerPicker
      compact
      value={value}
      disabled={false}
      onChange={setValue}
    />
  );
}

it('loads a remote selected customer name in the collapsed summary', async () => {
  mocks.customerDetail.mockResolvedValue(
    customer('remote', 'Khách ngoài trang đầu'),
  );
  renderWithQueryClient(<CompactPicker initialValue="remote" />);

  expect(
    await screen.findByRole('button', { name: 'Khách ngoài trang đầu' }),
  ).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});

it('keeps a searched customer name visible after compact selection collapses', async () => {
  mocks.listCustomers.mockImplementation(async ({ search }) => ({
    items: search ? [customer('101', 'Khách 101')] : [],
    nextCursor: null,
  }));
  renderWithQueryClient(<CompactPicker />);

  fireEvent.click(screen.getByRole('button', { name: 'Khách lẻ' }));
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'Khách 101' },
  });
  fireEvent.click(await screen.findByRole('option', { name: 'Khách 101' }));

  expect(screen.getByRole('button', { name: 'Khách 101' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});

it('keeps a quick-created customer name visible in the collapsed summary', async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  const auth: SessionValue = {
    status: 'authenticated',
    errorMessage: null,
    refresh: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    changePassword: vi.fn(),
    session: {
      userId: 'owner',
      permissions: ['customer.manage'],
      email: 'owner@example.test',
      displayName: 'Owner',
      roleTemplate: 'OWNER',
      isActive: true,
      mustChangePassword: false,
    },
  };
  mocks.listCustomers.mockResolvedValue({ items: [], nextCursor: null });
  mocks.saveCustomer.mockResolvedValue({ customerId: 'new-id', version: 1 });
  renderWithQueryClient(
    <SessionContextValue.Provider value={auth}>
      <CompactPicker />
    </SessionContextValue.Provider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Khách lẻ' }));
  fireEvent.click(screen.getByRole('button', { name: 'Thêm khách' }));
  fireEvent.change(screen.getByLabelText('Tên khách hàng'), {
    target: { value: 'Mai' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu và chọn' }));

  expect(await screen.findByRole('button', { name: 'Mai' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});

it('searches server data beyond the first page and retains the independently loaded selection', async () => {
  mocks.customerDetail.mockResolvedValue(customer('old', 'Khách đã chọn'));
  mocks.listCustomers.mockImplementation(async ({ search, cursor }) => ({
    items: search
      ? [customer('101', 'Khách 101')]
      : cursor
        ? [customer('31', 'Khách 31')]
        : [customer('1', 'Khách 1')],
    nextCursor: !search && !cursor ? { name: 'Khách 1', id: '1' } : null,
  }));
  const onChange = vi.fn();
  renderWithQueryClient(
    <CustomerPicker value="old" disabled={false} onChange={onChange} />,
  );
  expect(await screen.findByText('Khách đã chọn')).toBeVisible();
  fireEvent.focus(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByText('Tải thêm'));
  expect(await screen.findByText('Khách 31')).toBeVisible();
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'Khách 101' },
  });
  fireEvent.click(await screen.findByRole('option', { name: 'Khách 101' }));
  expect(onChange).toHaveBeenCalledWith('101');
});
it('shows retry after search failure instead of an empty directory', async () => {
  mocks.listCustomers
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue({
      items: [customer('101', 'Khách 101')],
      nextCursor: null,
    });
  renderWithQueryClient(
    <CustomerPicker value={null} disabled={false} onChange={vi.fn()} />,
  );
  fireEvent.focus(screen.getByRole('combobox'));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByText('Thử lại'));
  expect(await screen.findByText('Khách 101')).toBeVisible();
});
it('does not select stale search results while the new search is pending', async () => {
  mocks.listCustomers.mockResolvedValue({
    items: [customer('1', 'An')],
    nextCursor: null,
  });
  const onChange = vi.fn();
  renderWithQueryClient(
    <CustomerPicker value={null} disabled={false} onChange={onChange} />,
  );
  fireEvent.focus(screen.getByRole('combobox'));
  await screen.findByText('An');
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Bình' } });
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
  expect(onChange).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(mocks.listCustomers).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'Bình' }),
    ),
  );
});

it('ignores the old request when it resolves after a newer search', async () => {
  let finishOld!: (page: unknown) => void;
  mocks.listCustomers.mockImplementation(({ search }) =>
    search === 'An'
      ? new Promise((resolve) => {
          finishOld = resolve;
        })
      : Promise.resolve({
          items: search === 'Bình' ? [customer('2', 'Bình')] : [],
          nextCursor: null,
        }),
  );
  const onChange = vi.fn();
  renderWithQueryClient(
    <CustomerPicker value={null} disabled={false} onChange={onChange} />,
  );
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'An' } });
  await waitFor(() => expect(finishOld).toBeDefined());
  fireEvent.change(input, { target: { value: 'Bình' } });
  await screen.findByRole('option', { name: 'Bình' });
  await act(async () =>
    finishOld({ items: [customer('1', 'An')], nextCursor: null }),
  );
  expect(screen.queryByRole('option', { name: 'An' })).not.toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith('2');
});

it('only managers can add a customer, and selecting the new customer keeps the picker mounted', async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  const auth: SessionValue = {
    status: 'authenticated',
    errorMessage: null,
    refresh: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    changePassword: vi.fn(),
    session: {
      userId: 'owner',
      permissions: ['customer.manage'],
      email: 'owner@example.test',
      displayName: 'Owner',
      roleTemplate: 'OWNER',
      isActive: true,
      mustChangePassword: false,
    },
  };
  mocks.listCustomers.mockResolvedValue({ items: [], nextCursor: null });
  mocks.saveCustomer.mockResolvedValue({ customerId: 'new-id', version: 1 });
  const onChange = vi.fn();
  const view = renderWithQueryClient(
    <SessionContextValue.Provider value={auth}>
      <CustomerPicker value={null} disabled={false} onChange={onChange} />
    </SessionContextValue.Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Thêm khách' }));
  fireEvent.change(screen.getByLabelText('Tên khách hàng'), {
    target: { value: 'Mai' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu và chọn' }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith('new-id'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  view.rerender(
    <SessionContextValue.Provider
      value={{
        ...auth,
        session: { ...auth.session!, userId: 'viewer', permissions: [] },
      }}
    >
      <CustomerPicker value={null} disabled={false} onChange={onChange} />
    </SessionContextValue.Provider>,
  );
  expect(
    screen.queryByRole('button', { name: 'Thêm khách' }),
  ).not.toBeInTheDocument();
});
