import { Link } from 'react-router';
import type { LegacySalesApi } from '@/features/legacy-sales';
import type { ImportApi } from '../api/import-api';
import { CommitStage } from '../components/CommitStage';
import { FileStage } from '../components/FileStage';
import { MappingStage } from '../components/MappingStage';
import { ValidationStage } from '../components/ValidationStage';
import { useImportWorkflow } from '../hooks/use-import-workflow';
import { LegacyImportFlow } from '../legacy/components/LegacyImportFlow';
import { IMPORT_STAGES as stages } from '../model/import-workflow';
import { inspectWorkbook } from '../parser/workbook-parser';

export function ImportPage({
  api: apiProp,
  inspect = inspectWorkbook,
  online,
  legacyApi,
}: {
  api?: ImportApi;
  inspect?: typeof inspectWorkbook;
  online?: boolean;
  legacyApi?: LegacySalesApi;
}) {
  const {
    canImportLegacy,
    canImportPrice,
    commit,
    commitResult,
    downloadErrors,
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
    prepareValidation,
    progressLabel,
    resetWorkflow,
    retryFile,
    sendPreparedRows,
    setLegacyMode,
    setMapping,
    setMode,
    setStage,
    setTarget,
    stage,
    startFile,
    target,
    targets,
    validationComplete,
    validationRows,
    validationSummary,
    version,
  } = useImportWorkflow({ api: apiProp, inspect, online });

  if (legacyMode && canImportLegacy) {
    return (
      <LegacyImportFlow
        isOnline={isOnline}
        api={legacyApi}
        onBack={() => setLegacyMode(false)}
      />
    );
  }

  if (targets.length === 0) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-950">Nhập dữ liệu</h1>
        {canImportLegacy ? (
          <button
            type="button"
            onClick={() => setLegacyMode(true)}
            className="min-h-11 rounded-lg bg-amber-900 px-4 text-sm font-semibold text-white"
          >
            Nhập dữ liệu bán hàng cũ
          </button>
        ) : (
          <p
            role="alert"
            className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700"
          >
            Bạn chưa có quyền nhập nhóm hàng, sản phẩm, nhà cung cấp, khách hàng
            hoặc dữ liệu bán hàng cũ.
          </p>
        )}
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

      {canImportLegacy && stage === 'Chọn tệp' ? (
        <button
          type="button"
          onClick={() => setLegacyMode(true)}
          className="min-h-11 rounded-lg border border-amber-800 bg-amber-50 px-4 text-sm font-semibold text-amber-950"
        >
          Nhập dữ liệu bán hàng cũ
        </button>
      ) : null}

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
            if (next === 'OPENING_BALANCES') setMode('CREATE_ONLY');
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
