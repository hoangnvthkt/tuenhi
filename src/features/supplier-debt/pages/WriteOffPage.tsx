import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivateQueryKey, useSession } from '@/features/auth';
import { ProductSelect } from '@/features/catalog';
import { formatReportMoney } from '@/features/reports';
import { useFinancialCommand } from '@/shared/hooks/use-financial-command';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { ViNumberInput } from '@/shared/ui/forms/ViNumberInput';
import { FinancialOutcomeUnknownError } from '@/shared/api/financial-command';
import {
  createSupplierDebtApi,
  type WriteOffReason,
} from '../api/supplier-debt-api';
import { addMoney, writeOffValue } from '../model/supplier-money';
import { formatDay, invalidateSupplierQueries } from '../model/supplier-ui';

const reasons: [WriteOffReason, string][] = [
  ['EXPIRED', 'Hết hạn dùng'],
  ['DAMAGED', 'Hỏng, vỡ'],
  ['LOST', 'Mất'],
  ['OTHER', 'Khác'],
];
const reasonLabel = Object.fromEntries(reasons) as Record<
  WriteOffReason,
  string
>;

export function WriteOffPage() {
  const { session } = useSession();
  const privateKey = usePrivateQueryKey();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const toast = useToast();
  const run = useFinancialCommand(session?.userId);
  const [api] = useState(createSupplierDebtApi);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  // Tracked products: '' = earliest expiry first (FEFO), otherwise one lot.
  const [lotChoice, setLotChoice] = useState<Record<string, string>>({});
  const [reasonCode, setReasonCode] = useState<WriteOffReason>('EXPIRED');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // One form = one write-off: a retry after a lost response reuses its request.
  const [entityId, setEntityId] = useState(() => crypto.randomUUID());
  const products = useQuery({
    queryKey: privateKey('write-offs', 'products', productIds),
    queryFn: () => api.writeOffProducts(productIds),
    enabled: productIds.length > 0,
  });
  const history = useQuery({
    queryKey: privateKey('write-offs', 'history'),
    queryFn: () => api.writeOffs(),
  });
  const items = (products.data ?? []).map((product) => {
    const quantity = quantities[product.productId] ?? '';
    const valid = /^[1-9]\d*$/.test(quantity);
    const lotId = lotChoice[product.productId] ?? '';
    const chosenLot = product.lots?.find((lot) => lot.lotId === lotId);
    const over =
      valid &&
      BigInt(quantity) >
        BigInt(chosenLot ? chosenLot.quantity : product.onHandQty);
    const value =
      valid &&
      !over &&
      product.avgUnitCostExact !== null &&
      product.inventoryValue !== null
        ? writeOffValue({
            avgUnitCostExact: product.avgUnitCostExact,
            inventoryValue: product.inventoryValue,
            onHandQty: product.onHandQty,
            quantity,
          })
        : null;
    return { product, quantity, valid, over, value, lotId };
  });
  const lines = items.filter((item) => item.valid);
  const total = items.some((item) => item.value !== null)
    ? addMoney(...items.map((item) => item.value ?? '0'))
    : null;
  const ready =
    lines.length > 0 &&
    lines.length === items.length &&
    !items.some((item) => item.over) &&
    (reasonCode !== 'OTHER' || note.trim());

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const result = await run({
        commandName: 'inventory.writeoff.post',
        entityId,
        invoke: (idempotencyKey) =>
          api.postWriteOff({
            lines: lines.map((item) => ({
              productId: item.product.productId,
              quantity: item.quantity,
              ...(item.lotId ? { lotId: item.lotId } : {}),
            })),
            reasonCode,
            note: note.trim(),
            idempotencyKey,
          }),
        parseCachedResponse: api.parseWriteOff,
      });
      toast.show({
        kind: 'success',
        title: `Đã ghi sổ ${result.writeOffNumber}`,
        message: result.totalValue
          ? `Giá trị hủy ${formatReportMoney(result.totalValue)}`
          : undefined,
      });
      setEntityId(crypto.randomUUID());
      setProductIds([]);
      setQuantities({});
      setLotChoice({});
      setNote('');
      await invalidateSupplierQueries(queryClient);
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể xuất hủy',
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
    <section className="mx-auto max-w-2xl space-y-4">
      <Link
        to="/more"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800"
      >
        Về Nhiều hơn
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">
        Xuất hủy
      </h1>
      <form
        aria-label="Xuất hủy"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <ProductSelect
            label="Sản phẩm"
            value=""
            excludedIds={new Set(productIds)}
            onChange={(id) => {
              if (id && !productIds.includes(id))
                setProductIds([...productIds, id]);
            }}
          />
        </div>
        {products.isPending && productIds.length ? (
          <div
            role="status"
            aria-label="Đang tải tồn kho"
            className="h-24 animate-pulse rounded-2xl bg-slate-200"
          />
        ) : null}
        {items.map((item) => (
          <section
            key={item.product.productId}
            aria-label={item.product.name}
            className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-semibold">{item.product.name}</span>
              <span className="text-sm tabular-nums text-slate-600">
                Tồn {item.product.onHandQty} {item.product.unitName}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-semibold text-slate-900">
                Số lượng hủy
                <ViNumberInput
                  maxFractionDigits={0}
                  value={item.quantity}
                  onChange={(value) =>
                    setQuantities({
                      ...quantities,
                      [item.product.productId]: value,
                    })
                  }
                  className="mt-1 block min-h-12 w-full rounded-lg border border-slate-300 px-3 text-right text-xl font-semibold tabular-nums"
                />
              </label>
              {item.product.avgUnitCost !== null ? (
                <p className="text-sm font-semibold text-slate-900">
                  Giá vốn BQ
                  <span className="mt-1 flex min-h-12 items-center justify-end text-lg font-normal tabular-nums">
                    {formatReportMoney(item.product.avgUnitCost)}
                  </span>
                </p>
              ) : null}
            </div>
            {item.product.lots?.length ? (
              <label className="block text-sm font-semibold text-slate-900">
                Lô
                <select
                  value={item.lotId}
                  onChange={(event) =>
                    setLotChoice({
                      ...lotChoice,
                      [item.product.productId]: event.target.value,
                    })
                  }
                  className="mt-1 block min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal"
                >
                  <option value="">Hết hạn trước</option>
                  {item.product.lots.map((lot) => (
                    <option key={lot.lotId} value={lot.lotId}>
                      {(lot.lotNumber ?? 'Không số lô') +
                        ` · HSD ${lot.expiryDate.split('-').reverse().join('/')} · còn ${lot.quantity}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {item.over ? (
              <p role="alert" className="text-sm text-red-800">
                Vượt tồn kho.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() =>
                setProductIds(
                  productIds.filter((id) => id !== item.product.productId),
                )
              }
              className="min-h-11 text-sm font-semibold text-slate-600"
            >
              Bỏ dòng
            </button>
          </section>
        ))}
        {items.length ? (
          <>
            <label className="block text-sm font-semibold text-slate-900">
              Lý do
              <select
                value={reasonCode}
                onChange={(event) =>
                  setReasonCode(event.target.value as WriteOffReason)
                }
                className="mt-1 block min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal"
              >
                {reasons.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-900">
              Ghi chú{reasonCode === 'OTHER' ? ' (bắt buộc)' : ''}
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                className="mt-1 block min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal"
              />
            </label>
            {total !== null ? (
              <p className="flex min-h-12 items-center justify-between rounded-2xl border border-slate-200 bg-white px-4">
                <span className="font-semibold">Giá trị hủy</span>
                <span className="text-xl font-bold tabular-nums text-red-700">
                  {formatReportMoney(total)}
                </span>
              </p>
            ) : null}
            <button
              type="submit"
              disabled={!online || busy || !ready}
              className="min-h-12 w-full rounded-xl bg-red-700 text-base font-bold text-white disabled:opacity-50"
            >
              Ghi sổ xuất hủy
            </button>
          </>
        ) : null}
      </form>

      <section aria-label="Phiếu xuất hủy gần đây" className="space-y-2">
        <h2 className="text-base font-semibold text-slate-950">
          Phiếu xuất hủy gần đây
        </h2>
        {history.isPending ? (
          <p role="status" className="text-sm text-slate-600">
            Đang tải…
          </p>
        ) : history.isError ? (
          <p role="alert" className="text-sm text-red-800">
            Không tải được phiếu xuất hủy.
          </p>
        ) : history.data.items.length === 0 ? (
          <p className="text-sm text-slate-600">Chưa có phiếu xuất hủy.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {history.data.items.map((item) => (
              <li
                key={item.id}
                className="flex justify-between gap-3 p-3 text-sm"
              >
                <span>
                  <span className="font-semibold">{item.writeOffNumber}</span> ·{' '}
                  {formatDay(item.postedAt)} · {reasonLabel[item.reasonCode]}
                  <span className="block text-xs text-slate-600">
                    {item.lines
                      .map((line) => `${line.productName} ×${line.quantity}`)
                      .join(', ')}
                  </span>
                </span>
                {item.totalValue ? (
                  <span className="font-semibold tabular-nums">
                    {formatReportMoney(item.totalValue)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
