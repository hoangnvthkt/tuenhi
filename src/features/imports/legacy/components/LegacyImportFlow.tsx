import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { createCatalogApi } from '@/features/catalog';
import { createDirectoryApi } from '@/features/directories';
import { createSettingsApi } from '@/features/settings';
import {
  createLegacySalesApi,
  LegacySalesApiError,
  type LegacyArchiveCommit,
  type LegacySalesApi,
  type LegacyStagedRow,
} from '@/features/legacy-sales';
import { createStaffApi } from '@/features/staff';
import { LegacyMappingPanel } from './LegacyMappingPanel';
import {
  proposeLegacyResolutions,
  type LegacyResolutions,
  type LegacyTargets,
} from '../model/legacy-mapping';
import {
  parseLegacyQ237Workbook,
  type LegacyParseResult,
  LegacyWorkbookError,
} from '../parser/legacy-q237-parser';

const stages = [
  'Chọn tệp',
  'Ghép cột',
  'Kiểm tra dữ liệu',
  'Xác nhận nhập',
] as const;

function safeLegacyError(error: unknown, fallback: string) {
  return error instanceof LegacySalesApiError ||
    error instanceof LegacyWorkbookError
    ? error.message
    : fallback;
}

async function loadMappingTargets(): Promise<LegacyTargets> {
  const staffApi = createStaffApi();
  const directoryApi = createDirectoryApi();
  const settingsApi = createSettingsApi();
  const catalogApi = createCatalogApi();
  const [staff, customers, channels, products] = await Promise.all([
    staffApi.list(),
    directoryApi.listCustomers({ limit: 100 }),
    settingsApi.listSalesChannels(true),
    catalogApi.list({ includeInactive: true, limit: 100 }),
  ]);
  return {
    staff: staff.items.map((item) => ({
      id: item.id,
      label: item.displayName,
    })),
    channel: channels.map((item) => ({
      id: item.id,
      label: item.name,
      code: item.code,
    })),
    customer: customers.items.map((item) => ({
      id: item.id,
      label: item.name,
      ...(item.code ? { code: item.code } : {}),
    })),
    product: products.items.map((item) => ({
      id: item.id,
      label: item.name,
      code: item.sku,
    })),
  };
}

function stagedRows(parsed: LegacyParseResult): LegacyStagedRow[] {
  const rows: LegacyStagedRow[] = [];
  for (const [groupIndex, sale] of parsed.sales.entries()) {
    for (const line of sale.lines) {
      rows.push({
        rowNumber: rows.length + 2,
        values: {
          sourceGroupIndex: groupIndex + 1,
          sourceSaleNumber: sale.sourceSaleNumber,
          sourceRowStart: sale.sourceRowStart,
          sourceRowNumber: line.sourceRowNumber,
          lineNumber: line.lineNumber,
          soldOn: sale.soldOn,
          staffLabel: sale.staffLabel,
          channelLabel: sale.channelLabel,
          customerLabel: sale.customerLabel,
          customerPhone: sale.customerPhone,
          paymentLabel: sale.paymentLabel,
          paymentMethod: sale.proposedPaymentMethod,
          statusLabel: sale.statusLabel,
          note: sale.note,
          productCode: line.productCode,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitPriceProvenance: line.unitPriceProvenance,
          lineDiscount: line.lineDiscount,
          lineTotal: line.lineTotal,
          lineTotalProvenance: line.lineTotalProvenance,
          warningCodes: line.warningCodes,
          ...(rows.length === 0
            ? { openingSuggestions: parsed.openingSuggestions }
            : {}),
        },
      });
    }
  }
  return rows;
}

