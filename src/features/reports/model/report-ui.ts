import { formatViDecimal } from '@/shared/lib/numeric/canonical-number';

export function formatReportNumber(value: string, maximumFractionDigits = 3) {
  return formatViDecimal(value, maximumFractionDigits);
}
export function formatReportMoney(value: string) {
  return `${formatReportNumber(value, 2)} ₫`;
}
export function paymentLabel(method: string) {
  return method === 'CASH'
    ? 'Tiền mặt'
    : method === 'BANK_TRANSFER'
      ? 'Chuyển khoản'
      : 'Không xác định';
}
export function eventLabel(type: string) {
  return type === 'SALE_COMPLETED'
    ? 'Bán hoàn tất'
    : type === 'RETURN_COMPLETED'
      ? 'Trả hàng'
      : 'Hủy hóa đơn';
}
