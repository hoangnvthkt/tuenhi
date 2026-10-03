import { usePrivateQueryKey } from '@/features/auth';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createOwnerReportsApi,
  createRevenueReportsApi,
} from '../api/reports-api';

export function useReportData({
  from,
  to,
  scope,
  canProfit,
  online,
}: {
  from: string;
  to: string;
  scope: 'OWN' | 'ALL';
  canProfit: boolean;
  online: boolean;
}) {
  const privateKey = usePrivateQueryKey();
  const [revenueApi] = useState(createRevenueReportsApi);
  const [ownerApi] = useState(createOwnerReportsApi);
  const queryOptions = {
    refetchInterval: () =>
      online && document.visibilityState === 'visible' ? 60_000 : false,
    refetchOnWindowFocus: true,
  };
  const report = useQuery({
    queryKey: privateKey(...['reports', from, to, scope]),
    queryFn: () => revenueApi.revenue(from, to, scope),
    ...queryOptions,
  });
  const owner = useQuery({
    queryKey: privateKey(...['owner-dashboard', from, to]),
    queryFn: () => ownerApi.owner(from, to),
    enabled: canProfit,
    gcTime: 0,
    ...queryOptions,
  });
  const profit = useQuery({
    queryKey: privateKey(...['profit-report', from, to]),
    queryFn: () => ownerApi.profit(from, to),
    enabled: canProfit,
    gcTime: 0,
    ...queryOptions,
  });

  return { report, owner, profit, ownerApi };
}
