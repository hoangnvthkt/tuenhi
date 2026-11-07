import type { QueryClient } from '@tanstack/react-query';

export function invalidateCashQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey.some(
        (part) => part === 'cash-book' || part === 'cash-shifts',
      ),
  });
}
