import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { SessionContextValue } from '@/features/auth';
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

    for (const destination of [
      'Nhà cung cấp',
      'Khách hàng',
      'Kênh bán',
      'Nhập dữ liệu',
      'Dữ liệu cũ',
    ]) {
      const link = screen.getByRole('link', { name: new RegExp(destination) });
      expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
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

  it('separates operational purchase access from owner-only cost destinations', () => {
    renderPage(['purchase.operational.read']);
    expect(screen.getByRole('link', { name: /Nhập hàng/ })).toHaveAttribute(
      'href',
      '/more/purchases',
    );
    expect(
      screen.queryByRole('link', { name: /Mở sổ tồn đầu kỳ/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Định giá tồn kho/ }),
    ).not.toBeInTheDocument();
  });

  it('shows opening stock, valuation and Excel import to the owner', () => {
    renderPage(['inventory.adjustment.post', 'report.cost_profit.read']);
    expect(
      screen.getByRole('link', { name: /Mở sổ tồn đầu kỳ/ }),
    ).toHaveAttribute('href', '/more/inventory/opening');
    expect(
      screen.getByRole('link', { name: /Định giá tồn kho/ }),
    ).toHaveAttribute('href', '/more/inventory/valuation');
    expect(screen.getByRole('link', { name: /Nhập dữ liệu/ })).toHaveAttribute(
      'href',
      '/imports',
    );
  });
});

it('offers the low-stock view to an inventory reader', () => {
  renderPage(['catalog.read', 'inventory.read']);
  expect(screen.getByRole('link', { name: /Cần nhập/ })).toHaveAttribute(
    'href',
    '/more/replenishment',
  );
  expect(
    screen.queryByRole('link', { name: /Nhập hàng/ }),
  ).not.toBeInTheDocument();
});
