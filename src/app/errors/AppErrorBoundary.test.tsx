import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

function BrokenView(): ReactNode {
  throw new Error('SQL select * from app_private.command_deduplication');
}

describe('AppErrorBoundary', () => {
  it('shows a safe recovery screen without rendering the raw error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AppErrorBoundary>
        <BrokenView />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ứng dụng gặp sự cố khi hiển thị trang',
    );
    expect(
      screen.getByRole('button', { name: 'Tải lại ứng dụng' }),
    ).toBeVisible();
    expect(
      screen.queryByText(/app_private|select \*/i),
    ).not.toBeInTheDocument();
  });
});
