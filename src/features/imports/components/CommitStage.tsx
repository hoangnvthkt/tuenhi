import { Link } from 'react-router';
import type { ImportCommitResult } from '../api/import-api';
import type { ImportMode, ImportTarget } from '../model/contracts';

const targetLabels: Record<ImportTarget, string> = {
  CATEGORIES: 'Nhóm hàng',
  PRODUCTS: 'Sản phẩm',
  SUPPLIERS: 'Nhà cung cấp',
  CUSTOMERS: 'Khách hàng',
  OPENING_BALANCES: 'Tồn và giá vốn đầu kỳ',
  PURCHASE_RECEIPT: 'Phiếu nhập hàng',
};

export function CommitStage({
  target,
  mode,
  fileName,
  totalRows,
  importRunId,
  isOnline,
  isBusy,
  result,
  errorMessage,
  onCommit,
}: {
  target: ImportTarget;
  mode: ImportMode;
  fileName: string;
  totalRows: number;
  importRunId: string;
  isOnline: boolean;
  isBusy: boolean;
  result: ImportCommitResult | null;
  errorMessage: string | null;
  onCommit: () => void;
}) {
  if (result) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <p className="text-sm font-bold uppercase tracking-wide text-emerald-800">
          Đã hoàn tất
        </p>
        <h2 className="mt-2 text-2xl font-bold text-emerald-950">
          Nhập dữ liệu thành công
        </h2>
        <p className="mt-3 text-sm text-emerald-900">
          {result.stockCountId
            ? `Đã tạo phiếu mở sổ nháp từ ${result.totalRows.toLocaleString('vi-VN')} dòng. Tồn kho chưa thay đổi.`
            : `Đã tạo ${result.createdRows.toLocaleString('vi-VN')} và cập nhật ${result.updatedRows.toLocaleString('vi-VN')} dòng. Phiên nhập không lưu tệp Excel gốc.`}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to={
              result.stockCountId
                ? `/more/inventory/opening/${result.stockCountId}`
                : `/imports/${importRunId}`
            }
            className="inline-flex min-h-11 items-center rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white"
          >
            {result.stockCountId
              ? 'Kiểm tra phiếu mở sổ'
              : 'Xem kết quả phiên nhập'}
          </Link>
          <Link
            to="/imports"
            reloadDocument
            className="inline-flex min-h-11 items-center rounded-lg border border-emerald-700 px-4 text-sm font-semibold text-emerald-950"
          >
            Nhập tệp khác
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Kiểm tra lần cuối</h2>
        <dl className="mt-4 divide-y divide-slate-200 text-sm">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-slate-600">Tệp</dt>
            <dd className="break-all text-right font-semibold">{fileName}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-slate-600">Loại dữ liệu</dt>
            <dd className="font-semibold">{targetLabels[target]}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-slate-600">Cách nhập</dt>
            <dd className="font-semibold">
              {mode === 'CREATE_ONLY' ? 'Chỉ tạo mới' : 'Cập nhật hiện có'}
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-slate-600">Số dòng</dt>
            <dd className="font-semibold tabular-nums">
              {totalRows.toLocaleString('vi-VN')}
            </dd>
          </div>
        </dl>
        <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {target === 'OPENING_BALANCES'
            ? 'Khi xác nhận, hệ thống chỉ tạo phiếu mở sổ nháp để owner kiểm tra. Chưa có tồn kho hoặc giá vốn nào được ghi sổ.'
            : 'Khi xác nhận, toàn bộ tệp được ghi trong một giao dịch. Nếu có lỗi hoặc dữ liệu vừa thay đổi, không dòng nào được lưu.'}
        </p>
        {!isOnline ? (
          <p
            role="status"
            className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950"
          >
            Cần kết nối mạng để xác nhận. Hệ thống sẽ không tự gửi khi có mạng
            lại.
          </p>
        ) : null}
        {errorMessage ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {errorMessage}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onCommit}
          disabled={!isOnline || isBusy}
          className="mt-5 min-h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isBusy ? 'Đang xác nhận…' : 'Nhập toàn bộ dữ liệu'}
        </button>
      </div>
      <aside className="rounded-xl border border-slate-200 bg-slate-100 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
          Phiên nhập
        </p>
        <code className="mt-2 block break-all text-xs text-slate-700">
          {importRunId}
        </code>
        <p className="mt-4 text-sm text-slate-700">
          Nếu kết nối gián đoạn, hãy mở lịch sử và kiểm tra kết quả trước khi
          thử lại.
        </p>
      </aside>
    </div>
  );
}
