import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { useState } from 'react';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { createSalesApi, type Invoice } from './sales-api';
import { getSupabaseClient } from '@/shared/supabase/client';
import { useSession } from '../auth/use-session';
const money = (v: string) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(v));
async function downloadPdf(invoice: Invoice) {
  const module = await import('pdfmake/build/pdfmake');
  const pdfMake = (module.default ?? module) as unknown as {
    createPdf: (content: unknown) => { download: (name: string) => void };
  };
  pdfMake
    .createPdf({
      content: [
        { text: invoice.store.displayName, style: 'header' },
        { text: `HÓA ĐƠN ${invoice.sale.saleNumber}` },
        { text: new Date(invoice.sale.completedAt).toLocaleString('vi-VN') },
        { text: ' ' },
        {
          table: {
            widths: ['*', 'auto', 'auto'],
            body: [
              ['Sản phẩm', 'SL', 'Thành tiền'],
              ...invoice.lines.map((x) => [
                x.productName,
                x.quantity,
                money(x.netAmount),
              ]),
              ['Tổng cộng', '', '' + money(invoice.totals.netTotal)],
            ],
          },
        },
        invoice.store.invoiceFooter
          ? { text: '\n' + invoice.store.invoiceFooter }
          : {},
      ],
      styles: { header: { fontSize: 16, bold: true } },
    })
    .download(`Hoa-don-${invoice.sale.saleNumber}.pdf`);
}
export function SaleDetailPage() {
  const { saleId } = useParams();
  const online = useOnlineStatus();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['invoice', saleId],
    queryFn: () => createSalesApi().invoice(saleId!),
    enabled: Boolean(saleId),
  });
  const invoice = query.data;
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
      const detail = await createSalesApi().detail(saleId);
      await createSalesApi().cancelSale(
        saleId,
        detail.version,
        cancelReason.trim(),
        crypto.randomUUID(),
      );
      toast.show({ kind: 'success', title: 'Đã hủy hóa đơn' });
      await queryClient.invalidateQueries({ queryKey: ['invoice', saleId] });
      await queryClient.invalidateQueries({ queryKey: ['sales'] });
    } catch (reason) {
      toast.show({
        kind: 'error',
        title: 'Không thể hủy hóa đơn',
        message: reason instanceof Error ? reason.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }
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
          Khách hàng: {invoice.sale.customerName ?? 'Khách lẻ'}
        </p>
        <div className="mt-4 space-y-3">
          {invoice.lines.map((line) => (
            <div key={line.id} className="border-b border-slate-100 pb-3">
              <div className="flex justify-between gap-3">
                <span className="font-medium">{line.productName}</span>
                <span>{money(line.netAmount)}</span>
              </div>
              <p className="text-sm text-slate-600">
                {line.quantity} {line.unitName} × {money(line.unitSalePrice)}
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
        </div>
        {invoice.store.invoiceFooter ? (
          <p className="mt-5 text-center text-sm text-slate-600">
            {invoice.store.invoiceFooter}
          </p>
        ) : null}
      </article>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          onClick={() => window.print()}
          className="min-h-11 rounded-lg border border-slate-300 font-medium"
        >
          In nhiệt 80 mm
        </button>
        <button
          onClick={() =>
            downloadPdf(invoice).catch(() =>
              toast.show({ kind: 'error', title: 'Không thể tạo PDF' }),
            )
          }
          className="min-h-11 rounded-lg bg-teal-700 font-semibold text-white"
        >
          Tải PDF
        </button>
      </div>
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
