import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '@/shared/testing/render-with-query-client';
import { QuickCustomerDialog } from './QuickCustomerDialog';
import { DirectoryApiError } from '@/features/directories';
const mocks = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  saveCustomer: vi.fn(),
}));
vi.mock('@/features/directories', async (original) => ({
  ...(await original<typeof import('@/features/directories')>()),
  createDirectoryApi: () => mocks,
}));
const customer = {
  id: '10000000-0000-4000-8000-000000000003',
  name: 'Khách cũ',
  phone: '+84912345678',
  email: null,
  code: null,
  address: null,
  notes: null,
  isActive: true,
  version: 1,
  customerType: 'INDIVIDUAL',
  companyName: null,
  taxCode: null,
  customerGroup: null,
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.clearAllMocks();
  mocks.listCustomers.mockResolvedValue({ items: [], nextCursor: null });
  mocks.saveCustomer.mockResolvedValue({ customerId: customer.id, version: 1 });
});
function setup() {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  const view = renderWithQueryClient(
    <QuickCustomerDialog open onCreated={onCreated} onClose={onClose} />,
  );
  return { ...view, onCreated, onClose };
}
function fill() {
  fireEvent.change(screen.getByLabelText('Tên khách hàng'), {
    target: { value: '  Mai  ' },
  });
  fireEvent.change(screen.getByLabelText('Số điện thoại (tùy chọn)'), {
    target: { value: '0912345678' },
  });
}
it('normalizes two fields, creates once and returns the selected snapshot', async () => {
  const { onCreated } = setup();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Lưu và chọn' }));
  await waitFor(() =>
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: customer.id,
        name: 'Mai',
        phone: '+84912345678',
      }),
    ),
  );
  expect(mocks.saveCustomer).toHaveBeenCalledWith(
    expect.objectContaining({
      values: expect.objectContaining({
        name: 'Mai',
        phone: '+84912345678',
        customerType: 'INDIVIDUAL',
      }),
    }),
  );
});
it('offers the exact existing phone match without creating or merging', async () => {
  mocks.listCustomers.mockResolvedValue({
    items: [customer],
    nextCursor: null,
  });
  const { onCreated } = setup();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Lưu và chọn' }));
  fireEvent.click(await screen.findByRole('button', { name: /Chọn Khách cũ/ }));
  expect(onCreated).toHaveBeenCalledWith(customer);
  expect(mocks.saveCustomer).not.toHaveBeenCalled();
});
it('retries an unknown outcome with the same key and unchanged payload', async () => {
  mocks.saveCustomer
    .mockRejectedValueOnce(new Error('response lost'))
    .mockResolvedValueOnce({ customerId: customer.id, version: 1 });
  const { onCreated } = setup();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Lưu và chọn' }));
  await screen.findByText(/Chưa xác định kết quả/);
  expect(screen.getByLabelText('Tên khách hàng')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Đóng' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại cùng yêu cầu' }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
  expect(mocks.saveCustomer.mock.calls[1]![0]).toEqual(
    mocks.saveCustomer.mock.calls[0]![0],
  );
});
it('keeps editable form after a definitive rejection', async () => {
  mocks.saveCustomer.mockRejectedValueOnce(
    new DirectoryApiError('VALIDATION_ERROR', 'id', {}),
  );
  setup();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Lưu và chọn' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Tên khách hàng')).toHaveValue('  Mai  ');
  expect(screen.getByLabelText('Tên khách hàng')).toBeEnabled();
});
it('locks duplicate clicks, and ignores completion after unmount/account change', async () => {
  let resolve!: (value: unknown) => void;
  mocks.saveCustomer.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const { unmount, onCreated } = setup();
  fill();
  const submit = screen.getByRole('button', { name: 'Lưu và chọn' });
  fireEvent.click(submit);
  fireEvent.click(submit);
  await waitFor(() => expect(mocks.saveCustomer).toHaveBeenCalledOnce());
  unmount();
  await act(async () => resolve({ customerId: customer.id, version: 1 }));
  expect(onCreated).not.toHaveBeenCalled();
});

it('blocks browser-back style route navigation while creation outcome is unknown', async () => {
  const { createMemoryRouter, RouterProvider } = await import('react-router');
  mocks.saveCustomer.mockRejectedValueOnce(new Error('response lost'));
  const router = createMemoryRouter(
    [
      {
        path: '/pos',
        element: (
          <QuickCustomerDialog open onCreated={vi.fn()} onClose={vi.fn()} />
        ),
      },
      { path: '/other', element: <p>Other route</p> },
    ],
    { initialEntries: ['/other', '/pos'], initialIndex: 1 },
  );
  renderWithQueryClient(<RouterProvider router={router} />);
  fireEvent.change(screen.getByLabelText('Tên khách hàng'), {
    target: { value: 'Mai' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu và chọn' }));
  await screen.findByText(/Chưa xác định kết quả/);
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.queryByText('Other route')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Thử lại cùng yêu cầu' }),
  ).toBeVisible();
});
