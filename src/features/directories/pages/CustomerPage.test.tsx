import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import { SessionContextValue } from '@/features/auth';
import type { CustomerItem, DirectoryApi } from '../api/directory-api';
import { CustomerPage } from './CustomerPage';

const customer: CustomerItem = {
  id: '10000000-0000-4000-8000-000000000002',
  code: 'KH-01',
  customerType: 'INDIVIDUAL',
  name: 'Khách hàng A',
  phone: '+84912345678',
  email: null,
  address: null,
  companyName: null,
  taxCode: null,
  customerGroup: null,
  notes: null,
  isActive: true,
  version: 2,
};

function createApi(overrides: Partial<DirectoryApi> = {}): DirectoryApi {
  return {
    listSuppliers: vi.fn(),
    listCustomers: vi
      .fn()
      .mockResolvedValue({ items: [customer], nextCursor: null }),
    saveSupplier: vi.fn(),
    saveCustomer: vi
      .fn()
      .mockResolvedValue({ customerId: customer.id, version: 1 }),
    ...overrides,
  };
}

function renderPage(api: DirectoryApi) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SessionContextValue.Provider
        value={{
          status: 'authenticated',
          session: {
            userId: customer.id,
            email: 'owner@example.invalid',
            displayName: 'Chủ cửa hàng',
            roleTemplate: 'OWNER',
            isActive: true,
            mustChangePassword: false,
            permissions: ['customer.read', 'customer.manage'],
          },
          errorMessage: null,
          refresh: vi.fn(),
          signIn: vi.fn(),
          changePassword: vi.fn(),
          signOut: vi.fn(),
        }}
      >
        <ToastProvider>
          <MemoryRouter>
            <CustomerPage api={api} isOnline />
          </MemoryRouter>
        </ToastProvider>
      </SessionContextValue.Provider>
    </QueryClientProvider>,
  );
}

describe('CustomerPage', () => {
  it('never renders unsupported sensitive or financial fields', async () => {
    renderPage(createApi());
    expect(await screen.findByText('Khách hàng A')).toBeInTheDocument();
    for (const label of [
      'CCCD',
      'Ngày sinh',
      'Giới tính',
      'Facebook',
      'Điểm',
      'Công nợ',
    ]) {
      expect(
        screen.queryByText(new RegExp(label, 'i')),
      ).not.toBeInTheDocument();
    }
  });

  it('requires business company and saves only approved fields with E.164 phone', async () => {
    const user = userEvent.setup();
    const saveCustomer = vi
      .fn()
      .mockResolvedValue({ customerId: customer.id, version: 1 });
    renderPage(createApi({ saveCustomer }));
    await user.click(
      await screen.findByRole('button', { name: 'Thêm khách hàng' }),
    );
    await user.selectOptions(
      screen.getByLabelText('Loại khách hàng'),
      'BUSINESS',
    );
    await user.type(
      screen.getByLabelText('Tên khách hàng'),
      'Khách doanh nghiệp',
    );
    await user.type(screen.getByLabelText('Số điện thoại'), '0912345678');
    await user.click(screen.getByRole('button', { name: 'Lưu khách hàng' }));
    expect(
      await screen.findByText(
        'Tên công ty không được để trống với khách doanh nghiệp.',
      ),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Tên công ty'), 'Công ty A');
    await user.click(screen.getByRole('button', { name: 'Lưu khách hàng' }));
    await waitFor(() => expect(saveCustomer).toHaveBeenCalledOnce());
    const payload = saveCustomer.mock.calls[0]?.[0];
    expect(payload.values).toEqual(
      expect.objectContaining({
        phone: '+84912345678',
        companyName: 'Công ty A',
      }),
    );
    expect(Object.keys(payload.values).sort()).toEqual([
      'address',
      'code',
      'companyName',
      'customerGroup',
      'customerType',
      'email',
      'isActive',
      'name',
      'notes',
      'phone',
      'taxCode',
    ]);
  });

  it('edits with the loaded version', async () => {
    const user = userEvent.setup();
    const saveCustomer = vi
      .fn()
      .mockResolvedValue({ customerId: customer.id, version: 3 });
    renderPage(createApi({ saveCustomer }));
    await user.click(
      await screen.findByRole('button', { name: 'Sửa Khách hàng A' }),
    );
    await user.click(screen.getByRole('button', { name: 'Lưu khách hàng' }));
    await waitFor(() =>
      expect(saveCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: customer.id,
          expectedVersion: 2,
        }),
      ),
    );
  });
});
