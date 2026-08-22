import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useToast } from '../../components/feedback/use-toast';
import { useOnlineStatus } from '../../app/use-online-status';
import { useSession } from '../auth/use-session';
import { CommitStage } from './CommitStage';
import { FileStage } from './FileStage';
import {
  createImportApi,
  ImportApiError,
  type ImportApi,
  type ImportCommitResult,
  type TransportImportRow,
} from './import-api';
import type { ImportMode, ImportTarget } from './contracts';
import { buildErrorWorkbook, downloadErrorWorkbook } from './error-workbook';
import {
  buildSanitizedRows,
  mappingForServer,
  proposeMapping,
  validateMapping,
  type ColumnMapping,
} from './mapping';
import { CURRENT_TEMPLATE_VERSION } from './template-contracts';
import {
  inspectWorkbook,
  WorkbookInspectionError,
  type InspectedWorkbook,
} from './workbook-parser';
import {
  validateClientRows,
  type ClientImportError,
  type ValidatedClientRow,
} from './client-validation';
import { MappingStage } from './MappingStage';
import { ValidationStage, type ValidationDisplayRow } from './ValidationStage';

const stages = [
  'Chọn tệp',
  'Ghép cột',
  'Kiểm tra dữ liệu',
  'Xác nhận nhập',
] as const;
type Stage = (typeof stages)[number];

function allowedTargets(permissions: readonly string[]) {
  const targets: ImportTarget[] = [];
  if (permissions.includes('catalog.basic.manage')) {
    targets.push('CATEGORIES', 'PRODUCTS');
  }
  if (permissions.includes('supplier.manage')) targets.push('SUPPLIERS');
  if (permissions.includes('customer.manage')) targets.push('CUSTOMERS');
  return targets;
}

function safeErrorMessage(error: unknown) {
  if (
    error instanceof WorkbookInspectionError ||
    error instanceof ImportApiError
  ) {
    return error.message;
  }
  return 'Không thể hoàn tất thao tác. Vui lòng kiểm tra kết nối và thử lại.';
}

function transportRows(rows: ValidatedClientRow[]): TransportImportRow[] {
  return rows.map((row) => {
    const values: TransportImportRow['values'] = {};
    for (const [field, value] of Object.entries(row.values)) {
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean'
      ) {
        values[field] = value;
      } else if (value !== undefined) {
        values[field] = String(value);
      }
    }
    return { rowNumber: row.rowNumber, values };
  });
}

function clientDisplayRows(
  sourceRows: Array<{ rowNumber: number; values: Record<string, unknown> }>,
  validationRows: ValidatedClientRow[],
  errors: ClientImportError[],
): ValidationDisplayRow[] {
  const errorsByRow = new Map<number, ClientImportError[]>();
  for (const error of errors) {
    errorsByRow.set(error.rowNumber, [
      ...(errorsByRow.get(error.rowNumber) ?? []),
      error,
    ]);
  }
  const statusByRow = new Map(
    validationRows.map((row) => [row.rowNumber, row.status]),
  );
  return sourceRows.map((row) => ({
    rowNumber: row.rowNumber,
    values: row.values,
    status: statusByRow.get(row.rowNumber) ?? 'INVALID',
    errors: errorsByRow.get(row.rowNumber) ?? [],
  }));
}

