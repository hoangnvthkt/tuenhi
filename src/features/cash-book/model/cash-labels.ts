import type { CashBookEntry, Fund } from '../api/cash-book-api';

export const fundLabel: Record<Fund, string> = {
  CASH: 'Tiền mặt',
  BANK: 'Ngân hàng',
};

export function entryLabel(
  entry: Pick<CashBookEntry, 'source' | 'category' | 'direction'>,
  fund: Fund,
) {
  switch (entry.source) {
    case 'SALE_RECEIPT':
      return 'Thu bán hàng';
    case 'SALE_CANCEL':
      return 'Hoàn tiền hủy đơn';
    case 'RETURN_REFUND':
      return 'Hoàn tiền trả hàng';
    case 'DEBT_COLLECTION':
      return 'Thu nợ';
  }
  switch (entry.category) {
    case 'OWNER_CONTRIBUTION':
      return 'Chủ nộp tiền';
    case 'EXPENSE':
      return 'Chi phí cửa hàng';
    case 'OWNER_WITHDRAWAL':
      return 'Rút tiền về chủ';
    case 'FUND_TRANSFER':
      return transferLabel(fund, entry.direction);
    case 'REVERSAL':
      return 'Hủy phiếu';
    default:
      return entry.direction === 'IN' ? 'Thu khác' : 'Chi khác';
  }
}

export function transferLabel(fund: Fund, direction: 'IN' | 'OUT') {
  if (fund === 'CASH')
    return direction === 'OUT'
      ? 'Nộp tiền mặt vào ngân hàng'
      : 'Rút ngân hàng về tiền mặt';
  return direction === 'OUT'
    ? 'Rút ngân hàng về tiền mặt'
    : 'Nộp tiền mặt vào ngân hàng';
}

export function documentLink(entry: CashBookEntry) {
  if (entry.documentType === 'SALE') return `/sales/${entry.documentId}`;
  if (entry.documentType === 'RETURN') return `/returns/${entry.documentId}`;
  if (entry.documentType === 'CUSTOMER')
    return `/more/customers/${entry.documentId}`;
  return null;
}

/** Signed difference of two canonical money strings, exact in whole cents. */
export function subtractMoney(left: string, right: string) {
  const cents = toCents(left) - toCents(right);
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  const text = `${absolute / 100n}${fraction === '00' ? '' : `.${fraction}`}`;
  return negative ? `-${text}` : text;
}

function toCents(value: string) {
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = value.replace(/^-/, '').split('.');
  const cents =
    BigInt(whole || '0') * 100n + BigInt(`${fraction}00`.slice(0, 2));
  return negative ? -cents : cents;
}

const timeParts = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Ho_Chi_Minh',
});
/** `16/10 09:36` in Vietnam time. */
export function formatCashTime(iso: string) {
  const parts = Object.fromEntries(
    timeParts
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month} ${parts.hour}:${parts.minute}`;
}
