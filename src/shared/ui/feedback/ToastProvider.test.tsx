import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from './ToastProvider';
import { useToast } from './use-toast';

function ToastHarness() {
  const toast = useToast();
  return (
    <div>
      <button
        onClick={() => toast.show({ kind: 'success', title: 'Đã lưu dữ liệu' })}
      >
        Thành công
      </button>
      <button
        onClick={() => toast.show({ kind: 'info', title: 'Đang đồng bộ' })}
      >
        Thông tin
      </button>
      <button
        onClick={() =>
          toast.show({
            kind: 'error',
            title: 'Không thể lưu',
            correlationId: '00000000-0000-4000-8000-000000000099',
            actionRoute: '/imports/00000000-0000-4000-8000-000000000099',
          })
        }
      >
        Lỗi
      </button>
      <button
        onClick={() =>
          toast.show({
            kind: 'info',
            title: 'Lần đầu',
            dedupeKey: 'sync',
          })
        }
      >
        Trùng 1
      </button>
      <button
        onClick={() =>
          toast.show({
            kind: 'info',
            title: 'Đã cập nhật',
            dedupeKey: 'sync',
          })
        }
      >
        Trùng 2
      </button>
    </div>
  );
}

function renderToasts() {
  render(
    <ToastProvider>
      <ToastHarness />
    </ToastProvider>,
  );
}

afterEach(() => vi.useRealTimers());

describe('ToastProvider', () => {
  it('uses polite status for success and assertive alert for errors', async () => {
    const user = userEvent.setup();
    renderToasts();

    await user.click(screen.getByRole('button', { name: 'Thành công' }));
    await user.click(screen.getByRole('button', { name: 'Lỗi' }));

    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu dữ liệu');
    expect(screen.getByRole('alert')).toHaveTextContent('Không thể lưu');
    expect(screen.getByText('Mã tra cứu')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem chi tiết' })).toHaveAttribute(
      'href',
      '/imports/00000000-0000-4000-8000-000000000099',
    );
  });

  it('updates a duplicate event instead of stacking it', async () => {
    const user = userEvent.setup();
    renderToasts();

    await user.click(screen.getByRole('button', { name: 'Trùng 1' }));
    await user.click(screen.getByRole('button', { name: 'Trùng 2' }));

    expect(screen.queryByText('Lần đầu')).not.toBeInTheDocument();
    expect(screen.getByText('Đã cập nhật')).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('auto-dismisses success at five seconds and info at eight seconds', () => {
    vi.useFakeTimers();
    renderToasts();

    act(() => screen.getByRole('button', { name: 'Thành công' }).click());
    act(() => screen.getByRole('button', { name: 'Thông tin' }).click());
    act(() => vi.advanceTimersByTime(5_000));

    expect(screen.queryByText('Đã lưu dữ liệu')).not.toBeInTheDocument();
    expect(screen.getByText('Đang đồng bộ')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.queryByText('Đang đồng bộ')).not.toBeInTheDocument();
  });

  it('keeps errors until dismissed and caps visible toasts at three', () => {
    vi.useFakeTimers();
    renderToasts();

    act(() => screen.getByRole('button', { name: 'Lỗi' }).click());
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText('Không thể lưu')).toBeInTheDocument();

    for (const name of ['Thành công', 'Thông tin', 'Trùng 1']) {
      act(() => screen.getByRole('button', { name }).click());
    }
    expect([
      ...screen.getAllByRole('status'),
      ...screen.getAllByRole('alert'),
    ]).toHaveLength(3);

    act(() =>
      screen
        .getByRole('button', { name: 'Đóng thông báo Không thể lưu' })
        .click(),
    );
    expect(screen.queryByText('Không thể lưu')).not.toBeInTheDocument();
  });
});