export function ImportPage({
  api: apiProp,
  inspect = inspectWorkbook,
  online,
}: {
  api?: ImportApi;
  inspect?: typeof inspectWorkbook;
  online?: boolean;
}) {
  const [api] = useState(() => apiProp ?? createImportApi());
  const detectedOnline = useOnlineStatus();
  const isOnline = online ?? detectedOnline;
  const { session } = useSession();
  const toast = useToast();
  const targets = useMemo(
    () => allowedTargets(session?.permissions ?? []),
    [session?.permissions],
  );
  const [target, setTarget] = useState<ImportTarget>(
    targets[0] ?? 'CATEGORIES',
  );
  const version = CURRENT_TEMPLATE_VERSION[target];
  const isOwner = session?.roleTemplate === 'OWNER';
  const canImportPrice = isOwner;
  const [mode, setMode] = useState<ImportMode>('CREATE_ONLY');
  const [stage, setStage] = useState<Stage>('Chọn tệp');
  const [inspection, setInspection] = useState<InspectedWorkbook | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [importRunId, setImportRunId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [validationRows, setValidationRows] = useState<ValidationDisplayRow[]>(
    [],
  );
  const [validationSummary, setValidationSummary] = useState({
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
  });
  const [validationComplete, setValidationComplete] = useState(false);
  const [exportRows, setExportRows] = useState<ValidatedClientRow[]>([]);
  const [exportErrors, setExportErrors] = useState<ClientImportError[]>([]);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(
    null,
  );
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const createKey = useRef<string | null>(null);
  const commitKey = useRef<string | null>(null);
  const preparedRows = useRef<TransportImportRow[]>([]);
  const nextChunk = useRef(0);
  const validationPhase = useRef<'MAPPING' | 'CHUNKS' | 'RESULTS'>('MAPPING');

  const mappingResult = useMemo(
    () => validateMapping(mapping, target, version),
    [mapping, target, version],
  );
  const mappingIssues = mappingResult.ok ? [] : mappingResult.issues;

  function resetWorkflow() {
    setStage('Chọn tệp');
    setInspection(null);
    setMapping([]);
    setImportRunId(null);
    setErrorMessage(null);
    setProgressLabel(null);
    setValidationRows([]);
    setValidationSummary({ totalRows: 0, validRows: 0, invalidRows: 0 });
    setValidationComplete(false);
    setExportRows([]);
    setExportErrors([]);
    setCommitResult(null);
    setRetryFile(null);
    createKey.current = null;
    commitKey.current = null;
    preparedRows.current = [];
    nextChunk.current = 0;
    validationPhase.current = 'MAPPING';
  }

  async function startFile(file: File, reuseKey: boolean) {
    if (!isOnline || isBusy) return;
    if (!reuseKey) createKey.current = crypto.randomUUID();
    setRetryFile(file);
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const inspected = await inspect(file, { target, version });
      let proposed = proposeMapping(inspected.headers, target, version);
      if (!canImportPrice && target === 'PRODUCTS') {
        proposed = proposed.map((item) =>
          item.targetField === 'salePrice'
            ? { ...item, targetField: 'IGNORED', ignoreConfirmed: true }
            : item,
        );
      }
      const run = await api.createRun({
        target,
        templateVersion: version,
        fileName: inspected.fileName,
        fileSha256: inspected.fileSha256,
        mode,
        idempotencyKey: createKey.current ?? crypto.randomUUID(),
      });
      setInspection(inspected);
      setMapping(proposed);
      setImportRunId(run.importRunId);
      setRetryFile(null);
      createKey.current = null;
      setStage('Ghép cột');
    } catch (error) {
      setErrorMessage(safeErrorMessage(error));
      if (
        error instanceof WorkbookInspectionError ||
        error instanceof ImportApiError
      ) {
        setRetryFile(null);
        createKey.current = null;
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function loadValidationResult(runId: string) {
    const items: ValidationDisplayRow[] = [];
    let page = await api.getValidation({
      importRunId: runId,
      limit: 100,
    });
    items.push(...page.items);
    while (page.nextCursorRowNumber !== null) {
      page = await api.getValidation({
        importRunId: runId,
        cursorRowNumber: page.nextCursorRowNumber,
        limit: 100,
      });
      items.push(...page.items);
    }
    const summary = page.summary;
    setValidationRows(items);
    setValidationSummary({
      totalRows: summary.totalRows,
      validRows: summary.validRows,
      invalidRows: summary.invalidRows,
    });
    setExportRows(
      items.map((row) => ({
        rowNumber: row.rowNumber,
        values: row.values,
        status: row.status,
      })),
    );
    setExportErrors(
      items.flatMap((row) =>
        row.errors.map((error) => ({ ...error, rowNumber: row.rowNumber })),
      ),
    );
    setValidationComplete(true);
    setProgressLabel(null);
  }

  async function sendPreparedRows() {
    if (!importRunId || !inspection || !isOnline || isBusy) return;
    setStage('Kiểm tra dữ liệu');
    setIsBusy(true);
    setErrorMessage(null);
    setValidationComplete(false);
    try {
      if (validationPhase.current === 'MAPPING') {
        await api.saveMapping(importRunId, mappingForServer(mapping));
        validationPhase.current = 'CHUNKS';
      }
      if (validationPhase.current === 'CHUNKS') {
        const chunks = Math.ceil(preparedRows.current.length / 250);
        while (nextChunk.current < chunks) {
          const chunkIndex = nextChunk.current;
          setProgressLabel(`Đang gửi gói ${chunkIndex + 1}/${chunks}.`);
          const progress = await api.validateChunk({
            importRunId,
            chunkIndex,
            rows: preparedRows.current.slice(
              chunkIndex * 250,
              (chunkIndex + 1) * 250,
            ),
            isLastChunk: chunkIndex === chunks - 1,
          });
          nextChunk.current = progress.nextChunkIndex;
          setValidationSummary({
            totalRows: progress.totalRows,
            validRows: progress.validRows,
            invalidRows: progress.invalidRows,
          });
        }
        validationPhase.current = 'RESULTS';
      }
      setProgressLabel('Đang tải kết quả kiểm tra.');
      await loadValidationResult(importRunId);
    } catch (error) {
      setErrorMessage(safeErrorMessage(error));
      toast.show({
        kind: 'error',
        title: 'Không thể kiểm tra tệp Excel',
        message: safeErrorMessage(error),
        dedupeKey: `import-validate:${importRunId}`,
        actionRoute: `/imports/${importRunId}`,
        ...(error instanceof ImportApiError
          ? { correlationId: error.correlationId }
          : {}),
      });
    } finally {
      setIsBusy(false);
    }
  }

  function prepareValidation() {
    if (!inspection || !importRunId || mappingIssues.length > 0) return;
    setErrorMessage(null);
    const sanitized = buildSanitizedRows(
      inspection.rows,
      mapping,
      target,
      version,
    );
    if (sanitized.length === 0) {
      setErrorMessage('Tệp Excel chưa có dòng dữ liệu để nhập.');
      return;
    }
    const client = validateClientRows(sanitized, target, version);
    const display = clientDisplayRows(sanitized, client.rows, client.errors);
    setExportRows(
      display.map((row) => ({
        rowNumber: row.rowNumber,
        values: row.values,
        status: row.status,
      })),
    );
    setExportErrors(client.errors);
    setValidationRows(display);
    setValidationSummary({
      totalRows: client.rows.length,
      validRows: client.rows.filter((row) => row.status === 'VALID').length,
      invalidRows: client.rows.filter((row) => row.status === 'INVALID').length,
    });
    if (client.errors.length > 0) {
      setValidationComplete(true);
      setStage('Kiểm tra dữ liệu');
      return;
    }
    preparedRows.current = transportRows(client.rows);
    nextChunk.current = 0;
    validationPhase.current = 'MAPPING';
    void sendPreparedRows();
  }

  async function downloadErrors() {
    try {
      const blob = await buildErrorWorkbook({
        target,
        version,
        rows: exportRows,
        errors: exportErrors,
      });
      downloadErrorWorkbook(
        blob,
        `loi-nhap-${target.toLocaleLowerCase('en-US')}.xlsx`,
      );
    } catch {
      toast.show({
        kind: 'error',
        title: 'Không thể tạo tệp lỗi',
        message: 'Vui lòng thử tải lại tệp lỗi.',
      });
    }
  }

  async function commit() {
    if (!importRunId || !isOnline || isBusy) return;
    commitKey.current ??= crypto.randomUUID();
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const result = await api.commit(importRunId, commitKey.current);
      commitKey.current = null;
      setCommitResult(result);
      toast.show({
        kind: 'success',
        title: 'Đã nhập dữ liệu thành công',
        message: `Đã nhập ${result.totalRows.toLocaleString('vi-VN')} dòng dữ liệu.`,
        dedupeKey: `import-committed:${importRunId}`,
        actionRoute: `/imports/${importRunId}`,
      });
    } catch (error) {
      const message = safeErrorMessage(error);
      setErrorMessage(message);
      toast.show({
        kind: 'error',
        title: 'Không thể xác nhận nhập dữ liệu',
        message,
        dedupeKey: `import-commit:${importRunId}`,
        actionRoute: `/imports/${importRunId}`,
        ...(error instanceof ImportApiError
          ? { correlationId: error.correlationId }
          : {}),
      });
      if (
        error instanceof ImportApiError &&
        error.code === 'IMPORT_VALIDATION_FAILED'
      ) {
        try {
          await loadValidationResult(importRunId);
          setStage('Kiểm tra dữ liệu');
        } catch {
          // Giữ nguyên màn hình xác nhận để người dùng chủ động mở lịch sử.
        }
      }
    } finally {
      setIsBusy(false);
    }
  }

  if (targets.length === 0) {
    return (
      <section>
        <h1 className="text-2xl font-bold text-slate-950">Nhập dữ liệu</h1>
        <p
          role="alert"
          className="mt-4 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700"
        >
          Bạn chưa có quyền nhập nhóm hàng, sản phẩm, nhà cung cấp hoặc khách
          hàng.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Nhập dữ liệu từ Excel
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Kiểm tra tệp trong trình duyệt, xác nhận lỗi và nhập nguyên tử.
          </p>
        </div>
        <Link
          to="/imports/history"
          className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold hover:bg-slate-50"
        >
          Lịch sử nhập
        </Link>
      </div>

      <ol
        aria-label="Tiến trình nhập dữ liệu"
        className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-4"
      >
        {stages.map((item) => {
          const current = item === stage;
          const reached = stages.indexOf(item) <= stages.indexOf(stage);
          return (
            <li
              key={item}
              aria-current={current ? 'step' : undefined}
              className={`rounded-lg px-3 py-3 text-sm font-semibold ${current ? 'bg-teal-700 text-white' : reached ? 'bg-teal-50 text-teal-900' : 'text-slate-500'}`}
            >
              {item}
            </li>
          );
        })}
      </ol>

      {stage === 'Chọn tệp' ? (
        <FileStage
          targets={targets}
          target={target}
          version={version}
          mode={mode}
          isOwner={isOwner}
          isOnline={isOnline}
          isBusy={isBusy}
          errorMessage={errorMessage}
          onTargetChange={(next) => {
            resetWorkflow();
            setTarget(next);
          }}
          onModeChange={setMode}
          onFile={(file) => void startFile(file, false)}
          onRetry={
            retryFile ? () => void startFile(retryFile, true) : undefined
          }
        />
      ) : null}
      {stage === 'Ghép cột' && inspection ? (
        <MappingStage
          target={target}
          version={version}
          fileName={inspection.fileName}
          rowCount={inspection.rows.length}
          exactTemplate={inspection.exactTemplate}
          mapping={mapping}
          issues={mappingIssues}
          isOnline={isOnline}
          isBusy={isBusy}
          canImportPrice={canImportPrice}
          onMappingChange={setMapping}
          onContinue={prepareValidation}
          onBack={resetWorkflow}
        />
      ) : null}
      {stage === 'Kiểm tra dữ liệu' ? (
        <ValidationStage
          target={target}
          rows={validationRows}
          {...validationSummary}
          isBusy={isBusy}
          isOnline={isOnline}
          progressLabel={progressLabel}
          isComplete={validationComplete}
          errorMessage={errorMessage}
          onDownloadErrors={() => void downloadErrors()}
          onContinue={() => setStage('Xác nhận nhập')}
          onRetry={() => void sendPreparedRows()}
          onBack={resetWorkflow}
        />
      ) : null}
      {stage === 'Xác nhận nhập' && inspection && importRunId ? (
        <CommitStage
          target={target}
          mode={mode}
          fileName={inspection.fileName}
          totalRows={validationSummary.totalRows}
          importRunId={importRunId}
          isOnline={isOnline}
          isBusy={isBusy}
          result={commitResult}
          errorMessage={errorMessage}
          onCommit={() => void commit()}
        />
      ) : null}
    </section>
  );
}
