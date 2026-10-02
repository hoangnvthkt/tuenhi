import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { refreshOperationalData } from '@/shared/api/refresh-operational-data';
import {
  FinancialOutcomeUnknownError,
  findPendingFinancialCommand,
  getFinancialCorrelationId,
  isPendingFinancialCommandStorageKey,
  type PendingFinancialCommand,
} from '@/shared/api/financial-command';
import {
  FINANCIAL_COMMAND_MARKERS_CHANGED_EVENT,
  requestFinancialCommandReconciliation,
} from '@/shared/api/financial-command-recovery';
import { useFinancialCommand } from '@/shared/hooks/use-financial-command';
import { formatViNumber } from '@/shared/lib/numeric/canonical-number';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { createSalesApi } from '../api/sales-api';
import { downloadInvoicePdf } from '../model/sales-pdf';
import { getSupabaseClient } from '@/shared/supabase/client';
import { useSession } from '@/features/auth';
import { PaymentProofLink } from '@/features/payments';
const money = (v: string) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(v));
function findSalePendingCommand(userId?: string, saleId?: string) {
  if (!userId || !saleId) return undefined;
  try {
    return (
      findPendingFinancialCommand({
        userId,
        commandName: 'sale.complete',
        entityId: saleId,
      }) ??
      findPendingFinancialCommand({
        userId,
        commandName: 'sale.cancel',
        entityId: saleId,
      })
    );
  } catch {
    return undefined;
  }
}

