import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivateQueryKey, useSession } from '@/features/auth';
import { useFinancialCommand } from '@/shared/hooks/use-financial-command';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { FinancialOutcomeUnknownError } from '@/shared/api/financial-command';
import { createLotsApi, type TrackingMode } from '../api/lots-api';
import {
  emptyLot,
  formatDate,
  sumQuantities,
  toLotRows,
  trackingLabel,
  type EditableLot,
} from '../model/lot-ui';
import { LotRowsEditor } from './LotRowsEditor';

const statusTone = {
  EXPIRED: 'text-red-700',
  EXPIRING: 'text-amber-800',
  OK: 'text-emerald-800',
} as const;

/** Tracking mode, lots in stock and assigning older stock for one product. */
export function ProductTrackingCard({
  productId,
  unitName,
}: {
  productId: string;
  unitName: string;
}) {
  const { session } = useSession();
  const privateKey = usePrivateQueryKey();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const toast = useToast();
  const run = useFinancialCommand(session?.userId);
  const [api] = useState(createLotsApi);
  const can = (code: string) => session?.permissions.includes(code) ?? false;
  const features = useQuery({
    queryKey: privateKey('inventory-features'),
    queryFn: () => api.features(),
  });
  const lots = useQuery({
    queryKey: privateKey('product-lots', productId),
    queryFn: () => api.list('ALL', productId),
    enabled: can('inventory.read'),
  });
  const [rows, setRows] = useState<EditableLot[]>([emptyLot()]);
  const [busy, setBusy] = useState(false);
  const trackingMode: TrackingMode = lots.data?.trackingMode ?? 'NONE';
  if (
    !lots.data ||
    (!features.data?.lotTrackingEnabled && trackingMode === 'NONE')
  )
    return null;
  const unassigned = lots.data.unassignedQty ?? '0';
  const canAssign =
    can('inventory.adjustment.post') && /^[1-9]/.test(unassigned);
  const ready = toLotRows(rows, trackingMode);
  const overAssign = canAssign && sumQuantities(rows) > BigInt(unassigned);

  async function refresh() {
    await queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey.includes('product-lots') ||
        query.queryKey.includes('inventory-features') ||
        query.queryKey.includes('lot-list'),
    });
  }
  async function setMode(mode: TrackingMode) {
    if (busy || mode === trackingMode) return;
    setBusy(true);
    try {
      await api.setTracking(productId, mode);
      toast.show({
        kind: 'success',
        title: `Theo dõi: ${trackingLabel[mode]}`,
      });
      await refresh();
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể đổi chế độ theo dõi',
        message: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }
  async function assign() {
    if (!ready || !ready.length || overAssign || busy) return;
    setBusy(true);
    try {
      await run({
        commandName: 'lots.assign',
        entityId: productId,
        invoke: (idempotencyKey) =>
          api.assign({ productId, lots: ready, idempotencyKey }),
        parseCachedResponse: api.parseAssign,
      });
      toast.show({ kind: 'success', title: 'Đã gán lô' });
      setRows([emptyLot()]);
      await refresh();
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể gán lô',
        message: error instanceof Error ? error.message : undefined,
        requestId:
          error instanceof FinancialOutcomeUnknownError
            ? error.requestId
            : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Theo dõi hạn dùng"
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
    >
      <h2 className="text-lg font-bold">Theo dõi hạn dùng</h2>
      <div
        role="group"
        aria-label="Chế độ theo dõi"
        className="grid grid-cols-3 gap-2"
      >
        {(['NONE', 'EXPIRY', 'LOT'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={trackingMode === mode}
            disabled={!online || busy || !can('catalog.basic.manage')}
            onClick={() => void setMode(mode)}
            className={`min-h-12 rounded-lg text-sm font-semibold disabled:opacity-60 ${trackingMode === mode ? 'border-2 border-teal-700 bg-teal-50 text-teal-900' : 'border border-slate-300 text-slate-700'}`}
          >
            {trackingLabel[mode]}
          </button>
        ))}
      </div>
      {trackingMode !== 'NONE' ? (
        <>
          {lots.data.items.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {lots.data.items.map((lot) => (
                <li
                  key={lot.lotId}
                  className="flex min-h-12 items-center justify-between gap-3 py-1"
                >
                  <span>
                    {lot.lotNumber ?? 'Không số lô'} · HSD{' '}
                    {formatDate(lot.expiryDate)}
                    <span
                      className={`block text-xs font-semibold ${statusTone[lot.status]}`}
                    >
                      {lot.daysLeft < 0
                        ? `Hết hạn ${-lot.daysLeft} ngày`
                        : `Còn ${lot.daysLeft} ngày`}
                    </span>
                  </span>
                  <span className="whitespace-nowrap font-semibold tabular-nums">
                    {lot.quantity} {unitName}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="flex min-h-11 items-center justify-between rounded-lg bg-slate-50 px-3 text-sm">
            <span>Chưa có lô</span>
            <span className="font-semibold tabular-nums">
              {unassigned} {unitName}
            </span>
          </p>
          {canAssign ? (
            <form
              aria-label="Gán lô đầu kỳ"
              onSubmit={(event) => {
                event.preventDefault();
                void assign();
              }}
              className="space-y-2 border-t border-slate-100 pt-3"
            >
              <h3 className="text-sm font-semibold">Gán lô đầu kỳ</h3>
              <LotRowsEditor
                rows={rows}
                mode={trackingMode}
                label="Gán"
                disabled={busy}
                onChange={setRows}
              />
              {overAssign ? (
                <p role="alert" className="text-sm text-red-800">
                  Vượt số chưa có lô.
                </p>
              ) : null}
              <button
                type="submit"
                disabled={!online || busy || !ready?.length || overAssign}
                className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                Gán lô
              </button>
            </form>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
