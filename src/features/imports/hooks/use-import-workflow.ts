import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useSession } from '@/features/auth';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import {
  createImportApi,
  ImportApiError,
  type ImportApi,
  type ImportCommitResult,
} from '../api/import-api';
import type { ImportMode, ImportTarget } from '../model/contracts';
import {
  proposeMapping,
  validateMapping,
  type ColumnMapping,
} from '../model/mapping';
import { CURRENT_TEMPLATE_VERSION } from '../model/template-contracts';
import type { ImportStage } from '../model/import-workflow';
import {
  allowedImportTargets,
  safeImportErrorMessage,
} from '../model/import-workflow-helpers';
import {
  inspectWorkbook,
  WorkbookInspectionError,
  type InspectedWorkbook,
} from '../parser/workbook-parser';
import { useImportValidation } from './use-import-validation';

export function useImportWorkflow({
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
  const [searchParams] = useSearchParams();
  const targets = useMemo(
    () => allowedImportTargets(session?.permissions ?? []),
    [session?.permissions],
  );
  const canImportLegacy =
    session?.roleTemplate === 'OWNER' &&
    session.permissions.includes('legacy.sale.import');
  const [legacyMode, setLegacyMode] = useState(false);
  const requestedTarget = searchParams.get('target');
  const initialTarget = targets.includes(requestedTarget as ImportTarget)
    ? (requestedTarget as ImportTarget)
    : (targets[0] ?? 'CATEGORIES');
  const [target, setTarget] = useState<ImportTarget>(initialTarget);
  const version = CURRENT_TEMPLATE_VERSION[target];
  const isOwner = session?.roleTemplate === 'OWNER';
  const canImportPrice = isOwner;
  const [mode, setMode] = useState<ImportMode>('CREATE_ONLY');
  const [stage, setStage] = useState<ImportStage>('Chọn tệp');
  const [inspection, setInspection] = useState<InspectedWorkbook | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [importRunId, setImportRunId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(
    null,
  );
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const createKey = useRef<string | null>(null);
  const commitKey = useRef<string | null>(null);

  const mappingResult = useMemo(
    () => validateMapping(mapping, target, version),
    [mapping, target, version],
  );
  const mappingIssues = mappingResult.ok ? [] : mappingResult.issues;

  const validation = useImportValidation({
    api,
    importRunId,
    inspection,
    isBusy,
    isOnline,
    mapping,
    mappingIssues,
    setErrorMessage,
    setIsBusy,
    setStage,
    target,
    version,
  });

  function resetWorkflow() {
    setStage('Chọn tệp');
    setInspection(null);
    setMapping([]);
    setImportRunId(null);
    setErrorMessage(null);
    validation.resetValidation();
    setCommitResult(null);
    setRetryFile(null);
    createKey.current = null;
    commitKey.current = null;
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
      setErrorMessage(safeImportErrorMessage(error));
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
        title:
          target === 'OPENING_BALANCES'
            ? 'Đã tạo phiếu mở sổ nháp'
            : 'Đã nhập dữ liệu thành công',
        message:
          target === 'OPENING_BALANCES'
            ? `Đã đưa ${result.totalRows.toLocaleString('vi-VN')} dòng vào phiếu nháp; tồn kho chưa thay đổi.`
            : `Đã nhập ${result.totalRows.toLocaleString('vi-VN')} dòng dữ liệu.`,
        dedupeKey: `import-committed:${importRunId}`,
        actionRoute: `/imports/${importRunId}`,
      });
    } catch (error) {
      const message = safeImportErrorMessage(error);
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
          await validation.loadValidationResult(importRunId);
          setStage('Kiểm tra dữ liệu');
        } catch {
          // Giữ nguyên màn hình xác nhận để người dùng chủ động mở lịch sử.
        }
      }
    } finally {
      setIsBusy(false);
    }
  }

  return {
    canImportLegacy,
    canImportPrice,
    commit,
    commitResult,
    downloadErrors: validation.downloadErrors,
    errorMessage,
    importRunId,
    inspection,
    isBusy,
    isOnline,
    isOwner,
    legacyMode,
    mapping,
    mappingIssues,
    mode,
    prepareValidation: validation.prepareValidation,
    progressLabel: validation.progressLabel,
    resetWorkflow,
    retryFile,
    sendPreparedRows: validation.sendPreparedRows,
    setLegacyMode,
    setMapping,
    setMode,
    setStage,
    setTarget,
    stage,
    startFile,
    target,
    targets,
    validationComplete: validation.validationComplete,
    validationRows: validation.validationRows,
    validationSummary: validation.validationSummary,
    version,
  };
}
