import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { NumericField } from '@/shared/ui/forms/NumericField';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { validateCanonicalNumber } from '@/shared/lib/numeric/canonical-number';
import { createSalesApi, type Invoice } from '@/features/sales';
import { createReturnsApi } from '../api/returns-api';
import type { ReturnLookup } from '../api/returns-schemas';

type RequestedLine = { originalSaleLineId: string; requestedQty: string };

function toLookup(invoice: Invoice): ReturnLookup {
  return {
    saleId: invoice.sale.id,
    saleNumber: invoice.sale.saleNumber,
    completedAt: invoice.sale.completedAt,
    customerName: invoice.sale.customerName,
    lines: invoice.lines.map((line) => ({
      id: line.id,
      productId: '',
      productName: line.productName,
      sku: line.sku,
      unitName: line.unitName,
      soldQty: line.quantity,
      returnedQty: line.returnedQty,
      returnableQty: line.returnableQty,
      netAmount: line.netAmount,
    })),
  };
}

export function ReturnCreatePage() {
  const { saleId } = useParams();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const toast = useToast();
  const [salesApi] = useState(createSalesApi);
  const [returnsApi] = useState(createReturnsApi);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [lookup, setLookup] = useState<ReturnLookup | null>(null);
  const [lines, setLines] = useState<RequestedLine[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!saleId) return;
    let active = true;
    salesApi
      .invoice(saleId)
      .then((invoice) => {
        if (!active) return;
        const value = toLookup(invoice);
        setLookup(value);
        setLines(
          value.lines.map((line) => ({
            originalSaleLineId: line.id,
            requestedQty: line.returnableQty,
          })),
        );
      })
      .catch(
        () => active && setError('Không thể đọc hóa đơn để tạo yêu cầu trả.'),
      );
    return () => {
      active = false;
    };
  }, [saleId, salesApi]);

  const selected = useMemo(
    () =>
      lines.filter((line) => {
        const value = validateCanonicalNumber(line.requestedQty, {
          kind: 'quantity',
          precision: 18,
          positive: true,
        });
        return value.ok && Number(line.requestedQty) > 0;
      }),
    [lines],
  );

  async function lookupInvoice() {
    if (!online || busy) return;
    setBusy(true);
    setError(null);
    try {
      const value = await returnsApi.lookupInvoice(invoiceNumber);
      setLookup(value);
      setLines(
        value.lines.map((line) => ({
          originalSaleLineId: line.id,
          requestedQty: line.returnableQty,
        })),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Không tìm thấy hóa đơn.',
      );
    } finally {
      setBusy(false);
    }
  }

  function updateLine(originalSaleLineId: string, requestedQty: string) {
    setLines((current) =>
      current.map((line) =>
        line.originalSaleLineId === originalSaleLineId
          ? { ...line, requestedQty }
          : line,
      ),
    );
  }

  async function submit() {
    if (!online || busy || !lookup) return;
    if (reason.trim().length === 0) {
      setError('Vui lòng nhập lý do trả hàng.');
      return;
    }
    const invalid = lines.some((line) => {
      const available = lookup.lines.find(
        (item) => item.id === line.originalSaleLineId,
      );
      return (
        line.requestedQty !== '' &&
        (!validateCanonicalNumber(line.requestedQty, {
          kind: 'quantity',
          precision: 18,
          positive: true,
        }).ok ||
          Number(line.requestedQty) > Number(available?.returnableQty ?? 0))
      );
    });
    if (invalid || selected.length === 0) {
      setError(
        'Số lượng trả phải hợp lệ, lớn hơn 0 và không vượt số còn được trả.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await returnsApi.create({
        saleId: lookup.saleId,
        reason: reason.trim(),
        lines: selected,
        idempotencyKey: crypto.randomUUID(),
      });
      toast.show({ kind: 'success', title: 'Đã gửi yêu cầu trả hàng' });
      navigate(`/returns/${result.returnId}`);
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : 'Không thể tạo yêu cầu trả hàng.';
      setError(message);
      toast.show({
        kind: 'error',
        title: 'Không thể tạo yêu cầu trả hàng',
        message,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div>
        <Link to="/returns" className="text-sm font-semibold text-teal-800">
          ← Trả hàng
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Tạo yêu cầu trả hàng</h1>
        <p className="mt-1 text-sm text-slate-600">
          Tra cứu bằng toàn bộ mã hóa đơn HD hoặc tạo từ hóa đơn của bạn.
        </p>
      </div>
      {!online ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          Đang ngoại tuyến. Hệ thống khóa thao tác và không tự gửi lại khi có
          mạng.
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {!saleId ? (
        <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-4">
          <input
            value={invoiceNumber}
            onChange={(event) =>
              setInvoiceNumber(event.target.value.toUpperCase())
            }
            placeholder="Ví dụ: HD000001"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3"
          />
          <button
            type="button"
            disabled={!online || busy}
            onClick={() => void lookupInvoice()}
            className="min-h-11 rounded-lg border border-teal-700 px-4 font-semibold text-teal-800 disabled:opacity-50"
          >
            Tra cứu
          </button>
        </div>
      ) : null}
      {lookup ? (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <h2 className="font-bold">{lookup.saleNumber}</h2>
            <p className="text-sm text-slate-600">
              {lookup.customerName ?? 'Khách lẻ'}
            </p>
          </div>
          {lookup.lines.map((line) => {
            const state = lines.find(
              (item) => item.originalSaleLineId === line.id,
            );
            return (
              <div
                key={line.id}
                className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_180px]"
              >
                <p>
                  <strong>{line.productName}</strong>
                  <span className="mt-1 block text-sm text-slate-600">
                    {line.sku} · Đã bán {line.soldQty} {line.unitName} · Còn trả{' '}
                    {line.returnableQty}
                  </span>
                </p>
                <NumericField
                  label="Số lượng yêu cầu trả"
                  kind="quantity"
                  precision={18}
                  value={state?.requestedQty ?? ''}
                  onChange={(value) => updateLine(line.id, value)}
                  disabled={!online || busy || Number(line.returnableQty) <= 0}
                />
              </div>
            );
          })}
          <label className="block text-sm font-medium text-slate-800">
            Lý do trả hàng
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 p-3"
            />
          </label>
          <button
            type="button"
            disabled={!online || busy}
            onClick={() => void submit()}
            className="min-h-11 rounded-lg bg-teal-700 px-4 font-semibold text-white disabled:opacity-50"
          >
            Gửi yêu cầu trả hàng
          </button>
        </section>
      ) : null}
    </main>
  );
}
