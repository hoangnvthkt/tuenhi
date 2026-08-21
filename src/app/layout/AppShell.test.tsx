import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { appRoutes } from '../app-routes';

describe('AppShell', () => {
  it('renders the five required navigation destinations', () => {
    const router = createMemoryRouter(appRoutes, {
      initialEntries: ['/'],
    });

    render(<RouterProvider router={router} />);

    expect(
      screen.getByRole('heading', { name: 'Tổng quan' }),
    ).toBeInTheDocument();

    const mobileNavigation = screen.getByRole('navigation', {
      name: 'Điều hướng di động',
    });

    for (const label of [
      'Tổng quan',
      'Hàng hóa',
      'Bán hàng',
      'Hóa đơn',
      'Nhiều hơn',
    ]) {
      expect(
        within(mobileNavigation).getByRole('link', { name: label }),
      ).toBeInTheDocument();
    }
  });

  it('renders the sales foundation page at /pos', () => {
    const router = createMemoryRouter(appRoutes, {
      initialEntries: ['/pos'],
    });

    render(<RouterProvider router={router} />);

    expect(
      screen.getByRole('heading', { name: 'Bán hàng' }),
    ).toBeInTheDocument();
  });
});
