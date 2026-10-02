import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DraftPrintDialog } from './DraftPrintDialog';
import { draftPrintFixture } from '../testing/draft-print-fixture';

const pdf = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock('../model/sales-pdf', () => ({ downloadDraftPdf: pdf.download }));

describe('DraftPrintDialog', () => {
  it('prints the unpaid saved document without opening a popup', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const popup = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<DraftPrintDialog document={draftPrintFixture} onClose={vi.fn()} />);
    expect(screen.getByText('PHIẾU TẠM TÍNH — CHƯA THANH TOÁN')).toBeVisible();
    expect(screen.getByText('Sữa hộp dưỡng chất')).toBeVisible();
    expect(screen.getAllByText(/97\.000/)).toHaveLength(2);
    expect(print).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'In nhiệt' }));
    expect(print).toHaveBeenCalledOnce();
    expect(popup).not.toHaveBeenCalled();
  });

  it('keeps a rejected PDF download visible and enables retry', async () => {
    let rejectDownload!: (reason: Error) => void;
    pdf.download.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectDownload = reject;
        }),
    );
    render(<DraftPrintDialog document={draftPrintFixture} onClose={vi.fn()} />);
    const download = screen.getByRole('button', { name: 'Tải PDF' });
    await userEvent.click(download);
    expect(download).toBeDisabled();
    await act(async () => {
      rejectDownload(new Error('failed'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Không thể tạo PDF');
    expect(download).toBeEnabled();
  });

  it('returns focus to the trigger and closes on Escape', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const close = vi.fn();
    const { unmount } = render(
      <DraftPrintDialog document={draftPrintFixture} onClose={close} />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Đóng' })).toHaveFocus(),
    );
    await userEvent.keyboard('{Escape}');
    expect(close).toHaveBeenCalledOnce();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