export function SaleDetailPage() {
  const { saleId } = useParams();
  const online = useOnlineStatus();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const runFinancialCommand = useFinancialCommand(session?.userId);
  const [api] = useState(createSalesApi);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<
    PendingFinancialCommand | undefined
  >(() => findSalePendingCommand(session?.userId, saleId));
  const query = useQuery({
    queryKey: ['invoice', saleId],
    queryFn: () => api.invoice(saleId!),
    enabled: Boolean(saleId),
  });
  const invoice = query.data;
  const canViewCustomer =
    session?.permissions.some(
      (permission) =>
        permission === 'customer.read' || permission === 'customer.manage',
    ) ?? false;
  const canViewProduct = session?.permissions.includes('catalog.read') ?? false;
  const relationshipQuery = useQuery({
    queryKey: ['sale-relationship-detail', saleId],
    queryFn: () => api.detail(saleId!),
    enabled: Boolean(saleId) && (canViewCustomer || canViewProduct),
    retry: false,
  });

  useEffect(() => {
    const refreshPendingCommand = () =>
      setPendingCommand(findSalePendingCommand(session?.userId, saleId));
    const initialRefresh = window.setTimeout(refreshPendingCommand, 0);
    const onStorage = (event: StorageEvent) => {
      if (isPendingFinancialCommandStorageKey(event.key)) {
        refreshPendingCommand();
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(
      FINANCIAL_COMMAND_MARKERS_CHANGED_EVENT,
      refreshPendingCommand,
    );
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(
        FINANCIAL_COMMAND_MARKERS_CHANGED_EVENT,
        refreshPendingCommand,
      );
    };
  }, [saleId, session?.userId]);

  if (query.isLoading) return <main className="p-6">Đang tải hóa đơn…</main>;
  if (!invoice) return <main className="p-6">Không tìm thấy hóa đơn.</main>;
  const logoUrl = invoice.store.logoPath
    ? getSupabaseClient()
        .storage.from('store-branding')
        .getPublicUrl(invoice.store.logoPath).data.publicUrl
    : null;
  // Owner is the only role permitted to cancel. The server remains the
  // authority for every other eligibility rule when the command runs.
  const canCancel =
    session?.roleTemplate === 'OWNER' && invoice.sale.status === 'COMPLETED';
  async function cancelSale() {
    if (!saleId || !online || busy || cancelReason.trim().length === 0) return;
    if (
      !window.confirm(
        'Xác nhận hủy hóa đơn? Tồn kho và thanh toán sẽ được đảo.',
      )
    )
      return;
    setBusy(true);
    try {
      const detail = relationshipQuery.data ?? (await api.detail(saleId));
      await runFinancialCommand({
        commandName: 'sale.cancel',
        entityId: saleId,
        invoke: (idempotencyKey) =>
          api.cancelSale(
            saleId,
            detail.version,
            cancelReason.trim(),
            idempotencyKey,
          ),
        parseCachedResponse: api.parseCancelResponse,
      });
      toast.show({ kind: 'success', title: 'Đã hủy hóa đơn' });
      await refreshOperationalData(queryClient);
    } catch (reason) {
      toast.show({
        kind: 'error',
        title: 'Không thể hủy hóa đơn',
        message: reason instanceof Error ? reason.message : undefined,
        requestId:
          reason instanceof FinancialOutcomeUnknownError
            ? reason.requestId
            : undefined,
        correlationId: getFinancialCorrelationId(reason),
      });
    } finally {
      setBusy(false);
    }
  }

  async function createPdf() {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      await downloadInvoicePdf(invoice!);
    } catch {
      toast.show({ kind: 'error', title: 'Không thể tạo PDF' });
    } finally {
      setPdfBusy(false);
    }
  }
  const relationshipLines = new Map(
    relationshipQuery.data?.lines.map((line) => [line.id, line.productId]) ??
      [],
  );
  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{invoice.sale.saleNumber}</h1>
          <p className="text-sm text-slate-600">
            Hoàn tất{' '}
            {new Date(invoice.sale.completedAt).toLocaleString('vi-VN')}
          </p>
        </div>
        <Link to="/sales" className="text-sm font-medium text-teal-800">
          Danh sách hóa đơn
        </Link>
      </div>
      <article
        id="invoice-print"
        className="rounded-xl border border-slate-200 bg-white p-5"
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Logo cửa hàng"
            className="mx-auto mb-2 max-h-16 max-w-32 object-contain"
          />
        ) : null}
        <h2 className="text-center text-xl font-bold">
          {invoice.store.displayName}
        </h2>
        {invoice.store.address ? (
          <p className="mt-1 text-center text-sm">{invoice.store.address}</p>
        ) : null}
        <p className="mt-4 text-center font-semibold">HÓA ĐƠN BÁN HÀNG</p>
        {invoice.sale.status !== 'COMPLETED' ? (
          <p className="mt-1 text-center text-sm font-bold text-red-700">
            {invoice.sale.status === 'CANCELLED'
              ? 'ĐÃ HỦY'
              : invoice.sale.status === 'RETURNED'
                ? 'ĐÃ TRẢ HẾT'
                : 'ĐÃ TRẢ MỘT PHẦN'}
          </p>
        ) : null}
        <p className="text-center text-sm">
          {invoice.sale.saleNumber} · {invoice.sale.channelName}
        </p>
        <p className="mt-3 text-sm">
          Khách hàng:{' '}
          {canViewCustomer &&
          relationshipQuery.data?.customerId &&
          invoice.sale.customerName ? (
            <Link
              to={`/more/customers/${relationshipQuery.data.customerId}`}
              className="font-semibold text-teal-800 hover:underline"
            >
              {invoice.sale.customerName}
            </Link>
          ) : (
            (invoice.sale.customerName ?? 'Khách lẻ')
          )}
        </p>
        <div className="mt-4 space-y-3">
          {invoice.lines.map((line) => (
            <div key={line.id} className="border-b border-slate-100 pb-3">
              <div className="flex justify-between gap-3">
                {canViewProduct && relationshipLines.get(line.id) ? (
                  <Link
                    to={`/products/${relationshipLines.get(line.id)}`}
                    className="font-medium text-teal-800 hover:underline"
                  >
                    {line.productName}
                  </Link>
                ) : (
                  <span className="font-medium">{line.productName}</span>
                )}
                <span>{money(line.netAmount)}</span>
              </div>
              <p className="text-sm text-slate-600">
                {formatViNumber(line.quantity)} {line.unitName} ×{' '}
                {money(line.unitSalePrice)}
              </p>
              {Number(line.lineDiscountAmount) +
                Number(line.allocatedOrderDiscount) >
              0 ? (
                <p className="text-xs text-slate-500">
                  Giảm giá:{' '}
                  {money(
                    String(
                      Number(line.lineDiscountAmount) +
                        Number(line.allocatedOrderDiscount),
                    ),
                  )}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1">
          <div className="flex justify-between">
            <span>Tiền hàng</span>
            <span>{money(invoice.totals.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Giảm giá</span>
            <span>
              -
              {money(
                String(
                  Number(invoice.totals.lineDiscountTotal) +
                    Number(invoice.totals.orderDiscountTotal),
                ),
              )}
            </span>
          </div>
          <div className="flex justify-between text-lg font-bold">
            <span>Thanh toán</span>
            <span>{money(invoice.totals.netTotal)}</span>
          </div>
          <p className="pt-2 text-sm">
            Phương thức:{' '}
            {invoice.sale.paymentMethod === 'CASH'
              ? 'Tiền mặt'
              : 'Chuyển khoản'}
          </p>
          {invoice.sale.paymentMethod === 'BANK_TRANSFER' ? (
            <PaymentProofLink objectPath={invoice.sale.transferProofPath} />
          ) : null}
        </div>
        {invoice.store.invoiceFooter ? (
          <p className="mt-5 text-center text-sm text-slate-600">
            {invoice.store.invoiceFooter}
          </p>
        ) : null}
      </article>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-11 rounded-lg border border-slate-300 font-medium"
        >
          In nhiệt
        </button>
        <button
          type="button"
          onClick={() => void createPdf()}
          disabled={pdfBusy}
          className="min-h-11 rounded-lg bg-teal-700 font-semibold text-white"
        >
          {pdfBusy ? 'Đang tạo PDF…' : 'Tải PDF'}
        </button>
        <Link
          to="/pos"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-teal-700 font-semibold text-teal-800"
        >
          Đơn mới
        </Link>
      </div>
      <section
        aria-labelledby="payment-reconciliation-title"
        className="mt-5 rounded-xl border border-slate-200 bg-white p-4"
      >
        <h2 id="payment-reconciliation-title" className="font-bold">
          Đối soát thanh toán
        </h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Trạng thái hóa đơn</dt>
            <dd className="font-medium">{invoice.sale.status}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Trạng thái thanh toán</dt>
            <dd className="font-medium">
              {invoice.sale.paymentStatus === 'CAPTURED'
                ? 'Đã ghi nhận'
                : invoice.sale.paymentStatus === 'REVERSED'
                  ? 'Đã đảo'
                  : invoice.sale.paymentStatus}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Số tiền đã ghi nhận</dt>
            <dd className="font-medium">
              {money(invoice.totals.capturedAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Phương thức</dt>
            <dd className="font-medium">
              {invoice.sale.paymentMethod === 'CASH'
                ? 'Tiền mặt'
                : 'Chuyển khoản'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Nhân viên</dt>
            <dd className="font-medium">{invoice.sale.staffName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Kênh bán</dt>
            <dd className="font-medium">{invoice.sale.channelName}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500">Thời điểm hoàn tất</dt>
            <dd className="font-medium">
              {new Date(invoice.sale.completedAt).toLocaleString('vi-VN')}
            </dd>
          </div>
        </dl>
        {pendingCommand ? (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-semibold">Giao dịch này đang chờ đối soát</p>
            <p className="mt-1 text-xs">Mã yêu cầu</p>
            <code className="block break-all text-xs">
              {pendingCommand.idempotencyKey}
            </code>
            <button
              type="button"
              onClick={requestFinancialCommandReconciliation}
              className="mt-3 min-h-11 rounded-lg border border-amber-700 px-3 font-semibold"
            >
              Đối soát lại giao dịch
            </button>
          </div>
        ) : null}
      </section>
      {invoice.lifecycle.returns.length > 0 ? (
        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-bold">Lịch sử trả hàng</h2>
          <div className="mt-3 space-y-2">
            {invoice.lifecycle.returns.map((item) => (
              <Link
                key={item.id}
                to={`/returns/${item.id}`}
                className="block rounded-lg bg-slate-50 p-3 text-sm hover:bg-slate-100"
              >
                {item.returnNumber ?? 'Yêu cầu trả hàng'} · {item.status} ·{' '}
                {money(item.refundTotal)}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {invoice.lifecycle.canReturn &&
      session?.permissions.includes('return.request.create') ? (
        <Link
          to={`/sales/${saleId}/return`}
          className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-teal-700 px-4 font-semibold text-teal-800"
        >
          Tạo yêu cầu trả hàng
        </Link>
      ) : null}
      {canCancel ? (
        <section className="mt-5 space-y-2 rounded-xl border border-red-200 bg-red-50 p-4">
          <h2 className="font-bold text-red-950">Hủy hóa đơn</h2>
          <textarea
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            maxLength={500}
            placeholder="Lý do hủy hóa đơn"
            disabled={!online || busy}
            className="min-h-20 w-full rounded-lg border border-red-200 bg-white p-3"
          />
          <button
            type="button"
            disabled={!online || busy || cancelReason.trim().length === 0}
            onClick={() => void cancelSale()}
            className="min-h-11 rounded-lg border border-red-700 px-4 font-semibold text-red-800 disabled:opacity-50"
          >
            Hủy hóa đơn
          </button>
        </section>
      ) : null}
    </main>
  );
}
