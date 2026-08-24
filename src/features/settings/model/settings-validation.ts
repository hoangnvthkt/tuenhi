export type SalesChannelFormValues = {
  code: string;
  name: string;
  sortOrder: string;
  isActive: boolean;
};

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors: Partial<Record<keyof T, string>> };

export function validateSalesChannel(
  input: SalesChannelFormValues,
  context: { originalCode?: string } = {},
): ValidationResult<SalesChannelFormValues> {
  const values = {
    ...input,
    code: input.code.trim(),
    name: input.name.trim().normalize('NFC'),
    sortOrder: input.sortOrder.trim(),
  };
  const fieldErrors: Partial<Record<keyof SalesChannelFormValues, string>> = {};
  if (context.originalCode && values.code !== context.originalCode) {
    fieldErrors.code = 'Mã kênh bán không thể thay đổi sau khi tạo.';
  } else if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(values.code)) {
    fieldErrors.code =
      'Mã kênh phải bắt đầu bằng chữ in hoa và chỉ gồm A-Z, 0-9 hoặc dấu gạch dưới.';
  }
  if (!values.name) fieldErrors.name = 'Tên không được để trống.';
  else if (values.name.length > 120)
    fieldErrors.name = 'Tên không được vượt quá 120 ký tự.';
  if (
    !/^\d+$/.test(values.sortOrder) ||
    Number(values.sortOrder) > 2_147_483_647
  ) {
    fieldErrors.sortOrder = 'Thứ tự phải là số nguyên không âm.';
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, data: values };
}
