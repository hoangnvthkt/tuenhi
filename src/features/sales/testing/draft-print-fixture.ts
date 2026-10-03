import type { DraftPrint } from '../api/sales-schemas';

export const draftPrintFixture: DraftPrint = {
  version: 1,
  kind: 'PROVISIONAL',
  store: {
    displayName: 'Tuệ Nhi',
    logoPath: null,
    address: 'Hà Nội',
    contactPhone: '0901234567',
    zalo: null,
    invoiceFooter: 'Cảm ơn quý khách!',
  },
  draft: {
    id: '20000000-0000-4000-8000-000000000001',
    status: 'DRAFT',
    version: 3,
    updatedAt: '2026-10-02T08:00:00Z',
    channelName: 'Tại quầy',
    staffName: 'Nguyễn Thị Hồng',
    customerName: 'Trần Ánh',
    customerPhone: null,
    note: 'Giao buổi chiều',
  },
  lines: [
    {
      id: '30000000-0000-4000-8000-000000000001',
      productName: 'Sữa hộp dưỡng chất',
      sku: 'SUA',
      unitName: 'Hộp',
      quantity: '2',
      unitSalePrice: '50000',
      grossAmount: '100000',
      lineDiscountAmount: '3000',
      allocatedOrderDiscount: '0',
      netAmount: '97000',
    },
  ],
  totals: {
    subtotal: '100000',
    lineDiscountTotal: '3000',
    orderDiscountTotal: '0',
    netTotal: '97000',
  },
};
