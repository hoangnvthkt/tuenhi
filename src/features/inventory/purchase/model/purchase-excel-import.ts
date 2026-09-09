import { validateCanonicalNumber } from '@/shared/lib/numeric/canonical-number';
import type { PurchaseDraftLine } from './purchase-draft';

type ResolvedProduct = {
  requestedSku: string;
  productId: string | null;
  sku: string | null;
  productName: string | null;
  unitName: string | null;
  isActive: boolean;
};

type PreviewRow = {
  rowNumber: number;
  sku: string;
  receivedQty: string;
  unitCost: string;
  productName: string | null;
  issue: string | null;
};

const expectedHeaders = ['SKU', 'Số lượng nhận', 'Đơn giá nhập'];

function asText(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function asSku(value: unknown) {
  return asText(value).normalize('NFC');
}

export async function validatePurchaseReceiptRows({
  headers,
  rows,
  existingProductIds,
  resolveProducts,
}: {
  headers: string[];
  rows: Array<{ rowNumber: number; cells: unknown[] }>;
  existingProductIds: Set<string>;
  resolveProducts: (skus: string[]) => Promise<ResolvedProduct[]>;
}): Promise<{
  rows: PreviewRow[];
  lines: PurchaseDraftLine[];
  canApply: boolean;
}> {
  if (
    headers.length !== expectedHeaders.length ||
    headers.some((header, index) => header.trim() !== expectedHeaders[index])
  ) {
    return {
      rows: [
        {
          rowNumber: 1,
          sku: '',
          receivedQty: '',
          unitCost: '',
          productName: null,
          issue: 'Các cột Excel không đúng mẫu phiếu nhập.',
        },
      ],
      lines: [],
      canApply: false,
    };
  }

  const normalized = rows.map((row) => ({
    rowNumber: row.rowNumber,
    sku: asSku(row.cells[0]),
    receivedQty: asText(row.cells[1]),
    unitCost: asText(row.cells[2]),
  }));
  const uniqueSkus = [
    ...new Set(normalized.map((row) => row.sku).filter(Boolean)),
  ];
  const resolved = await resolveProducts(uniqueSkus);
  const bySku = new Map(
    resolved.map((product) => [product.requestedSku, product]),
  );
  const seen = new Set<string>();

  const preview = normalized.map<PreviewRow>((row) => {
    const product = bySku.get(row.sku);
    let issue: string | null = null;
    if (!row.sku) issue = 'SKU không được để trống.';
    else if (seen.has(row.sku)) issue = 'SKU bị trùng trong file Excel.';
    else if (!product?.productId) issue = 'Không tìm thấy SKU trong hàng hóa.';
    else if (!product.isActive) issue = 'Hàng hóa đã ngừng hoạt động.';
    else if (existingProductIds.has(product.productId))
      issue = 'Sản phẩm đã có trên phiếu.';
    else {
      const quantity = validateCanonicalNumber(row.receivedQty, {
        kind: 'quantity',
        precision: 18,
        positive: true,
      });
      const cost = validateCanonicalNumber(row.unitCost, {
        kind: 'money',
        precision: 20,
        positive: true,
      });
      if (!quantity.ok) issue = `Số lượng nhận: ${quantity.message}`;
      else if (!cost.ok) issue = `Đơn giá nhập: ${cost.message}`;
    }
    if (row.sku) seen.add(row.sku);
    return {
      ...row,
      productName: product?.productName ?? null,
      issue,
    };
  });
  const canApply = preview.length > 0 && preview.every((row) => !row.issue);
  return {
    rows: preview,
    lines: canApply
      ? preview.map((row) => ({
          productId: bySku.get(row.sku)!.productId!,
          receivedQty: row.receivedQty,
          unitCost: row.unitCost,
        }))
      : [],
    canApply,
  };
}
