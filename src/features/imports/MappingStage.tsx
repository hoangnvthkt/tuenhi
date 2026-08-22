import type { ImportTarget } from './contracts';
import type { ColumnMapping, MappingIssue, MappingTarget } from './mapping';
import { getTemplateContract } from './template-contracts';

export function MappingStage({
  target,
  version,
  fileName,
  rowCount,
  exactTemplate,
  mapping,
  issues,
  isOnline,
  isBusy,
  canImportPrice,
  onMappingChange,
  onContinue,
  onBack,
}: {
  target: ImportTarget;
  version: number;
  fileName: string;
  rowCount: number;
  exactTemplate: boolean;
  mapping: ColumnMapping[];
  issues: MappingIssue[];
  isOnline: boolean;
  isBusy: boolean;
  canImportPrice: boolean;
  onMappingChange: (mapping: ColumnMapping[]) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const contract = getTemplateContract(target, version);
  function update(index: number, values: Partial<ColumnMapping>) {
    onMappingChange(
      mapping.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...values } : item,
      ),
    );
  }
  function selectTarget(index: number, targetField: MappingTarget) {
    update(index, {
      targetField,
      ignoreConfirmed: targetField === 'IGNORED_SENSITIVE' ? true : false,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="font-semibold text-slate-950">{fileName}</p>
          <p className="mt-1 text-sm text-slate-600">
            {rowCount.toLocaleString('vi-VN')} dòng dữ liệu ·{' '}
            {exactTemplate
              ? 'Đúng mẫu, đã ghép tự động'
              : 'Cần kiểm tra ghép cột'}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          disabled={isBusy}
          className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
        >
          Chọn tệp khác
        </button>
      </div>

      {!canImportPrice && target === 'PRODUCTS' ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Bạn không có quyền nhập giá bán. Cột “Giá bán hiện hành” sẽ bị bỏ qua
          và không được gửi lên máy chủ.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3">Cột trong Excel</th>
              <th className="px-4 py-3">Trường hệ thống</th>
              <th className="px-4 py-3">Xác nhận</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {mapping.map((item, index) => {
              const isSensitive = item.targetField === 'IGNORED_SENSITIVE';
              const isPriceBlocked =
                !canImportPrice &&
                contract.columns.some(
                  (column) =>
                    column.field === 'salePrice' &&
                    column.header === item.sourceHeader,
                );
              return (
                <tr key={`${item.sourceIndex}:${item.sourceHeader}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {item.sourceHeader || '(Không có tiêu đề)'}
                  </td>
                  <td className="px-4 py-3">
                    {isSensitive ? (
                      <span className="text-amber-900">
                        Không nhập vì ngoài phạm vi hoặc nhạy cảm
                      </span>
                    ) : (
                      <select
                        aria-label={`Ghép cột ${item.sourceHeader}`}
                        value={item.targetField ?? ''}
                        disabled={isBusy || isPriceBlocked}
                        onChange={(event) =>
                          selectTarget(
                            index,
                            (event.target.value || null) as MappingTarget,
                          )
                        }
                        className="min-h-11 min-w-56 rounded-lg border border-slate-300 bg-white px-3"
                      >
                        <option value="">Chọn trường</option>
                        {contract.columns.map((column) => (
                          <option
                            key={column.field}
                            value={column.field}
                            disabled={
                              column.field === 'salePrice' && !canImportPrice
                            }
                          >
                            {column.header}
                            {column.required ? ' *' : ''}
                          </option>
                        ))}
                        <option value="IGNORED">Bỏ qua cột này</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.targetField === 'IGNORED' ? (
                      <label className="flex min-h-11 items-center gap-2 text-slate-700">
                        <input
                          type="checkbox"
                          checked={item.ignoreConfirmed}
                          disabled={isBusy || isPriceBlocked}
                          onChange={(event) =>
                            update(index, {
                              ignoreConfirmed: event.target.checked,
                            })
                          }
                          className="h-4 w-4 accent-teal-700"
                        />
                        Tôi xác nhận bỏ qua
                      </label>
                    ) : isSensitive ? (
                      <span className="text-xs text-slate-600">
                        Luôn bị loại trước khi tạo dữ liệu gửi
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {issues.length > 0 ? (
        <div
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <p className="font-semibold">
            Cần xử lý ghép cột trước khi tiếp tục:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {issues.map((issue, index) => (
              <li key={`${issue.code}:${index}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {!isOnline ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          Cần kết nối mạng để kiểm tra dữ liệu. Hệ thống sẽ không tự gửi khi có
          mạng lại.
        </p>
      ) : null}

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex justify-end rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
        <button
          type="button"
          onClick={onContinue}
          disabled={!isOnline || isBusy || issues.length > 0}
          className="min-h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isBusy ? 'Đang kiểm tra…' : 'Kiểm tra dữ liệu'}
        </button>
      </div>
    </div>
  );
}
