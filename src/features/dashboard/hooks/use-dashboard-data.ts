import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createOwnerReportsApi,
  createRevenueReportsApi,
  type ReportPeriod,
} from '@/features/reports';

export function useDashboardData({
  period,
  from,
  to,
  canAll,
  canOwn,
  canProfit,
  online,
}: {
  period: ReportPeriod;
  from: string;
  to: string;
  canAll: boolean;
  canOwn: boolean;
  canProfit: boolean;
  online: boolean;
}) {
  const [revenueApi] = useState(createRevenueReportsApi);
  const [ownerApi] = useState(createOwnerReportsApi);
  const refreshOptions = {
    refetchInterval: () =>
      online && document.visibilityState === 'visible' ? 60_000 : false,
    refetchOnWindowFocus: true,
  };
  const operational = useQuery({
    queryKey: ['operational-dashboard', period, from, to],
    queryFn: () => revenueApi.operational(from, to),
    ...refreshOptions,
  });
  const revenue = useQuery({
    queryKey: ['dashboard-revenue', period, from, to, canAll],
    queryFn: () =>
      canAll
        ? revenueApi.revenue(from, to, 'ALL')
        : revenueApi.mySummary(from, to),
    enabled: canAll || canOwn,
    ...refreshOptions,
  });
  const owner = useQuery({
    queryKey: ['dashboard-owner', period, from, to],
    queryFn: () => ownerApi.owner(from, to),
    enabled: canProfit,
    gcTime: 0,
    ...refreshOptions,
  });
  const refresh = () => {
    void operational.refetch();
    if (canAll || canOwn) void revenue.refetch();
    if (canProfit) void owner.refetch();
  };
  return { operational, revenue, owner, refresh };
}
