import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { DraftPrint, Invoice } from '../api/sales-schemas';
import { formatViNumber } from '@/shared/lib/numeric/canonical-number';
import { formatPosMoney } from './format-money';

export async function createSalesPdf(definition: TDocumentDefinitions) {
  const pdfModule = await import('pdfmake/build/pdfmake');
  const pdfMake = pdfModule.default ?? pdfModule;
  const fontUrl = (filename: string) =>
    new URL(
      `${import.meta.env.BASE_URL}fonts/${filename}`,
      globalThis.location.href,
    ).href;
  const normal = fontUrl('Roboto-Regular.ttf');
  const bold = fontUrl('Roboto-Medium.ttf');
  // Receipts only use regular and bold. Reuse them for optional italic styles
  // to avoid shipping the unused italic font variants.
  pdfMake.addFonts({
    Roboto: { normal, bold, italics: normal, bolditalics: bold },
  });
  return pdfMake.createPdf(definition);
}

export function buildInvoicePdf(invoice: Invoice): TDocumentDefinitions {
  return {
    content: [
      { text: invoice.store.displayName, style: 'header' },
      { text: `HÓA ĐƠN ${invoice.sale.saleNumber}` },
      { text: new Date(invoice.sale.completedAt).toLocaleString('vi-VN') },
      { text: ' ' },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto'],
          body: [
            ['Sản phẩm', 'SL', 'Thành tiền'],
            ...invoice.lines.map((line) => [
              line.productName,
              formatViNumber(line.quantity),
              formatPosMoney(line.netAmount),
            ]),
            ['Tổng cộng', '', formatPosMoney(invoice.totals.netTotal)],
          ],
        },
      },
      { text: invoice.store.invoiceFooter ?? '', margin: [0, 12, 0, 0] },
    ],
    styles: { header: { fontSize: 16, bold: true } },
  };
}

export function buildDraftPdf(document: DraftPrint): TDocumentDefinitions {
  return {
    content: [
      { text: document.store.displayName, style: 'header' },
      { text: document.store.address ?? '' },
      { text: document.store.contactPhone ?? '' },
      {
        text: 'PHIẾU TẠM TÍNH — CHƯA THANH TOÁN',
        bold: true,
        margin: [0, 12, 0, 8],
      },
      { text: `Khách hàng: ${document.draft.customerName ?? 'Khách lẻ'}` },
      { text: document.draft.customerPhone ?? '' },
      {
        text: `Kênh bán: ${document.draft.channelName} · Nhân viên: ${document.draft.staffName}`,
      },
      {
        text: `Cập nhật: ${new Date(document.draft.updatedAt).toLocaleString('vi-VN')}`,
        margin: [0, 0, 0, 12],
      },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto'],
          body: [
            ['Sản phẩm', 'SL', 'Đơn giá', 'Thành tiền'],
            ...document.lines.map((line) => [
              `${line.productName}\n${line.sku} · ${line.unitName}`,
              formatViNumber(line.quantity),
              formatPosMoney(line.unitSalePrice),
              formatPosMoney(line.netAmount),
            ]),
          ],
        },
      },
      {
        text: `Tiền hàng: ${formatPosMoney(document.totals.subtotal)}`,
        margin: [0, 12, 0, 0],
      },
      {
        text: `Giảm dòng: ${formatPosMoney(document.totals.lineDiscountTotal)}`,
      },
      {
        text: `Giảm toàn đơn: ${formatPosMoney(document.totals.orderDiscountTotal)}`,
      },
      {
        text: `Tạm tính: ${formatPosMoney(document.totals.netTotal)}`,
        bold: true,
      },
      { text: document.draft.note ?? '', margin: [0, 12, 0, 0] },
      {
        text: 'Chưa ghi nhận thanh toán. Phiếu này không phải hóa đơn bán hàng.',
        margin: [0, 12, 0, 0],
      },
      { text: document.store.invoiceFooter ?? '', margin: [0, 12, 0, 0] },
    ],
    styles: { header: { fontSize: 16, bold: true } },
    defaultStyle: { fontSize: 10 },
  };
}

export async function downloadInvoicePdf(invoice: Invoice) {
  const pdf = await createSalesPdf(buildInvoicePdf(invoice));
  await pdf.download(`Hoa-don-${invoice.sale.saleNumber}.pdf`);
}

export async function downloadDraftPdf(document: DraftPrint) {
  const pdf = await createSalesPdf(buildDraftPdf(document));
  await pdf.download(`Tam-tinh-${document.draft.id}.pdf`);
}
