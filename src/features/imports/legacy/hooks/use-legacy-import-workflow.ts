import { useRef, useState } from 'react';
import { useToast } from '@/shared/ui/feedback/use-toast';
import {
  createLegacySalesApi,
  LegacySalesApiError,
  type LegacyArchiveCommit,
  type LegacySalesApi,
} from '@/features/legacy-sales';
import {
  proposeLegacyResolutions,
  type LegacyResolutions,
  type LegacyTargets,
} from '../model/legacy-mapping';
import {
  buildLegacyStagedRows,
  loadLegacyMappingTargets,
} from '../model/legacy-import-helpers';
import {
  parseLegacyQ237Workbook,
  type LegacyParseResult,
  LegacyWorkbookError,
} from '../parser/legacy-q237-parser';

function safeLegacyError(error: unknown, fallback: string) {
  return error instanceof LegacySalesApiError ||
    error instanceof LegacyWorkbookError
    ? error.message
    : fallback;
}

export function useLegacyImportWorkflow({
  api: apiProp,
  isOnline,
  loadTargets = loadLegacyMappingTargets,
  parse = parseLegacyQ237Workbook,
}: {
  api?: LegacySalesApi;
  isOnline: boolean;
  loadTargets?: () => Promise<LegacyTargets>;
  parse?: typeof parseLegacyQ237Workbook;
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
      const rows = buildLegacyStagedRows(parsed);
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

  return {
    chooseFile,
    commitArchive,
    errorMessage,
    importRunId,
    isBusy,
    parsed,
    progress,
    resolutions,
    result,
    retryFile,
    setResolutions,
    stageIndex,
    targets,
    validateArchive,
    validated,
  };
}
