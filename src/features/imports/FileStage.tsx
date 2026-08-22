import type { ChangeEvent } from 'react';
import type { ImportMode, ImportTarget } from './contracts';
import { getTemplateContract } from './template-contracts';

const targetLabels: Record<ImportTarget, string> = {
  CATEGORIES: 'Nhóm hàng',
  PRODUCTS: 'Sản phẩm',
  SUPPLIERS: 'Nhà cung cấp',
  CUSTOMERS: 'Khách hàng',
};

export function FileStage({
  targets,
  target,
  version,
  mode,
  isOwner,
  isOnline,
  isBusy,
  errorMessage,
  onTargetChange,
  onModeChange,
  onFile,
  onRetry,
}: {
  targets: ImportTarget[];
  target: ImportTarget;
  version: number;
  mode: ImportMode;
  isOwner: boolean;
  isOnline: boolean;
  isBusy: boolean;
  errorMessage: string | null;
  onTargetChange: (target: ImportTarget) => void;
  onModeChange: (mode: ImportMode) => void;
  onFile: (file: File) => void;
  onRetry?: () => void;
}) {
  const contract = getTemplateContract(target, version);
  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.target.value = '';
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="import-target"
              className="mb-2 block text-sm font-semibold"
            >
              Loại dữ liệu
            </label>
            <select
              id="import-target"
              value={target}
              onChange={(event) =>
                onTargetChange(event.target.value as ImportTarget)
              }
              disabled={isBusy}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
            >
              {targets.map((item) => (
                <option key={item} value={item}>
                  {targetLabels[item]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="import-mode"
              className="mb-2 block text-sm font-semibold"
            >
              Cách nhập
            </label>
            <select
              id="import-mode"
              value={mode}
              onChange={(event) =>
                onModeChange(event.target.value as ImportMode)
              }
              disabled={isBusy || !isOwner}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
            >
              <option value="CREATE_ONLY">Chỉ tạo dữ liệu mới</option>
              {isOwner ? (
                <option value="UPDATE_EXISTING">
                  Cập nhật dữ liệu hiện có
                </option>
              ) : null}
            </select>
            {!isOwner ? (
              <p className="mt-2 text-xs text-slate-600">
                Chỉ chủ cửa hàng được cập nhật dữ liệu đã có bằng Excel.
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p className="font-semibold text-slate-950">
            Chọn tệp .xlsx tối đa 5 MiB
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Tệp chỉ được đọc trong trang này và không được tải nguyên bản lên
            máy chủ.
          </p>
          <label className="mt-5 inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
            {isBusy ? 'Đang kiểm tra…' : 'Chọn tệp Excel'}
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!isOnline || isBusy}
              onChange={selectFile}
              className="sr-only"
            />
          </label>
        </div>
        {!isOnline ? (
          <p
            role="status"
            className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950"
          >
            Cần kết nối mạng để bắt đầu phiên nhập. Hệ thống sẽ không tự gửi khi
            có mạng lại.
          </p>
        ) : null}
        {errorMessage ? (
          <div
            role="alert"
            className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            <p>{errorMessage}</p>
            {onRetry ? (
              <button
                type="button"
                disabled={!isOnline || isBusy}
                onClick={onRetry}
                className="mt-3 min-h-11 rounded-lg border border-red-300 px-4 font-semibold disabled:opacity-50"
              >
                Thử lại với cùng tệp
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <aside className="rounded-xl border border-teal-200 bg-teal-50 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-teal-800">
          Mẫu đang dùng
        </p>
        <h2 className="mt-2 font-bold text-slate-950">
          {contract.displayName}
        </h2>
        <p className="mt-2 text-sm text-slate-700">
          Phiên bản {contract.version}
        </p>
        <a
          href={`/templates/import/${contract.fileName}`}
          download
          className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-teal-700 px-4 text-sm font-semibold text-teal-900 hover:bg-white"
        >
          Tải mẫu Excel
        </a>
      </aside>
    </div>
  );
}
