import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivateQueryKey } from '@/features/auth';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { ViNumberInput } from '@/shared/ui/forms/ViNumberInput';
import { createLotsApi } from '../api/lots-api';

/** Store-wide switches for optional inventory features (off by default). */
export function InventoryFeaturesCard() {
  const privateKey = usePrivateQueryKey();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const toast = useToast();
  const [api] = useState(createLotsApi);
  const features = useQuery({
    queryKey: privateKey('inventory-features'),
    queryFn: () => api.features(),
  });
  // Only what the person changed; everything else reads from the server.
  const [draft, setDraft] = useState<{ enabled?: boolean; days?: string }>({});
  const data = features.data;
  const enabled = draft.enabled ?? data?.lotTrackingEnabled ?? false;
  const days = draft.days ?? String(data?.expiryWarningDays ?? 90);
  const setEnabled = (value: boolean) => setDraft({ ...draft, enabled: value });
  const setDays = (value: string) => setDraft({ ...draft, days: value });
  const [busy, setBusy] = useState(false);
  const validDays =
    /^\d+$/.test(days) && Number(days) >= 1 && Number(days) <= 730;
  const dirty =
    data &&
    (enabled !== data.lotTrackingEnabled ||
      days !== String(data.expiryWarningDays));

  async function save() {
    if (!data || busy || !validDays) return;
    setBusy(true);
    try {
      await api.setFeatures({
        expectedVersion: data.version,
        lotTrackingEnabled: enabled,
        expiryWarningDays: Number(days),
      });
      toast.show({ kind: 'success', title: 'Đã lưu cấu hình hàng hóa' });
      setDraft({});
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey.includes('inventory-features'),
      });
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể lưu',
        message: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Hàng hóa"
      className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
    >
      <h2 className="text-lg font-semibold">Hàng hóa</h2>
      {features.isPending ? (
        <div
          role="status"
          aria-label="Đang tải cấu hình hàng hóa"
          className="h-24 animate-pulse rounded-xl bg-slate-200"
        />
      ) : features.isError || !data ? (
        <p role="alert" className="text-sm text-red-800">
          Không tải được cấu hình hàng hóa.
        </p>
      ) : (
        <>
          <label className="flex min-h-14 items-center justify-between gap-4">
            <span>
              <span className="block font-semibold">
                Quản lý hạn sử dụng và lô
              </span>
              <span className="text-sm text-slate-600">
                {data.trackedProductCount} sản phẩm đang theo dõi
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="h-6 w-6 accent-teal-700"
            />
          </label>
          <label className="flex min-h-14 items-center justify-between gap-4 border-t border-slate-100 pt-2">
            <span className="font-semibold">Cảnh báo sắp hết hạn trước</span>
            <span className="flex items-center gap-2">
              <ViNumberInput
                maxFractionDigits={0}
                value={days}
                onChange={setDays}
                disabled={!enabled}
                className="min-h-11 w-24 rounded-lg border border-slate-300 px-3 text-right tabular-nums disabled:bg-slate-100"
              />
              <span className="text-sm text-slate-600">ngày</span>
            </span>
          </label>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!online || busy || !dirty || !validDays}
            className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Lưu cấu hình hàng hóa
          </button>
        </>
      )}
    </section>
  );
}
