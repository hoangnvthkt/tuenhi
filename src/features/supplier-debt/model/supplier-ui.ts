import type { QueryClient } from '@tanstack/react-query';

const dayParts = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
});
/** `15/09` in Vietnam time. */
export function formatDay(iso: string) {
  const parts = Object.fromEntries(
    dayParts
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month}`;
}

export function invalidateSupplierQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey.some(
        (part) =>
          part === 'supplier-debts' ||
          part === 'purchase-return' ||
          part === 'write-offs' ||
          part === 'cash-book',
      ),
  });
}
