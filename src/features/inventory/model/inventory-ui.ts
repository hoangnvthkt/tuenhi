export const statusLabel: Record<string, string> = {
  DRAFT: 'Nháp',
  AWAITING_COST: 'Chờ nhập giá',
  COUNTED: 'Đã kiểm đếm',
  POSTED: 'Đã ghi sổ',
  REVERSED: 'Đã đảo',
  CANCELLED: 'Đã hủy',
};

export function formatNumber(value: string, maximumFractionDigits = 3) {
  return formatViDecimal(value, maximumFractionDigits);
}

export function formatMoney(value: string) {
  return `${formatNumber(value, 2)} ₫`;
}

export function safeInventoryMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Không thể hoàn tất thao tác. Vui lòng thử lại.';
}
import { formatViDecimal } from '@/shared/lib/numeric/canonical-number';
