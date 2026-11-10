import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivateQueryKey, useSession } from '@/features/auth';
import { formatReportMoney } from '@/features/reports';
import { useFinancialCommand } from '@/shared/hooks/use-financial-command';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { ViNumberInput } from '@/shared/ui/forms/ViNumberInput';
import { FinancialOutcomeUnknownError } from '@/shared/api/financial-command';
import { createSupplierDebtApi } from '../api/supplier-debt-api';
import {
  addMoney,
  fromCents,
  minMoney,
  returnLineAmount,
  toCents,
} from '../model/supplier-money';
import { formatDay, invalidateSupplierQueries } from '../model/supplier-ui';

export function PurchaseReturnPage() {
  const { receiptId = '' } = useParams();
  const { session } = useSession();
  const privateKey = usePrivateQueryKey();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const toast = useToast();
  const navigate = useNavigate();
  const run = useFinancialCommand(session?.userId);
  const [api] = useState(createSupplierDebtApi);
  const options = useQuery({
    queryKey: privateKey('purchase-return', receiptId),
    queryFn: () => api.returnOptions(receiptId),
  });
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<
    'CASH' | 'BANK_TRANSFER' | null
  >(null);
  const [busy, setBusy] = useState(false);
  const data = options.data;
  const chosen = (data?.lines ?? [])
    .map((line) => ({ line, quantity: quantities[line.receiptLineId] ?? '' }))
    .filter(({ quantity }) => /^[1-9]\d*$/.test(quantity));
  const overMax = chosen.some(
    ({ line, quantity }) => BigInt(quantity) > BigInt(line.maxQty),
  );
  const total = addMoney(
    ...chosen.map(({ line, quantity }) =>
      returnLineAmount({ ...line, quantity }),
    ),
  );
  const applied = data?.outstandingAmount
    ? minMoney(total, data.outstandingAmount)
    : '0';
  const refund = fromCents(toCents(total) - toCents(applied));
  const needsRefund = toCents(refund) > 0n;
  const valid =
    chosen.length > 0 &&
    !overMax &&
    reason.trim() &&
    (!needsRefund || refundMethod);
  const back = `/more/purchases/${receiptId}`;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const result = await run({
        commandName: 'purchase.return.post',
        entityId: receiptId,
        invoke: (idempotencyKey) =>
          api.postReturn({
            receiptId,
            lines: chosen.map(({ line, quantity }) => ({
              receiptLineId: line.receiptLineId,
              quantity,
            })),
            reason: reason.trim(),
            refundMethod: needsRefund ? refundMethod : null,
            idempotencyKey,
          }),
        parseCachedResponse: api.parseReturn,
      });
      toast.show({
        kind: 'success',
        title: `Đã ghi sổ ${result.returnNumber}`,
      });
      setQuantities({});
      setReason('');
      await invalidateSupplierQueries(queryClient);
      void navigate(back);
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể trả hàng nhập',
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
    <section className="mx-auto max-w-lg space-y-4">
      <Link
        to={back}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800"
      >
        Về phiếu nhập
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Trả hàng nhập
        </h1>
        {data ? (
          <p className="text-sm text-slate-600">
            {data.receiptNumber}
            {data.supplier ? ` · ${data.supplier.name}` : ' · Không có NCC'}
            {data.receivedAt ? ` · ${formatDay(data.receivedAt)}` : ''}
          </p>
        ) : null}
      </div>
      {options.isError ? (
        <p role="alert" className="text-sm text-red-800">
          {options.error instanceof Error
            ? options.error.message
            : 'Không tải được phiếu nhập.'}
        </p>
      ) : !data ? (
        <div
          role="status"
          aria-label="Đang tải phiếu nhập"
          className="h-48 animate-pulse rounded-2xl bg-slate-200"
        />
      ) : data.status !== 'POSTED' ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Chỉ trả hàng từ phiếu nhập đã ghi sổ.
        </p>
      ) : (
        <form
          aria-label="Trả hàng nhập"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          {data.lines.map((line) => (
            <section
              key={line.receiptLineId}
              aria-label={line.productName}
              className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex justify-between gap-3">
                <span className="font-semibold">{line.productName}</span>
                <span className="text-sm tabular-nums text-slate-700">
                  {formatReportMoney(line.unitCost)}/{line.unitName}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ['Đã nhập', line.receivedQty],
                  ['Đang tồn', line.onHandQty],
                  ['Trả tối đa', line.maxQty],
                ].map(([label, value]) => (
                  <p key={label} className="rounded-lg bg-slate-50 p-2">
                    <span className="block text-xs text-slate-600">
                      {label}
                    </span>
                    <span className="text-lg font-bold tabular-nums">
                      {value}
                    </span>
                  </p>
                ))}
              </div>
              <label className="block text-sm font-semibold text-slate-900">
                Số lượng trả
                <ViNumberInput
                  maxFractionDigits={0}
                  value={quantities[line.receiptLineId] ?? ''}
                  onChange={(value) =>
                    setQuantities({
                      ...quantities,
                      [line.receiptLineId]: value,
                    })
                  }
                  disabled={line.maxQty === '0'}
                  className="mt-1 block min-h-12 w-full rounded-lg border border-slate-300 px-3 text-right text-xl font-semibold tabular-nums disabled:bg-slate-100"
                />
              </label>
            </section>
          ))}
          {overMax ? (
            <p role="alert" className="text-sm text-red-800">
              Số trả vượt số được trả tối đa.
            </p>
          ) : null}
          <section
            aria-label="Tiền hàng trả"
            className="rounded-2xl border border-slate-200 bg-white px-4 shadow-sm"
          >
            {[
              ['Tiền hàng trả', total],
              ['Trừ vào nợ NCC', applied === '0' ? '0' : `-${applied}`],
              ['NCC hoàn tiền', refund],
            ].map(([label, value]) => (
              <p
                key={label}
                className="flex min-h-12 items-center justify-between border-b border-slate-100 last:border-0"
              >
                <span>{label}</span>
                <span className="font-semibold tabular-nums">
                  {formatReportMoney(value!)}
                </span>
              </p>
            ))}
          </section>
          {needsRefund ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-slate-900">
                NCC hoàn bằng
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['CASH', 'Tiền mặt'],
                    ['BANK_TRANSFER', 'Chuyển khoản'],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border text-sm font-semibold ${refundMethod === value ? 'border-2 border-teal-700 bg-teal-50' : 'border-slate-300'}`}
                  >
                    <input
                      type="radio"
                      name="refund"
                      checked={refundMethod === value}
                      onChange={() => setRefundMethod(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <label className="block text-sm font-semibold text-slate-900">
            Lý do
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              className="mt-1 block min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal"
            />
          </label>
          <button
            type="submit"
            disabled={!online || busy || !valid}
            className="min-h-12 w-full rounded-xl bg-teal-700 text-base font-bold text-white disabled:opacity-50"
          >
            Ghi sổ trả hàng
          </button>
          {data.returns.length ? (
            <section aria-label="Đã trả" className="space-y-1 text-sm">
              <h2 className="font-semibold text-slate-900">Đã trả</h2>
              {data.returns.map((item) => (
                <p key={item.returnId} className="flex justify-between gap-3">
                  <span>
                    {item.returnNumber} · {formatDay(item.postedAt)}
                  </span>
                  <span className="tabular-nums">
                    {formatReportMoney(item.totalAmount)}
                  </span>
                </p>
              ))}
            </section>
          ) : null}
        </form>
      )}
    </section>
  );
}
