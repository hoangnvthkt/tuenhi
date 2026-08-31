import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { isPendingFinancialCommandStorageKey } from '@/shared/api/financial-command';
import {
  FINANCIAL_COMMAND_RECONCILE_EVENT,
  listPendingFinancialCommandRecoveries,
  notifyFinancialCommandMarkersChanged,
  reconcilePendingFinancialCommands,
  type PendingFinancialCommandRecovery,
} from '@/shared/api/financial-command-recovery';
import {
  createFinancialOutcomeApi,
  type FinancialOutcomeApi,
} from '@/shared/api/financial-outcome-api';
import { refreshOperationalData } from '@/shared/api/refresh-operational-data';
import { useToast } from './use-toast';

export function PendingFinancialCommandRecoveryBanner({
  userId,
  online,
  outcomeApi,
}: {
  userId: string;
  online: boolean;
  outcomeApi?: FinancialOutcomeApi;
}) {
  const [defaultOutcomeApi] = useState(
    () => outcomeApi ?? createFinancialOutcomeApi(),
  );
  const api = outcomeApi ?? defaultOutcomeApi;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [recoveries, setRecoveries] = useState<
    PendingFinancialCommandRecovery[]
  >(() => listPendingFinancialCommandRecoveries(userId));
  const inFlight = useRef<Promise<void> | null>(null);

  const reconcile = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    if (!online) {
      setRecoveries(listPendingFinancialCommandRecoveries(userId));
      return Promise.resolve();
    }
    setRecoveries((current) =>
      current.map((recovery) => ({ ...recovery, status: 'CHECKING' })),
    );
    const promise = reconcilePendingFinancialCommands({
      userId,
      lookup: api.lookup,
    })
      .then(async (results) => {
        const resolved = results.filter(
          (result) => result.status === 'RESOLVED',
        );
        setRecoveries(results.filter((result) => result.status !== 'RESOLVED'));
        notifyFinancialCommandMarkersChanged();
        for (const result of resolved) {
          toast.show({
            kind: 'success',
            title: 'Đã xác định kết quả giao dịch',
            message: `${result.label} đã được máy chủ ghi nhận.`,
            requestId: result.requestId,
            correlationId: result.correlationId,
            actionRoute: result.actionRoute,
            actionLabel: 'Mở chứng từ',
            dedupeKey: `financial-recovery:${result.requestId}`,
          });
        }
        if (resolved.length > 0) await refreshOperationalData(queryClient);
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = promise;
    return promise;
  }, [api.lookup, online, queryClient, toast, userId]);

  useEffect(() => {
    const initialReconcile = window.setTimeout(() => void reconcile(), 0);
    return () => window.clearTimeout(initialReconcile);
  }, [reconcile]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!isPendingFinancialCommandStorageKey(event.key)) return;
      if (online) void reconcile();
      else setRecoveries(listPendingFinancialCommandRecoveries(userId));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [online, reconcile, userId]);

  useEffect(() => {
    const onReconcileRequest = () => void reconcile();
    window.addEventListener(
      FINANCIAL_COMMAND_RECONCILE_EVENT,
      onReconcileRequest,
    );
    return () =>
      window.removeEventListener(
        FINANCIAL_COMMAND_RECONCILE_EVENT,
        onReconcileRequest,
      );
  }, [reconcile]);

  if (recoveries.length === 0) return null;
  const checking = recoveries.some((item) => item.status === 'CHECKING');

  return (
    <section className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">Có giao dịch cần đối soát</h2>
            <p className="text-sm">
              Không tạo yêu cầu mới trước khi xác định kết quả trên máy chủ.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void reconcile()}
            disabled={!online || checking}
            className="min-h-11 rounded-lg border border-amber-700 px-3 text-sm font-semibold disabled:opacity-50"
          >
            {checking ? 'Đang đối soát…' : 'Đối soát lại'}
          </button>
        </div>
        <ul className="mt-3 space-y-2">
          {recoveries.map((recovery) => (
            <li
              key={recovery.requestId}
              className="rounded-lg border border-amber-200 bg-white/70 p-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{recovery.label}</p>
                  <p className="text-xs text-amber-900">
                    {new Date(recovery.createdAt).toLocaleString('vi-VN')}
                  </p>
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer font-medium">
                      Mã yêu cầu
                    </summary>
                    <code className="block break-all">
                      {recovery.requestId}
                    </code>
                  </details>
                  {recovery.correlationId ? (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer font-medium">
                        Mã tra cứu
                      </summary>
                      <code className="block break-all">
                        {recovery.correlationId}
                      </code>
                    </details>
                  ) : null}
                  {recovery.status === 'ERROR' ? (
                    <p className="mt-1 text-xs text-red-800">
                      Chưa thể kiểm tra kết quả. Mã yêu cầu vẫn được giữ lại.
                    </p>
                  ) : null}
                </div>
                <Link
                  to={recovery.actionRoute}
                  className="inline-flex min-h-11 items-center font-semibold text-teal-800"
                >
                  Mở chứng từ
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
