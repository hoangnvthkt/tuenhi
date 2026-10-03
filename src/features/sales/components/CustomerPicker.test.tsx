import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '@/shared/testing/render-with-query-client';
import { CustomerPicker } from './CustomerPicker';
const mocks = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  customerDetail: vi.fn(),
}));
vi.mock('@/features/directories', () => ({ createDirectoryApi: () => mocks }));
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
