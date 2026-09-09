import { useState } from 'react';
import type { ResolvedPurchaseProduct } from '../api/purchase-schemas';
import type { PurchaseDraftLine } from '../model/purchase-draft';
import { validatePurchaseReceiptRows } from '../model/purchase-excel-import';
import {
  inspectWorkbook,
  type InspectedWorkbook,
} from '@/features/imports';

type ImportPreview = Awaited<ReturnType<typeof validatePurchaseReceiptRows>>;

function importMessage(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : 'Không thể kiểm tra file Excel.';
}

export function PurchaseExcelImportDialog({
  existingProductIds,
  resolveProducts,
  onApply,
  onClose,
  inspect = inspectWorkbook,
}: {
  existingProductIds: Set<string>;
  resolveProducts: (skus: string[]) => Promise<ResolvedPurchaseProduct[]>;
  onApply: (lines: PurchaseDraftLine[]) => void;
  onClose: () => void;
  inspect?: (
    file: File,
    expected: { target: 'PURCHASE_RECEIPT'; version: 1 },
  ) => Promise<InspectedWorkbook>;
}) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const workbook = await inspect(file, {
        target: 'PURCHASE_RECEIPT',
        version: 1,
      });
      const nextPreview = await validatePurchaseReceiptRows({
        headers: workbook.headers,
        rows: workbook.rows,
        existingProductIds,
        resolveProducts,
      });
      setFileName(workbook.fileName);
      setPreview(nextPreview);
    } catch (reason) {
      setError(importMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-excel-import-title"
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="purchase-excel-import-title" className="text-lg font-bold">
            Nhập hàng loạt từ Excel
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            File chỉ gồm SKU, số lượng nhận và đơn giá nhập. Tất cả các dòng
            phải hợp lệ trước khi nạp vào phiếu.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg px-3 text-sm font-semibold text-slate-700"
        >
          Đóng
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href="/templates/import/purchase-receipt-v1.xlsx"
          className="inline-flex min-h-11 items-center rounded-lg border border-teal-800 px-4 text-sm font-semibold text-teal-900 hover:bg-teal-50"
        >
          Tải file mẫu
        </a>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900">
          Chọn file Excel
          <input
            aria-label="Chọn file Excel"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
        </label>
        {fileName ? (
          <span className="text-sm text-slate-600">{fileName}</span>
        ) : null}
      </div>

      {busy ? (
        <p role="status" className="mt-4 text-sm text-slate-600">
          Đang kiểm tra file…
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      {preview ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2">Dòng</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Hàng hóa</th>
                <th className="px-3 py-2">Số lượng</th>
                <th className="px-3 py-2">Đơn giá nhập</th>
                <th className="px-3 py-2">Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.rowNumber} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.rowNumber}</td>
                  <td className="px-3 py-2">{row.sku || '—'}</td>
                  <td className="px-3 py-2">{row.productName ?? '—'}</td>
                  <td className="px-3 py-2">{row.receivedQty || '—'}</td>
                  <td className="px-3 py-2">{row.unitCost || '—'}</td>
                  <td
                    className={
                      row.issue
                        ? 'px-3 py-2 text-red-700'
                        : 'px-3 py-2 text-emerald-700'
                    }
                  >
                    {row.issue ?? 'Hợp lệ'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-4 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold"
        >
          Hủy
        </button>
        <button
          type="button"
          disabled={!preview?.canApply || busy}
          onClick={() => {
            if (!preview?.canApply) return;
            onApply(preview.lines);
          }}
          className="min-h-11 rounded-lg bg-teal-800 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Nạp vào phiếu
        </button>
      </div>
    </div>
  );
}
