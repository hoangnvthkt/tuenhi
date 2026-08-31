import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import { SessionContextValue } from '@/features/auth';
import type { DirectoryApi, SupplierItem } from '../api/directory-api';
import { SupplierPage } from './SupplierPage';

const supplier: SupplierItem = {
  id: '10000000-0000-4000-8000-000000000001',
  code: 'NCC-01',
  name: 'Nhà cung cấp A',
  phone: '+84912345678',
  email: null,
  address: null,
  notes: null,
  isActive: true,
  version: 3,
};

function createApi(overrides: Partial<DirectoryApi> = {}): DirectoryApi {
  return {
    listSuppliers: vi
      .fn()
      .mockResolvedValue({ items: [supplier], nextCursor: null }),
    listCustomers: vi.fn(),
    saveSupplier: vi
      .fn()
      .mockResolvedValue({ supplierId: supplier.id, version: 1 }),
    saveCustomer: vi.fn(),
    ...overrides,
  };
}

function renderPage(
  api: DirectoryApi,
  permissions = ['supplier.read', 'supplier.manage'],
) {
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
            userId: supplier.id,
            email: 'owner@example.invalid',
            displayName: 'Chủ cửa hàng',
            roleTemplate: 'OWNER',
            isActive: true,
            mustChangePassword: false,
            permissions,
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
            <SupplierPage api={api} isOnline />
          </MemoryRouter>
        </ToastProvider>
      </SessionContextValue.Provider>
    </QueryClientProvider>,
  );
}

describe('SupplierPage', () => {
  it('searches, displays a readable phone and hides write actions without manage permission', async () => {
    const user = userEvent.setup();
    const listSuppliers = vi
      .fn()
      .mockResolvedValue({ items: [supplier], nextCursor: null });
    renderPage(createApi({ listSuppliers }), ['supplier.read']);
    expect(await screen.findByText('Nhà cung cấp A')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Nhà cung cấp A' }),
    ).toHaveAttribute('href', `/more/suppliers/${supplier.id}`);
    expect(screen.getByText('+84 912 345 678')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Thêm nhà cung cấp' }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Tìm nhà cung cấp'), 'NCC-01');
    await user.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
    await waitFor(() =>
      expect(listSuppliers).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'NCC-01' }),
      ),
    );
  });

  it('creates with a normalized phone and edits with expected version', async () => {
    const user = userEvent.setup();
    const saveSupplier = vi
      .fn()
      .mockResolvedValue({ supplierId: supplier.id, version: 4 });
    renderPage(createApi({ saveSupplier }));
    await screen.findByText('Nhà cung cấp A');

    await user.click(screen.getByRole('button', { name: 'Thêm nhà cung cấp' }));
    await user.type(
      screen.getByLabelText('Tên nhà cung cấp'),
      'Nhà cung cấp mới',
    );
    await user.type(screen.getByLabelText('Số điện thoại'), '0912345678');
    await user.click(screen.getByRole('button', { name: 'Lưu nhà cung cấp' }));
    await waitFor(() =>
      expect(saveSupplier).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.objectContaining({ phone: '+84912345678' }),
          idempotencyKey: expect.any(String),
        }),
      ),
    );

    await user.click(
      screen.getByRole('button', { name: 'Sửa Nhà cung cấp A' }),
    );
    await user.click(screen.getByRole('button', { name: 'Lưu nhà cung cấp' }));
    await waitFor(() =>
      expect(saveSupplier).toHaveBeenLastCalledWith(
        expect.objectContaining({
          supplierId: supplier.id,
          expectedVersion: 3,
        }),
      ),
    );
  });
});
