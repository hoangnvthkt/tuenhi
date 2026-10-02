import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DraftPrint } from '../api/sales-schemas';
import { formatViNumber } from '@/shared/lib/numeric/canonical-number';
import { getSupabaseClient } from '@/shared/supabase/client';
import { formatPosMoney } from '../model/format-money';
import { downloadDraftPdf } from '../model/sales-pdf';

export function DraftPrintDialog({
  document: receipt,
  onClose,
}: {
  document: DraftPrint;
  onClose: () => void;
}) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const trigger = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);
  const logoUrl = receipt.store.logoPath
    ? getSupabaseClient()
        .storage.from('store-branding')
        .getPublicUrl(receipt.store.logoPath).data.publicUrl
    : null;
  const download = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setError(null);
    try {
      await downloadDraftPdf(receipt);
    } catch {
      setError('Không thể tạo PDF. Vui lòng thử lại.');
    } finally {
      setPdfBusy(false);
    }
  };
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="draft-print-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4 print:static print:overflow-visible print:bg-white print:p-0"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
        if (event.key === 'Tab') {
          const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>(
            'button:not(:disabled)',
          );
          if (!buttons?.length) return;
          const first = buttons[0]!;
          const last = buttons[buttons.length - 1]!;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <div
        ref={panelRef}
        className="mx-auto w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl print:p-0 print:shadow-none"
      >
        <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
          <h2 id="draft-print-title" className="text-lg font-semibold">
            Xem phiếu tạm tính
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-slate-300 px-4"
          >
            Đóng
          </button>
        </div>
        <article id="invoice-print" className="bg-white text-sm">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo cửa hàng"
              className="mx-auto mb-2 max-h-16 max-w-32 object-contain"
            />
          ) : null}
          <h3 className="text-center text-xl font-bold">
            {receipt.store.displayName}
          </h3>
          {receipt.store.address ? (
            <p className="text-center">{receipt.store.address}</p>
          ) : null}
          {receipt.store.contactPhone ? (
            <p className="text-center">{receipt.store.contactPhone}</p>
          ) : null}
          <p className="my-4 text-center font-bold">
            PHIẾU TẠM TÍNH — CHƯA THANH TOÁN
          </p>
          <p>Khách hàng: {receipt.draft.customerName ?? 'Khách lẻ'}</p>
          {receipt.draft.customerPhone ? (
            <p>{receipt.draft.customerPhone}</p>
          ) : null}
          <p>Kênh bán: {receipt.draft.channelName}</p>
          <p>Nhân viên: {receipt.draft.staffName}</p>
          <p>
            Cập nhật:{' '}
            {new Date(receipt.draft.updatedAt).toLocaleString('vi-VN')}
          </p>
          <table className="my-4 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="py-2">Sản phẩm</th>
                <th className="p-2 text-right">SL</th>
                <th className="py-2 text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {receipt.lines.map((line) => (
                <tr
                  key={line.id}
                  className="border-b border-slate-100 break-inside-avoid"
                >
                  <td className="py-2">
                    <p>{line.productName}</p>
                    <p className="text-slate-600">
                      {line.sku} · {line.unitName} ·{' '}
                      {formatPosMoney(line.unitSalePrice)}
                    </p>
                  </td>
                  <td className="p-2 text-right">
                    {formatViNumber(line.quantity)}
                  </td>
                  <td className="py-2 text-right">
                    {formatPosMoney(line.netAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="space-y-1">
            <div className="flex justify-between gap-3">
              <dt>Tiền hàng</dt>
              <dd>{formatPosMoney(receipt.totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Giảm dòng</dt>
              <dd>{formatPosMoney(receipt.totals.lineDiscountTotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Giảm toàn đơn</dt>
              <dd>{formatPosMoney(receipt.totals.orderDiscountTotal)}</dd>
            </div>
            <div className="flex justify-between gap-3 font-bold">
              <dt>Tạm tính</dt>
              <dd>{formatPosMoney(receipt.totals.netTotal)}</dd>
            </div>
          </dl>
          {receipt.draft.note ? (
            <p className="mt-4 whitespace-pre-wrap">{receipt.draft.note}</p>
          ) : null}
          <p className="mt-4 text-center">
            Chưa ghi nhận thanh toán. Phiếu này không phải hóa đơn bán hàng.
          </p>
          {receipt.store.invoiceFooter ? (
            <p className="mt-2 text-center">{receipt.store.invoiceFooter}</p>
          ) : null}
        </article>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-700 print:hidden">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex gap-3 print:hidden">
          <button
            type="button"
            onClick={() => {
              try {
                window.print();
              } catch {
                setError(
                  'Không thể mở hộp thoại in. Vui lòng tải PDF hoặc thử lại.',
                );
              }
            }}
            className="min-h-11 flex-1 rounded-lg border border-teal-700 px-4 font-semibold text-teal-800"
          >
            In nhiệt
          </button>
          <button
            type="button"
            onClick={() => void download()}
            disabled={pdfBusy}
            className="min-h-11 flex-1 rounded-lg bg-teal-700 px-4 font-semibold text-white disabled:opacity-50"
          >
            Tải PDF
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
