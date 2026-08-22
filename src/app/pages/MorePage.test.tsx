import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { SessionContextValue } from '../../features/auth/session-store';
import { MorePage } from './MorePage';

function renderPage(permissions: string[]) {
  render(
    <SessionContextValue.Provider
      value={{
        status: 'authenticated',
        session: {
          userId: '10000000-0000-4000-8000-000000000001',
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
      <MemoryRouter>
        <MorePage />
      </MemoryRouter>
    </SessionContextValue.Provider>,
  );
}

describe('MorePage', () => {
  it('renders only destinations allowed by read or manage permissions', () => {
    renderPage([
      'supplier.read',
      'customer.manage',
      'settings.manage',
      'legacy.sale.read',
    ]);
    expect(screen.getByRole('link', { name: /Nhà cung cấp/ })).toHaveAttribute(
      'href',
      '/more/suppliers',
    );
    expect(screen.getByRole('link', { name: /Khách hàng/ })).toHaveAttribute(
      'href',
      '/more/customers',
    );
    expect(screen.getByRole('link', { name: /Kênh bán/ })).toHaveAttribute(
      'href',
      '/more/sales-channels',
    );
    expect(screen.getByRole('link', { name: /Nhập dữ liệu/ })).toHaveAttribute(
      'href',
      '/imports',
    );
    expect(screen.getByRole('link', { name: /Dữ liệu cũ/ })).toHaveAttribute(
      'href',
      '/legacy-sales',
    );
  });

  it('does not leak inaccessible destinations', () => {
    renderPage([]);
    expect(
      screen.queryByRole('link', { name: /Nhà cung cấp/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Khách hàng/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Kênh bán/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Nhập dữ liệu/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Dữ liệu cũ/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Bạn chưa có quyền sử dụng chức năng bổ sung nào.'),
    ).toBeInTheDocument();
  });

  it('shows the import entry for an owner with only legacy import permission', () => {
    renderPage(['legacy.sale.import']);
    expect(screen.getByRole('link', { name: /Nhập dữ liệu/ })).toHaveAttribute(
      'href',
      '/imports',
    );
    expect(
      screen.queryByRole('link', { name: /Dữ liệu cũ/ }),
    ).not.toBeInTheDocument();
  });
});