export function LegacyImportFlow({
  isOnline,
  api: apiProp,
  parse = parseLegacyQ237Workbook,
  loadTargets = loadMappingTargets,
  onBack,
}: {
  isOnline: boolean;
  api?: LegacySalesApi;
  parse?: typeof parseLegacyQ237Workbook;
  loadTargets?: () => Promise<LegacyTargets>;
  onBack: () => void;
}) {
  const [api] = useState(() => apiProp ?? createLegacySalesApi());
  const toast = useToast();
  const [stageIndex, setStageIndex] = useState(0);
  const [parsed, setParsed] = useState<LegacyParseResult | null>(null);
  const [targets, setTargets] = useState<LegacyTargets>({
    staff: [],
    channel: [],
    customer: [],
    product: [],
  });
  const [resolutions, setResolutions] = useState<LegacyResolutions>({
    staff: {},
    channel: {},
    customer: {},
    product: {},
  });
  const [importRunId, setImportRunId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [validated, setValidated] = useState<{
    totalRows: number;
    warningCount: number;
  } | null>(null);
  const [result, setResult] = useState<LegacyArchiveCommit | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const createKey = useRef<string | null>(null);
  const commitKey = useRef<string | null>(null);
  const uploadPhase = useRef<'MAPPING' | 'CHUNKS' | 'ARCHIVE_VALIDATION'>(
    'MAPPING',
  );
  const nextChunk = useRef(0);

  async function chooseFile(file: File, reuseKey = false) {
    if (!isOnline || isBusy) return;
    if (!reuseKey) createKey.current = crypto.randomUUID();
    createKey.current ??= crypto.randomUUID();
    setRetryFile(file);
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const inspected = await parse(file);
      const blocking = inspected.issues.filter((issue) => issue.blocking);
      if (blocking.length > 0) {
        setParsed(inspected);
        setErrorMessage(
          blocking
            .map((issue) => `Dòng ${issue.rowNumber ?? '—'}: ${issue.message}`)
            .join(' '),
        );
        createKey.current = null;
        setRetryFile(null);
        return;
      }
      const [run, availableTargets] = await Promise.all([
        api.createImport({
          fileName: inspected.fileName,
          fileSha256: inspected.fileSha256,
          idempotencyKey: createKey.current,
        }),
        loadTargets(),
      ]);
      setParsed(inspected);
      setImportRunId(run.importRunId);
      setTargets(availableTargets);
      setResolutions(
        proposeLegacyResolutions(inspected.labels, availableTargets),
      );
      setStageIndex(1);
      createKey.current = null;
      setRetryFile(null);
      uploadPhase.current = 'MAPPING';
      nextChunk.current = 0;
    } catch (error) {
      setErrorMessage(
        safeLegacyError(
          error,
          'Không thể kiểm tra hoặc tạo phiên nhập dữ liệu cũ. Vui lòng thử lại.',
        ),
      );
      if (
        error instanceof LegacyWorkbookError ||
        error instanceof LegacySalesApiError
      ) {
        createKey.current = null;
        setRetryFile(null);
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function validateArchive() {
    if (!parsed || !importRunId || !isOnline || isBusy) return;
    setStageIndex(2);
    setIsBusy(true);
    setErrorMessage(null);
    try {
      if (uploadPhase.current === 'MAPPING') {
        await api.saveMapping(importRunId, resolutions);
        uploadPhase.current = 'CHUNKS';
      }
      const rows = stagedRows(parsed);
      const totalChunks = Math.ceil(rows.length / 250);
      while (nextChunk.current < totalChunks) {
        const chunkIndex = nextChunk.current;
        setProgress(`Đang gửi gói ${chunkIndex + 1}/${totalChunks}.`);
        const uploaded = await api.uploadChunk({
          importRunId,
          chunkIndex,
          rows: rows.slice(chunkIndex * 250, (chunkIndex + 1) * 250),
          isLastChunk: chunkIndex === totalChunks - 1,
        });
        nextChunk.current = uploaded.nextChunkIndex;
      }
      uploadPhase.current = 'ARCHIVE_VALIDATION';
      setProgress('Đang xác minh ranh giới dữ liệu lưu trữ.');
      const validation = await api.validateImport(importRunId);
      setValidated({
        totalRows: validation.totalRows,
        warningCount: validation.warningCount,
      });
      setStageIndex(3);
    } catch (error) {
      const message = safeLegacyError(
        error,
        'Không thể kiểm tra dữ liệu cũ. Vui lòng thử lại.',
      );
      setErrorMessage(message);
      toast.show({
        kind: 'error',
        title: 'Không thể kiểm tra dữ liệu cũ',
        message,
        actionRoute: `/legacy-sales?importRunId=${importRunId}`,
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function commitArchive() {
    if (!importRunId || !isOnline || isBusy) return;
    commitKey.current ??= crypto.randomUUID();
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const committed = await api.commitImport(importRunId, commitKey.current);
      setResult(committed);
      commitKey.current = null;
      toast.show({
        kind: 'success',
        title: 'Đã lưu dữ liệu cũ',
        message: `Đã lưu ${committed.archiveSales.toLocaleString('vi-VN')} hóa đơn chỉ để tra cứu.`,
        actionRoute: `/legacy-sales?importRunId=${importRunId}`,
      });
    } catch (error) {
      const message = safeLegacyError(
        error,
        'Không thể lưu dữ liệu cũ. Vui lòng thử lại.',
      );
      setErrorMessage(message);
      toast.show({
        kind: 'error',
        title: 'Không thể lưu dữ liệu cũ',
        message,
        actionRoute: `/legacy-sales?importRunId=${importRunId}`,
      });
    } finally {
      setIsBusy(false);
    }
  }

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
            aria-current={index === stageIndex ? 'step' : undefined}
            className={`rounded-lg px-3 py-3 text-sm font-semibold ${index === stageIndex ? 'bg-teal-700 text-white' : index < stageIndex ? 'bg-teal-50 text-teal-900' : 'text-slate-500'}`}
          >
            {stage}
          </li>
        ))}
      </ol>

      {stageIndex === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="font-semibold">
            Chọn đúng workbook dữ liệu cũ được hỗ trợ
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Tệp được đọc trong bộ nhớ trình duyệt, không tải nguyên bản lên máy
            chủ.
          </p>
          <label className="mt-5 inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white has-[:disabled]:opacity-50">
            {isBusy ? 'Đang kiểm tra…' : 'Chọn workbook dữ liệu cũ'}
            <input
              aria-label="Chọn workbook dữ liệu cũ"
              type="file"
              accept=".xlsx"
              disabled={!isOnline || isBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void chooseFile(file);
                event.target.value = '';
              }}
              className="sr-only"
            />
          </label>
          {retryFile && errorMessage ? (
            <button
              type="button"
              disabled={!isOnline || isBusy}
              onClick={() => void chooseFile(retryFile, true)}
              className="mt-3 min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold"
            >
              Thử lại với cùng tệp
            </button>
          ) : null}
        </div>
      ) : null}
      {stageIndex === 1 && parsed ? (
        <LegacyMappingPanel
          labels={parsed.labels}
          targets={targets}
          resolutions={resolutions}
          invoiceCount={parsed.sales.length}
          productCandidateCount={parsed.productCandidates.length}
          customerCandidateCount={parsed.customerCandidates.length}
          openingSuggestionCount={parsed.openingSuggestions.length}
          isBusy={isBusy}
          onChange={setResolutions}
          onContinue={() => void validateArchive()}
        />
      ) : null}
      {stageIndex === 2 ? (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-5">
          <p className="font-semibold text-teal-950">
            {isBusy
              ? 'Đang kiểm tra dữ liệu cũ…'
              : errorMessage
                ? 'Kiểm tra chưa hoàn tất'
                : 'Đã kiểm tra'}
          </p>
          <p className="mt-2 text-sm text-teal-800">{progress}</p>
          {errorMessage ? (
            <>
              <p
                role="alert"
                className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
              >
                {errorMessage}
              </p>
              <button
                type="button"
                disabled={!isOnline || isBusy}
                onClick={() => void validateArchive()}
                className="mt-3 min-h-11 rounded-lg border border-teal-700 px-4 text-sm font-semibold text-teal-900"
              >
                Thử kiểm tra lại
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {stageIndex === 3 && validated ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Xác nhận kho tra cứu riêng</h2>
          <p className="mt-3 text-sm text-slate-700">
            {validated.totalRows.toLocaleString('vi-VN')} dòng đã kiểm tra ·{' '}
            {validated.warningCount.toLocaleString('vi-VN')} cảnh báo. Các ứng
            viên danh mục phải được nhập riêng qua mẫu chuẩn. Gợi ý mở sổ vẫn
            chưa được ghi.
          </p>
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
            Xác nhận này chỉ tạo dữ liệu cũ. Không tạo payment, movement tồn/giá
            vốn, doanh thu, trả hàng hoặc hủy hóa đơn.
          </p>
          {errorMessage ? (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
            >
              {errorMessage}
            </p>
          ) : null}
          {result ? (
            <div className="mt-5 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-bold">
                Đã lưu {result.archiveSales.toLocaleString('vi-VN')} hóa đơn cũ.
              </p>
              <Link
                to={`/legacy-sales?importRunId=${importRunId}`}
                className="mt-3 inline-flex min-h-11 items-center font-semibold text-emerald-900 underline"
              >
                Mở dữ liệu cũ
              </Link>
            </div>
          ) : (
            <button
              type="button"
              disabled={!isOnline || isBusy}
              onClick={() => void commitArchive()}
              className="mt-5 min-h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isBusy ? 'Đang lưu…' : 'Lưu vào dữ liệu cũ'}
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
      {stageIndex === 0 && errorMessage ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
