import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { useState } from 'react';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { NumericField } from '@/shared/ui/forms/NumericField';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { validateCanonicalNumber } from '@/shared/lib/numeric/canonical-number';
import { createSalesApi } from '../sales/sales-api';

const money = (value: string) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(value));

export function ReturnDetailPage() {
  const { returnId } = useParams();
  const online = useOnlineStatus();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [api] = useState(createSalesApi);
  const query = useQuery({
    queryKey: ['sale-return', returnId],
    queryFn: () => api.getReturn(returnId!),
    enabled: Boolean(returnId),
  });
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'BANK_TRANSFER'>(
    'CASH',
  );
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);
  const document = query.data;

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['sale-return', returnId],
    });
    await queryClient.invalidateQueries({ queryKey: ['sale-returns'] });
    await queryClient.invalidateQueries({
      queryKey: ['invoice', document?.saleId],
    });
  };
  const acceptedValue = (id: string, fallback: string) =>
    accepted[id] ?? fallback;

  async function complete() {
    if (!document || !online || busy) return;
    const lines = document.lines.map((line) => ({
      saleReturnLineId: line.id,
      acceptedQty: acceptedValue(line.id, line.requestedQty),
    }));
    const invalid = lines.some((line) => {
      const original = document.lines.find(
        (item) => item.id === line.saleReturnLineId,
      )!;
      const valid = validateCanonicalNumber(line.acceptedQty, {
        kind: 'quantity',
        precision: 18,
      });
      return (
        !valid.ok || Number(line.acceptedQty) > Number(original.requestedQty)
      );
    });
    if (invalid || !lines.some((line) => Number(line.acceptedQty) > 0)) {
      toast.show({
        kind: 'error',
        title: 'Số lượng kiểm nhận chưa hợp lệ',
        message:
          'Số lượng phải từ 0 đến số lượng yêu cầu; cần chấp nhận ít nhất một dòng.',
      });
      return;
    }
    if (
      !window.confirm(
        'Xác nhận hoàn tiền và nhập lại tồn kho cho số lượng đã kiểm nhận?',
      )
    )
      return;
    setBusy(true);
    try {
      await api.completeReturn({
        returnId: document.id,
        expectedVersion: document.version,
        lines,
        refundMethod,
        idempotencyKey: crypto.randomUUID(),
      });
      toast.show({ kind: 'success', title: 'Đã hoàn tất trả hàng' });
      await refresh();
    } catch (reason) {
      toast.show({
        kind: 'error',
        title: 'Không thể hoàn tất trả hàng',
        message: reason instanceof Error ? reason.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!document || !online || busy || cancelReason.trim().length === 0)
      return;
    setBusy(true);
    try {
      await api.cancelReturn(
        document.id,
        document.version,
        cancelReason.trim(),
        crypto.randomUUID(),
      );
      toast.show({ kind: 'success', title: 'Đã hủy yêu cầu trả hàng' });
      await refresh();
    } catch (reason) {
      toast.show({
        kind: 'error',
        title: 'Không thể hủy yêu cầu trả hàng',
        message: reason instanceof Error ? reason.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  if (query.isLoading)
    return <main className="p-6">Đang tải yêu cầu trả hàng…</main>;
  if (!document)
    return <main className="p-6">Không tìm thấy yêu cầu trả hàng.</main>;
  const pending = document.status === 'REQUESTED';

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div>
        <Link to="/returns" className="text-sm font-semibold text-teal-800">
          ← Trả hàng
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {document.returnNumber ?? 'Yêu cầu trả hàng'} · {document.saleNumber}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{document.reason}</p>
      </div>
      {!online ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          Đang ngoại tuyến. Không thể kiểm nhận hoặc hủy phiếu.
        </p>
      ) : null}
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        {document.lines.map((line) => (
          <div
            key={line.id}
            className="grid gap-3 border-b border-slate-100 pb-4 last:border-0 sm:grid-cols-[1fr_180px]"
          >
            <div>
              <strong>{line.productName}</strong>
              <p className="mt-1 text-sm text-slate-600">
                Yêu cầu {line.requestedQty} {line.unitName} · Đã trả trước đó{' '}
                {line.returnedQtyBefore}
              </p>
              {document.status === 'COMPLETED' ? (
                <p className="mt-1 text-sm text-teal-800">
                  Chấp nhận {line.acceptedQty ?? '0'} · Hoàn{' '}
                  {money(line.refundAmount)}
                </p>
              ) : null}
            </div>
            {pending && document.canComplete ? (
              <NumericField
                label="Số lượng chấp nhận"
                kind="quantity"
                precision={18}
                value={acceptedValue(line.id, line.requestedQty)}
                onChange={(value) =>
                  setAccepted((current) => ({ ...current, [line.id]: value }))
                }
                disabled={!online || busy}
              />
            ) : null}
          </div>
        ))}
        {document.status === 'COMPLETED' ? (
          <p className="text-lg font-bold">
            Đã hoàn {money(document.refundTotal)}
          </p>
        ) : null}
      </section>
      {pending ? (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          {document.canComplete ? (
            <>
              <label className="block text-sm font-medium">
                Phương thức hoàn tiền
                <select
                  value={refundMethod}
                  onChange={(event) =>
                    setRefundMethod(
                      event.target.value as 'CASH' | 'BANK_TRANSFER',
                    )
                  }
                  disabled={!online || busy}
                  className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3"
                >
                  <option value="CASH">Tiền mặt</option>
                  <option value="BANK_TRANSFER">Chuyển khoản</option>
                </select>
              </label>
              <button
                type="button"
                disabled={!online || busy}
                onClick={() => void complete()}
                className="min-h-11 rounded-lg bg-teal-700 px-4 font-semibold text-white disabled:opacity-50"
              >
                Hoàn tất trả hàng
              </button>
            </>
          ) : null}
          <label className="block text-sm font-medium">
            Lý do hủy yêu cầu
            <textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              maxLength={500}
              disabled={!online || busy}
              className="mt-2 min-h-20 w-full rounded-lg border border-slate-300 p-3"
            />
          </label>
          <button
            type="button"
            disabled={!online || busy || cancelReason.trim().length === 0}
            onClick={() => void cancel()}
            className="min-h-11 rounded-lg border border-red-700 px-4 font-semibold text-red-800 disabled:opacity-50"
          >
            Hủy yêu cầu
          </button>
        </section>
      ) : null}
      {document.status === 'CANCELLED' && document.cancelReason ? (
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
          Lý do hủy: {document.cancelReason}
        </p>
      ) : null}
    </main>
  );
}
