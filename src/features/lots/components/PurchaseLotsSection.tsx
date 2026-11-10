import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivateQueryKey } from '@/features/auth';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { createLotsApi } from '../api/lots-api';
import {
  emptyLot,
  formatDate,
  fromLotRows,
  sumQuantities,
  toLotRows,
  trackingLabel,
  type EditableLot,
} from '../model/lot-ui';
import { LotRowsEditor } from './LotRowsEditor';

/** Lot / expiry entry for tracked products on a purchase receipt. */
export function PurchaseLotsSection({
  receiptId,
  version,
  editable,
}: {
  receiptId: string;
  version: number;
  editable: boolean;
}) {
  const privateKey = usePrivateQueryKey();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const toast = useToast();
  const [api] = useState(createLotsApi);
  const lots = useQuery({
    queryKey: privateKey('receipt-lots', receiptId, version),
    queryFn: () => api.receiptLots(receiptId),
  });
  const [rows, setRows] = useState<Record<string, EditableLot[]>>({});
  const [busy, setBusy] = useState(false);
  const items = lots.data?.items ?? [];
  if (!items.length) return null;
  const prepared = items.map((item) => ({
    item,
    // Edited rows win; otherwise what the receipt already holds.
    rows:
      rows[item.productId] ??
      (item.lots.length ? fromLotRows(item.lots) : [emptyLot()]),
    ready: toLotRows(
      rows[item.productId] ?? fromLotRows(item.lots),
      item.trackingMode,
    ),
  }));
  const valid = prepared.every(
    ({ item, rows: editing, ready }) =>
      ready && sumQuantities(editing) <= BigInt(item.receivedQty),
  );

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await api.setReceiptLots(
        receiptId,
        prepared.map(({ item, ready }) => ({
          productId: item.productId,
          lots: ready ?? [],
        })),
      );
      toast.show({ kind: 'success', title: 'Đã lưu lô và hạn dùng' });
      setRows({});
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey.includes('receipt-lots'),
      });
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể lưu lô',
        message: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Lô và hạn dùng"
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4"
    >
      <h2 className="text-lg font-bold">Lô và hạn dùng</h2>
      {prepared.map(({ item, rows: editing }) => {
        const entered = sumQuantities(editing);
        const complete = entered === BigInt(item.receivedQty);
        return (
          <div key={item.productId} className="space-y-2">
            <p className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {item.productName}
                <span className="ml-2 text-xs font-semibold text-teal-800">
                  {trackingLabel[item.trackingMode]}
                </span>
              </span>
              <span
                className={`text-sm tabular-nums ${complete ? 'text-emerald-800' : 'text-amber-800'}`}
              >
                {entered.toString()}/{item.receivedQty} {item.unitName}
              </span>
            </p>
            {editable ? (
              <LotRowsEditor
                rows={editing}
                mode={item.trackingMode}
                label={item.productName}
                disabled={busy}
                onChange={(next) =>
                  setRows({ ...rows, [item.productId]: next })
                }
              />
            ) : (
              <ul className="text-sm">
                {item.lots.map((lot) => (
                  <li key={`${lot.lotNumber}-${lot.expiryDate}`}>
                    {lot.lotNumber ?? 'Không số lô'} · HSD{' '}
                    {formatDate(lot.expiryDate)} · {lot.quantity}{' '}
                    {item.unitName}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {editable ? (
        <button
          type="button"
          onClick={() => void save()}
          disabled={!online || busy || !valid}
          className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Lưu lô
        </button>
      ) : null}
    </section>
  );
}
