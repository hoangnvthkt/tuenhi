import { usePrivateQueryKey } from '@/features/auth';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createSaleSettlementsApi,
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
  const privateKey = usePrivateQueryKey();
  const [revenueApi] = useState(createRevenueReportsApi);
  const [settlementApi] = useState(createSaleSettlementsApi);
  const [ownerApi] = useState(createOwnerReportsApi);
  const refreshOptions = {
    refetchInterval: () =>
      online && document.visibilityState === 'visible' ? 60_000 : false,
    refetchOnWindowFocus: true,
  };
  const operational = useQuery({
    queryKey: privateKey(...['operational-dashboard', period, from, to]),
    queryFn: () => revenueApi.operational(from, to),
    ...refreshOptions,
  });
  const revenue = useQuery({
    queryKey: privateKey(...['dashboard-revenue', period, from, to, canAll]),
    queryFn: () =>
      canAll
        ? revenueApi.revenue(from, to, 'ALL')
        : revenueApi.mySummary(from, to),
    enabled: canAll || canOwn,
    ...refreshOptions,
  });
  const settlements = useQuery({
    queryKey: privateKey('dashboard-settlements', from, to, canAll),
    queryFn: () => settlementApi.report(from, to, canAll ? 'ALL' : 'OWN'),
    enabled: canAll || canOwn,
    ...refreshOptions,
  });
  const owner = useQuery({
    queryKey: privateKey(...['dashboard-owner', period, from, to]),
    queryFn: () => ownerApi.owner(from, to),
    enabled: canProfit,
    gcTime: 0,
    ...refreshOptions,
  });
  const refresh = () => {
    void operational.refetch();
    if (canAll || canOwn) {
      void revenue.refetch();
      void settlements.refetch();
    }
    if (canProfit) void owner.refetch();
  };
  return { operational, revenue, owner, settlements, refresh };
}
