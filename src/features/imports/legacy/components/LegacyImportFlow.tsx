import { Link } from 'react-router';
import type { LegacySalesApi } from '@/features/legacy-sales';
import { useLegacyImportWorkflow } from '../hooks/use-legacy-import-workflow';
import type { LegacyTargets } from '../model/legacy-mapping';
import { parseLegacyQ237Workbook } from '../parser/legacy-q237-parser';
import { LegacyMappingPanel } from './LegacyMappingPanel';

const stages = [
  'Chọn tệp',
  'Ghép cột',
  'Kiểm tra dữ liệu',
  'Xác nhận nhập',
] as const;

export function LegacyImportFlow({
  isOnline,
  api,
  parse = parseLegacyQ237Workbook,
  loadTargets,
  onBack,
}: {
  isOnline: boolean;
  api?: LegacySalesApi;
  parse?: typeof parseLegacyQ237Workbook;
  loadTargets?: () => Promise<LegacyTargets>;
  onBack: () => void;
}) {
  const workflow = useLegacyImportWorkflow({
    api,
    isOnline,
    loadTargets,
    parse,
  });

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-semibold text-teal-800 hover:underline"
          >
            ← Nhập danh mục chuẩn
          </button>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">
            Nhập dữ liệu bán hàng cũ
          </h1>
        </div>
        <span className="rounded-md bg-amber-900 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white">
          Chỉ để tra cứu
        </span>
      </div>
      <ol
        aria-label="Tiến trình nhập dữ liệu cũ"
        className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-4"
      >
        {stages.map((stage, index) => (
          <li
            key={stage}
            aria-current={index === workflow.stageIndex ? 'step' : undefined}
            className={`rounded-lg px-3 py-3 text-sm font-semibold ${index === workflow.stageIndex ? 'bg-teal-700 text-white' : index < workflow.stageIndex ? 'bg-teal-50 text-teal-900' : 'text-slate-500'}`}
          >
            {stage}
          </li>
        ))}
      </ol>

      {workflow.stageIndex === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="font-semibold">
            Chọn đúng workbook dữ liệu cũ được hỗ trợ
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Tệp được đọc trong bộ nhớ trình duyệt, không tải nguyên bản lên máy
            chủ.
          </p>
          <label className="mt-5 inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white has-[:disabled]:opacity-50">
            {workflow.isBusy ? 'Đang kiểm tra…' : 'Chọn workbook dữ liệu cũ'}
            <input
              aria-label="Chọn workbook dữ liệu cũ"
              type="file"
              accept=".xlsx"
              disabled={!isOnline || workflow.isBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void workflow.chooseFile(file);
                event.target.value = '';
              }}
              className="sr-only"
            />
          </label>
          {workflow.retryFile && workflow.errorMessage ? (
            <button
              type="button"
              disabled={!isOnline || workflow.isBusy}
              onClick={() =>
                void workflow.chooseFile(workflow.retryFile!, true)
              }
              className="mt-3 min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold"
            >
              Thử lại với cùng tệp
            </button>
          ) : null}
        </div>
      ) : null}
      {workflow.stageIndex === 1 && workflow.parsed ? (
        <LegacyMappingPanel
          labels={workflow.parsed.labels}
          targets={workflow.targets}
          resolutions={workflow.resolutions}
          invoiceCount={workflow.parsed.sales.length}
          productCandidateCount={workflow.parsed.productCandidates.length}
          customerCandidateCount={workflow.parsed.customerCandidates.length}
          openingSuggestionCount={workflow.parsed.openingSuggestions.length}
          isBusy={workflow.isBusy}
          onChange={workflow.setResolutions}
          onContinue={() => void workflow.validateArchive()}
        />
      ) : null}
      {workflow.stageIndex === 2 ? (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-5">
          <p className="font-semibold text-teal-950">
            {workflow.isBusy
              ? 'Đang kiểm tra dữ liệu cũ…'
              : workflow.errorMessage
                ? 'Kiểm tra chưa hoàn tất'
                : 'Đã kiểm tra'}
          </p>
          <p className="mt-2 text-sm text-teal-800">{workflow.progress}</p>
          {workflow.errorMessage ? (
            <>
              <p
                role="alert"
                className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
              >
                {workflow.errorMessage}
              </p>
              <button
                type="button"
                disabled={!isOnline || workflow.isBusy}
                onClick={() => void workflow.validateArchive()}
                className="mt-3 min-h-11 rounded-lg border border-teal-700 px-4 text-sm font-semibold text-teal-900"
              >
                Thử kiểm tra lại
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {workflow.stageIndex === 3 && workflow.validated ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Xác nhận kho tra cứu riêng</h2>
          <p className="mt-3 text-sm text-slate-700">
            {workflow.validated.totalRows.toLocaleString('vi-VN')} dòng đã kiểm
            tra · {workflow.validated.warningCount.toLocaleString('vi-VN')} cảnh
            báo. Các ứng viên danh mục phải được nhập riêng qua mẫu chuẩn. Gợi ý
            mở sổ vẫn chưa được ghi.
          </p>
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
            Xác nhận này chỉ tạo dữ liệu cũ. Không tạo payment, movement tồn/giá
            vốn, doanh thu, trả hàng hoặc hủy hóa đơn.
          </p>
          {workflow.errorMessage ? (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
            >
              {workflow.errorMessage}
            </p>
          ) : null}
          {workflow.result ? (
            <div className="mt-5 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-bold">
                Đã lưu {workflow.result.archiveSales.toLocaleString('vi-VN')}{' '}
                hóa đơn cũ.
              </p>
              <Link
                to={`/legacy-sales?importRunId=${workflow.importRunId}`}
                className="mt-3 inline-flex min-h-11 items-center font-semibold text-emerald-900 underline"
              >
                Mở dữ liệu cũ
              </Link>
            </div>
          ) : (
            <button
              type="button"
              disabled={!isOnline || workflow.isBusy}
              onClick={() => void workflow.commitArchive()}
              className="mt-5 min-h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {workflow.isBusy ? 'Đang lưu…' : 'Lưu vào dữ liệu cũ'}
            </button>
          )}
        </div>
      ) : null}
      {!isOnline ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950"
        >
          Cần kết nối mạng để tiếp tục. Hệ thống sẽ không tự gửi khi có mạng
          lại.
        </p>
      ) : null}
      {workflow.stageIndex === 0 && workflow.errorMessage ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {workflow.errorMessage}
        </p>
      ) : null}
    </section>
  );
}
