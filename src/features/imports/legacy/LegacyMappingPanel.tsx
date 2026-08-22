import type { Dispatch, SetStateAction } from 'react';
import type { LegacyResolution } from './legacy-q237-contract';
import {
  legacyResolutionsReady,
  type LegacyLabelKind,
  type LegacyLabels,
  type LegacyResolutions,
  type LegacyTargets,
} from './legacy-mapping';

const kindLabels: Record<LegacyLabelKind, string> = {
  staff: 'nhân viên',
  channel: 'kênh bán',
  customer: 'khách hàng',
  product: 'sản phẩm',
};

export function LegacyMappingPanel({
  labels,
  targets,
  resolutions,
  invoiceCount,
  productCandidateCount,
  customerCandidateCount,
  openingSuggestionCount,
  isBusy = false,
  onChange,
  onContinue,
}: {
  labels: LegacyLabels;
  targets: LegacyTargets;
  resolutions: LegacyResolutions;
  invoiceCount: number;
  productCandidateCount: number;
  customerCandidateCount: number;
  openingSuggestionCount: number;
  isBusy?: boolean;
  onChange: Dispatch<SetStateAction<LegacyResolutions>>;
  onContinue: () => void;
}) {
  const ready = legacyResolutionsReady(labels, resolutions);

  function update(
    kind: LegacyLabelKind,
    label: string,
    resolution: LegacyResolution | null,
  ) {
    onChange((current) => ({
      ...current,
      [kind]: { ...current[kind], [label]: resolution },
    }));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
        <span className="inline-flex rounded-md bg-amber-900 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
          Chỉ để tra cứu
        </span>
        <p className="mt-3 text-sm text-amber-950">
          Mapping chỉ tạo liên kết tra cứu. Không tạo thanh toán, tồn kho, giá
          vốn, doanh thu, trả hàng hoặc hủy hóa đơn.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold shadow-sm">
          {invoiceCount.toLocaleString('vi-VN')} hóa đơn lưu trữ
        </p>
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold shadow-sm">
          {(productCandidateCount + customerCandidateCount).toLocaleString(
            'vi-VN',
          )}{' '}
          ứng viên danh mục
        </p>
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold shadow-sm">
          {openingSuggestionCount.toLocaleString('vi-VN')} gợi ý mở sổ, chưa
          được ghi
        </p>
      </div>

      {(Object.keys(labels) as LegacyLabelKind[]).map((kind) =>
        labels[kind].length > 0 ? (
          <section
            key={kind}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="font-bold capitalize text-slate-950">
                Ghép {kindLabels[kind]}
              </h3>
            </header>
            <ul className="divide-y divide-slate-200">
              {labels[kind].map((label) => {
                const resolution = resolutions[kind][label];
                const selected =
                  resolution?.kind === 'TARGET'
                    ? resolution.targetId
                    : resolution?.kind === 'SOURCE_LABEL_ONLY'
                      ? 'SOURCE_LABEL_ONLY'
                      : '';
                return (
                  <li
                    key={label}
                    className="grid gap-3 p-4 md:grid-cols-[minmax(10rem,1fr)_minmax(14rem,1fr)_auto] md:items-center"
                  >
                    <p className="font-medium text-slate-900">{label}</p>
                    <select
                      aria-label={`Ghép ${kindLabels[kind]} ${label}`}
                      value={selected}
                      disabled={isBusy}
                      onChange={(event) => {
                        const value = event.target.value;
                        update(
                          kind,
                          label,
                          value === 'SOURCE_LABEL_ONLY'
                            ? {
                                kind: 'SOURCE_LABEL_ONLY',
                                confirmed: false,
                              }
                            : value
                              ? {
                                  kind: 'TARGET',
                                  targetId: value,
                                  confirmed: false,
                                }
                              : null,
                        );
                      }}
                      className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
                    >
                      <option value="">Chọn dữ liệu đích</option>
                      {targets[kind].map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                          {option.code ? ` · ${option.code}` : ''}
                        </option>
                      ))}
                      <option value="SOURCE_LABEL_ONLY">
                        Chỉ giữ nhãn cũ, không liên kết
                      </option>
                    </select>
                    {resolution ? (
                      <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={resolution.confirmed}
                          disabled={isBusy}
                          aria-label={
                            resolution.kind === 'SOURCE_LABEL_ONLY'
                              ? `Xác nhận chỉ giữ nhãn ${label}`
                              : `Xác nhận ghép ${label}`
                          }
                          onChange={(event) =>
                            update(kind, label, {
                              ...resolution,
                              confirmed: event.target.checked,
                            })
                          }
                          className="h-4 w-4 accent-teal-700"
                        />
                        Xác nhận
                      </label>
                    ) : (
                      <span className="text-xs font-medium text-red-700">
                        Chưa ghép
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null,
      )}

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex justify-end rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
        <button
          type="button"
          disabled={!ready || isBusy}
          onClick={onContinue}
          className="min-h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isBusy ? 'Đang kiểm tra…' : 'Kiểm tra dữ liệu cũ'}
        </button>
      </div>
    </div>
  );
}
