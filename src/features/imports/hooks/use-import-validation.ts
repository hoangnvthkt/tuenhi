import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useToast } from '@/shared/ui/feedback/use-toast';
import {
  ImportApiError,
  type ImportApi,
  type TransportImportRow,
} from '../api/import-api';
import {
  buildErrorWorkbook,
  downloadErrorWorkbook,
} from '../export/error-workbook';
import {
  validateClientRows,
  type ClientImportError,
  type ValidatedClientRow,
} from '../model/client-validation';
import type { ImportTarget } from '../model/contracts';
import {
  safeImportErrorMessage,
  toTransportRows,
  toValidationDisplayRows,
} from '../model/import-workflow-helpers';
import type { ImportStage } from '../model/import-workflow';
import {
  buildSanitizedRows,
  mappingForServer,
  type ColumnMapping,
  type MappingIssue,
} from '../model/mapping';
import type { ValidationDisplayRow } from '../model/validation-display';
import type { InspectedWorkbook } from '../parser/workbook-parser';

type ValidationSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
};

const EMPTY_SUMMARY: ValidationSummary = {
  totalRows: 0,
  validRows: 0,
  invalidRows: 0,
};

export function useImportValidation({
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
}: {
  api: ImportApi;
  importRunId: string | null;
  inspection: InspectedWorkbook | null;
  isBusy: boolean;
  isOnline: boolean;
  mapping: ColumnMapping[];
  mappingIssues: MappingIssue[];
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setStage: Dispatch<SetStateAction<ImportStage>>;
  target: ImportTarget;
  version: number;
}) {
  const toast = useToast();
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [validationRows, setValidationRows] = useState<ValidationDisplayRow[]>(
    [],
  );
  const [validationSummary, setValidationSummary] =
    useState<ValidationSummary>(EMPTY_SUMMARY);
  const [validationComplete, setValidationComplete] = useState(false);
  const [exportRows, setExportRows] = useState<ValidatedClientRow[]>([]);
  const [exportErrors, setExportErrors] = useState<ClientImportError[]>([]);
  const preparedRows = useRef<TransportImportRow[]>([]);
  const nextChunk = useRef(0);
  const validationPhase = useRef<'MAPPING' | 'CHUNKS' | 'RESULTS'>('MAPPING');

  function resetValidation() {
    setProgressLabel(null);
    setValidationRows([]);
    setValidationSummary(EMPTY_SUMMARY);
    setValidationComplete(false);
    setExportRows([]);
    setExportErrors([]);
    preparedRows.current = [];
    nextChunk.current = 0;
    validationPhase.current = 'MAPPING';
  }

  async function loadValidationResult(runId: string) {
    const items: ValidationDisplayRow[] = [];
    let page = await api.getValidation({ importRunId: runId, limit: 100 });
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
      const message = safeImportErrorMessage(error);
      setErrorMessage(message);
      toast.show({
        kind: 'error',
        title: 'Không thể kiểm tra tệp Excel',
        message,
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
    const display = toValidationDisplayRows(
      sanitized,
      client.rows,
      client.errors,
    );
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
    preparedRows.current = toTransportRows(client.rows);
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

  return {
    downloadErrors,
    loadValidationResult,
    prepareValidation,
    progressLabel,
    resetValidation,
    sendPreparedRows,
    validationComplete,
    validationRows,
    validationSummary,
  };
}
