import { z } from 'zod';
import { validateCanonicalNumber } from '@/shared/lib/numeric/canonical-number';
import type { ProductFormValues } from './catalog-types';

const productFormSchema = z.object({
  sku: z.string().min(1, 'Vui lòng nhập SKU.').max(64, 'SKU tối đa 64 ký tự.'),
  barcode: z.string().max(64, 'Mã vạch tối đa 64 ký tự.'),
  name: z
    .string()
    .min(1, 'Vui lòng nhập tên sản phẩm.')
    .max(200, 'Tên sản phẩm tối đa 200 ký tự.'),
  categoryId: z.union([z.literal(''), z.uuid('Nhóm hàng chưa hợp lệ.')]),
  unitName: z
    .string()
    .min(1, 'Vui lòng nhập đơn vị tính.')
    .max(50, 'Đơn vị tính tối đa 50 ký tự.'),
  description: z.string().max(2000, 'Mô tả tối đa 2.000 ký tự.'),
  minStockQty: z.string(),
  salePrice: z.string(),
  isActive: z.boolean(),
});

export type ProductValidationResult =
  | { ok: true; data: ProductFormValues }
  | {
      ok: false;
      fieldErrors: Partial<Record<keyof ProductFormValues, string>>;
    };

export function validateProductForm(
  values: ProductFormValues,
  options: { canManageSalePrice: boolean },
): ProductValidationResult {
  const parsed = productFormSchema.safeParse(values);
  const fieldErrors: Partial<Record<keyof ProductFormValues, string>> = {};

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !(field in fieldErrors)) {
        fieldErrors[field as keyof ProductFormValues] = issue.message;
      }
    }
  }

  const quantity = validateCanonicalNumber(values.minStockQty, {
    kind: 'quantity',
    precision: 18,
    required: true,
    nonNegative: true,
  });
  if (!quantity.ok) fieldErrors.minStockQty = quantity.message;

  if (values.salePrice !== '') {
    if (!options.canManageSalePrice) {
      fieldErrors.salePrice = 'Chỉ chủ cửa hàng được thay đổi giá bán.';
    } else {
      const price = validateCanonicalNumber(values.salePrice, {
        kind: 'money',
        precision: 18,
        required: true,
        nonNegative: true,
      });
      if (!price.ok) fieldErrors.salePrice = price.message;
    }
  }

  return Object.keys(fieldErrors).length > 0
    ? { ok: false, fieldErrors }
    : { ok: true, data: values };
}
