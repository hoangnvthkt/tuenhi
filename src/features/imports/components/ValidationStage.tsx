import { useMemo, useState } from 'react';
import type { ImportTarget } from '../model/contracts';
import type { ValidationDisplayRow } from '../model/validation-display';

export function ValidationStage({
  target,
  rows,
  totalRows,
  validRows,
  invalidRows,
  isBusy,
  isOnline,
  progressLabel,
  isComplete,
  errorMessage,
  onDownloadErrors,
  onContinue,
  onRetry,
  onBack,
}: {
  target: ImportTarget;
  rows: ValidationDisplayRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  isBusy: boolean;
  isOnline: boolean;
  progressLabel: string | null;
  isComplete: boolean;
  errorMessage: string | null;
  onDownloadErrors: () => void;
  onContinue: () => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  const [errorCode, setErrorCode] = useState('ALL');
  const [mobileIndex, setMobileIndex] = useState(0);
  const errorCodes = useMemo(
    () =>
      [
        ...new Set(
          rows.flatMap((row) => row.errors.map((error) => error.code)),
        ),
      ].sort(),
    [rows],
  );
  const filteredRows = useMemo(
    () =>
      errorCode === 'ALL'
        ? rows
        : rows.filter((row) =>
            row.errors.some((error) => error.code === errorCode),
          ),
    [errorCode, rows],
  );
  const mobileRow =
    filteredRows[Math.min(mobileIndex, Math.max(0, filteredRows.length - 1))];

  return (
    <div className="space-y-4">
      <div className="sticky top-2 z-10 grid gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Tổng số
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {totalRows.toLocaleString('vi-VN')}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Hợp lệ
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-800">
            {validRows.toLocaleString('vi-VN')}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
            Có lỗi
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-red-800">
            {invalidRows.toLocaleString('vi-VN')}
          </p>
        </div>
      </div>

      {isBusy ? (
        <div
          role="status"
          className="rounded-xl border border-teal-200 bg-teal-50 p-5"
        >
          <p className="font-semibold text-teal-950">
            Đang kiểm tra dữ liệu trên máy chủ…
          </p>
          <p className="mt-1 text-sm text-teal-800">
            {progressLabel ?? 'Đang chuẩn bị dữ liệu.'}
          </p>
        </div>
      ) : null}
      {errorMessage ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {errorMessage}
        </p>
      ) : null}

      {!isBusy && rows.length > 0 ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <label
              htmlFor="import-error-filter"
              className="mb-2 block text-sm font-semibold"
            >
              Lọc theo mã lỗi
            </label>
            <select
              id="import-error-filter"
              value={errorCode}
              onChange={(event) => {
                setErrorCode(event.target.value);
                setMobileIndex(0);
              }}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"
            >
              <option value="ALL">Tất cả lỗi</option>
              {errorCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          {invalidRows > 0 ? (
            <button
              type="button"
              onClick={onDownloadErrors}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold hover:bg-slate-50"
            >
              Tải tệp các dòng lỗi
            </button>
          ) : null}
        </div>
      ) : null}

      {!isBusy && rows.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Dòng Excel</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Mã lỗi</th>
                  <th className="px-4 py-3">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredRows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    tabIndex={0}
                    className="focus:bg-teal-50 focus:outline-none"
                  >
                    <td className="px-4 py-3 font-mono">{row.rowNumber}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${row.status === 'VALID' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}
                      >
                        {row.status === 'VALID' ? 'Hợp lệ' : 'Có lỗi'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {row.errors.map((error) => error.code).join(', ') || '—'}
                    </td>
                    <td className="max-w-xl px-4 py-3 text-slate-700">
                      {row.errors.map((error) => error.message).join(' ') ||
                        'Không có lỗi.'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:hidden">
            {mobileRow ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="font-semibold">
                    Dòng Excel {mobileRow.rowNumber}
                  </p>
                  <span className="text-xs text-slate-500">
                    {Math.min(mobileIndex + 1, filteredRows.length)}/
                    {filteredRows.length}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  {mobileRow.errors.length === 0 ? (
                    <p className="text-sm text-emerald-800">Dòng hợp lệ.</p>
                  ) : (
                    mobileRow.errors.map((error, index) => (
                      <div
                        key={`${error.code}:${index}`}
                        className="rounded-lg bg-red-50 p-3"
                      >
                        <code className="text-xs font-semibold text-red-900">
                          {error.code}
                        </code>
                        <p className="mt-1 text-sm text-red-800">
                          {error.message}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={mobileIndex === 0}
                    onClick={() =>
                      setMobileIndex((value) => Math.max(0, value - 1))
                    }
                    className="min-h-11 rounded-lg border border-slate-300 font-semibold disabled:opacity-40"
                  >
                    Dòng trước
                  </button>
                  <button
                    type="button"
                    disabled={mobileIndex >= filteredRows.length - 1}
                    onClick={() =>
                      setMobileIndex((value) =>
                        Math.min(filteredRows.length - 1, value + 1),
                      )
                    }
                    className="min-h-11 rounded-lg border border-slate-300 font-semibold disabled:opacity-40"
                  >
                    Dòng sau
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-600">
                Không có dòng phù hợp bộ lọc.
              </p>
            )}
          </div>
        </>
      ) : null}

      {!isBusy && invalidRows > 0 ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          Cần sửa toàn bộ dòng lỗi trong tệp Excel rồi chọn lại tệp. Không có
          dòng nào được nhập một phần.
        </p>
      ) : null}
      {!isOnline ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          Cần kết nối mạng để tiếp tục. Hệ thống sẽ không tự gửi khi có mạng
          lại.
        </p>
      ) : null}

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex flex-wrap justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
        <button
          type="button"
          onClick={onBack}
          disabled={isBusy}
          className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold disabled:opacity-50"
        >
          Chọn tệp khác
        </button>
        {!isComplete && !isBusy ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={!isOnline}
            className="min-h-11 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Thử kiểm tra lại
          </button>
        ) : null}
        {isComplete && invalidRows === 0 && !isBusy ? (
          <button
            type="button"
            onClick={onContinue}
            disabled={!isOnline}
            className="min-h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Xác nhận nhập
          </button>
        ) : null}
      </div>
      <span className="sr-only">Loại dữ liệu {target}</span>
    </div>
  );
}
