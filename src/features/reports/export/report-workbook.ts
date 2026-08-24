import type { ProfitPage, RevenueReport } from '../api/reports-api';

const mime =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
function header(row: import('exceljs').Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F766E' },
  };
}
function addRows(
  sheet: import('exceljs').Worksheet,
  headings: string[],
  rows: string[][],
) {
  sheet.addRow(headings);
  header(sheet.getRow(1));
  for (const row of rows) sheet.addRow(row);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.columns.forEach((column) => {
    column.width = 20;
  });
}
export async function buildReportWorkbook(
  report: RevenueReport,
  profit?: ProfitPage,
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tuệ Nhi POS';
  workbook.created = new Date(0);
  workbook.modified = new Date(0);
  const summary = workbook.addWorksheet('Tổng quan');
  addRows(
    summary,
    ['Chỉ tiêu', 'Giá trị'],
    [
      ['Từ ngày', report.range.from],
      ['Đến ngày', report.range.to],
      ['Số đơn hoàn tất', String(report.summary.completedOrderCount)],
      ['Số lượng bán', report.summary.soldQuantity],
      ['Doanh thu gộp', report.summary.grossSales],
      ['Giảm dòng', report.summary.lineDiscounts],
      ['Giảm toàn đơn', report.summary.orderDiscounts],
      ['Trả hàng', report.summary.salesReturns],
      ['Hủy hóa đơn', report.summary.cancellations],
      ['Doanh thu thuần', report.summary.netRevenue],
      ['Giá trị đơn trung bình', report.summary.averageOrderValue ?? ''],
    ],
  );
  const daily = workbook.addWorksheet('Theo ngày');
  addRows(
    daily,
    [
      'Ngày',
      'Đơn hoàn tất',
      'SL bán',
      'Doanh thu gộp',
      'Giảm dòng',
      'Giảm đơn',
      'Trả hàng',
      'Hủy',
      'Doanh thu thuần',
    ],
    report.daily.map((item) => [
      item.day,
      String(item.completedOrderCount),
      item.soldQuantity,
      item.grossSales,
      item.lineDiscounts,
      item.orderDiscounts,
      item.salesReturns,
      item.cancellations,
      item.netRevenue,
    ]),
  );
  const channel = workbook.addWorksheet('Theo kênh');
  addRows(
    channel,
    ['Mã', 'Kênh bán', 'Đơn hoàn tất', 'Doanh thu gộp', 'Doanh thu thuần'],
    report.channels.map((item) => [
      item.code,
      item.name,
      String(item.completedOrderCount),
      item.grossSales,
      item.netRevenue,
    ]),
  );
  const payment = workbook.addWorksheet('Thanh toán');
  addRows(
    payment,
    ['Phương thức', 'Đơn hoàn tất', 'Doanh thu gộp', 'Doanh thu thuần'],
    report.paymentMethods.map((item) => [
      item.method,
      String(item.completedOrderCount),
      item.grossSales,
      item.netRevenue,
    ]),
  );
  if (profit) {
    const events = workbook.addWorksheet('Sự kiện tài chính');
    addRows(
      events,
      [
        'Thời điểm',
        'Loại',
        'Hóa đơn',
        'Phiếu trả',
        'Nhân viên',
        'Kênh',
        'Thanh toán',
        'Doanh thu gộp',
        'DT thuần',
        'Giá vốn',
        'LN gộp',
      ],
      profit.items.map((item) => [
        item.occurredAt,
        item.eventType,
        item.saleNumber,
        item.returnNumber ?? '',
        item.attributedUserName,
        item.channelName ?? '',
        item.paymentMethod ?? '',
        item.grossSales,
        item.netRevenue,
        item.netCogs,
        item.grossProfit,
      ]),
    );
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(buffer)], { type: mime });
}
export function downloadReportWorkbook(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
