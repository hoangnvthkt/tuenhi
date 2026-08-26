import type { QueryClient } from '@tanstack/react-query';

/**
 * Query families derived from operational commands. Invalidating only active
 * queries refreshes the visible screen now and makes inactive data stale for
 * its next route visit.
 */
const operationalQueryRoots = new Set([
  'catalog',
  'directories',
  'settings',
  'pos-products',
  'pos-channels',
  'pos-customers',
  'sales',
  'sale',
  'invoice',
  'sale-returns',
  'sale-return',
  'stock-counts',
  'inventory-valuation',
  'operational-dashboard',
  'dashboard-revenue',
  'dashboard-owner',
  'reports',
  'owner-dashboard',
  'profit-report',
]);

export function refreshOperationalData(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const root = query.queryKey[0];
      return typeof root === 'string' && operationalQueryRoots.has(root);
    },
    refetchType: 'active',
  });
}
