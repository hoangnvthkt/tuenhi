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
  const [revenueApi] = useState(createRevenueReportsApi);
  const [ownerApi] = useState(createOwnerReportsApi);
  const queryOptions = {
    refetchInterval: () =>
      online && document.visibilityState === 'visible' ? 60_000 : false,
    refetchOnWindowFocus: true,
  };
  const report = useQuery({
    queryKey: ['reports', from, to, scope],
    queryFn: () => revenueApi.revenue(from, to, scope),
    ...queryOptions,
  });
  const owner = useQuery({
    queryKey: ['owner-dashboard', from, to],
    queryFn: () => ownerApi.owner(from, to),
    enabled: canProfit,
    gcTime: 0,
    ...queryOptions,
  });
  const profit = useQuery({
    queryKey: ['profit-report', from, to],
    queryFn: () => ownerApi.profit(from, to),
    enabled: canProfit,
    gcTime: 0,
    ...queryOptions,
  });

  return { report, owner, profit, ownerApi };
}
