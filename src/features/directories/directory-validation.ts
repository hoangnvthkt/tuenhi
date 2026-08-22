import { normalizePhone } from '../../lib/phone/normalize-phone';

export type SupplierFormValues = {
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  isActive: boolean;
};

export type CustomerFormValues = SupplierFormValues & {
  customerType: 'INDIVIDUAL' | 'BUSINESS';
  companyName: string;
  taxCode: string;
  customerGroup: string;
};

export type SalesChannelFormValues = {
  code: string;
  name: string;
  sortOrder: string;
  isActive: boolean;
};

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors: Partial<Record<keyof T, string>> };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimmedSupplier(values: SupplierFormValues) {
  return {
    ...values,
    code: values.code.trim(),
    name: values.name.trim().normalize('NFC'),
    phone: values.phone.trim(),
    email: values.email.trim().toLowerCase(),
    address: values.address.trim(),
    notes: values.notes.trim(),
  };
}

function baseDirectoryErrors(values: SupplierFormValues) {
  const fieldErrors: Partial<Record<keyof SupplierFormValues, string>> = {};
  if (!values.name) fieldErrors.name = 'Tên không được để trống.';
  else if (values.name.length > 200)
    fieldErrors.name = 'Tên không được vượt quá 200 ký tự.';
  if (values.code.length > 64)
    fieldErrors.code = 'Mã không được vượt quá 64 ký tự.';
  if (values.address.length > 500)
    fieldErrors.address = 'Địa chỉ không được vượt quá 500 ký tự.';
  if (values.notes.length > 1000)
    fieldErrors.notes = 'Ghi chú không được vượt quá 1.000 ký tự.';
  if (
    values.email &&
    (values.email.length > 254 || !emailPattern.test(values.email))
  ) {
    fieldErrors.email = 'Email chưa đúng định dạng.';
  }
  const phone = normalizePhone(values.phone, 'VN');
  if (!phone.ok) fieldErrors.phone = phone.message;
  return { fieldErrors, phone };
}

export function validateSupplier(
  input: SupplierFormValues,
): ValidationResult<SupplierFormValues> {
  const values = trimmedSupplier(input);
  const { fieldErrors, phone } = baseDirectoryErrors(values);
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return {
    ok: true,
    data: { ...values, phone: phone.ok ? (phone.e164 ?? '') : '' },
  };
}

export function validateCustomer(
  input: CustomerFormValues,
): ValidationResult<CustomerFormValues> {
  const values = {
    ...trimmedSupplier(input),
    customerType: input.customerType,
    companyName: input.companyName.trim().normalize('NFC'),
    taxCode: input.taxCode.trim(),
    customerGroup: input.customerGroup.trim().normalize('NFC'),
  };
  if (values.customerType === 'INDIVIDUAL') values.companyName = '';
  const { fieldErrors: baseErrors, phone } = baseDirectoryErrors(values);
  const fieldErrors: Partial<Record<keyof CustomerFormValues, string>> = {
    ...baseErrors,
  };
  if (values.customerType === 'BUSINESS' && !values.companyName) {
    fieldErrors.companyName =
      'Tên công ty không được để trống với khách doanh nghiệp.';
  } else if (values.companyName.length > 200) {
    fieldErrors.companyName = 'Tên công ty không được vượt quá 200 ký tự.';
  }
  if (values.taxCode.length > 32)
    fieldErrors.taxCode = 'Mã số thuế không được vượt quá 32 ký tự.';
  if (values.customerGroup.length > 120)
    fieldErrors.customerGroup = 'Nhóm khách không được vượt quá 120 ký tự.';
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return {
    ok: true,
    data: { ...values, phone: phone.ok ? (phone.e164 ?? '') : '' },
  };
}

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
