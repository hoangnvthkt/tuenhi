import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildReportWorkbook } from './report-workbook';
import type { ProfitPage, RevenueReport } from '../api/reports-api';

const report: RevenueReport = {
  version: 1,
  timezone: 'Asia/Ho_Chi_Minh',
  range: { from: '2026-08-01', to: '2026-08-01' },
  generatedAt: '2026-08-01T00:00:00+00:00',
  scope: 'OWN',
  summary: {
    completedOrderCount: 1,
    soldQuantity: '2',
    grossSales: '120000.00',
    lineDiscounts: '0.00',
    orderDiscounts: '10000.00',
    salesReturns: '0.00',
    cancellations: '0.00',
    netRevenue: '110000.00',
    averageOrderValue: '110000.00',
  },
  daily: [
    {
      day: '2026-08-01',
      completedOrderCount: 1,
      soldQuantity: '2',
      grossSales: '120000.00',
      lineDiscounts: '0.00',
      orderDiscounts: '10000.00',
      salesReturns: '0.00',
      cancellations: '0.00',
      netRevenue: '110000.00',
    },
  ],
  channels: [
    {
      code: 'STORE',
      name: 'Tại cửa hàng',
      completedOrderCount: 1,
      grossSales: '120000.00',
      netRevenue: '110000.00',
    },
  ],
  paymentMethods: [
    {
      method: 'CASH',
      completedOrderCount: 1,
      grossSales: '120000.00',
      netRevenue: '110000.00',
    },
  ],
};
const profit: ProfitPage = {
  version: 1,
  nextCursor: null,
  items: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      eventType: 'SALE_COMPLETED',
      saleId: '00000000-0000-4000-8000-000000000002',
      saleNumber: 'HD0001',
      returnId: null,
      returnNumber: null,
      occurredAt: '2026-08-01T00:00:00+00:00',
      attributedUserName: 'Nhân viên',
      channelCode: 'STORE',
      channelName: 'Tại cửa hàng',
      paymentMethod: 'CASH',
      grossSales: '120000.00',
      netRevenue: '110000.00',
      netCogs: '80000.00',
      grossProfit: '30000.00',
    },
  ],
};

describe('buildReportWorkbook', () => {
  it('creates the owner workbook without recomputing canonical decimal strings', async () => {
    const blob = await buildReportWorkbook(report, profit);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Tổng quan',
      'Theo ngày',
      'Theo kênh',
      'Thanh toán',
      'Sự kiện tài chính',
    ]);
    expect(workbook.getWorksheet('Tổng quan')?.getCell('B6').value).toBe(
      '120000.00',
    );
  });
});
