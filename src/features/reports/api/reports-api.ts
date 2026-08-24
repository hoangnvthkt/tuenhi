import { getBusinessErrorMessage } from '@/shared/api/command-error';
import {
  parseRpcEnvelope,
  type RpcErrorPayload,
} from '@/shared/api/rpc-envelope';
import { getSupabaseClient } from '@/shared/supabase/client';
import {
  operationalDashboardSchema,
  ownerDashboardSchema,
  profitPageSchema,
  revenueReportSchema,
  type OperationalDashboard,
  type OwnerDashboard,
  type ProfitPage,
  type RevenueReport,
} from './report-schemas';

export type { OperationalDashboard, OwnerDashboard, ProfitPage, RevenueReport };

export class ReportsApiError extends Error {
  constructor(
    readonly code: string,
    readonly correlationId: string,
    readonly details: Record<string, unknown>,
  ) {
    super(getBusinessErrorMessage(code));
    this.name = 'ReportsApiError';
  }
}

function parse<T>(
  schema: Parameters<typeof parseRpcEnvelope<T>>[0],
  value: unknown,
) {
  return parseRpcEnvelope(schema, value, {
    invalidMessage: 'Phản hồi báo cáo từ máy chủ không hợp lệ.',
    createBusinessError: (error: RpcErrorPayload, correlationId) =>
      new ReportsApiError(error.code, correlationId, error.details),
  });
}

function createRpc() {
  const client = getSupabaseClient();
  return async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name as never, args as never);
    if (error) throw new Error('Không thể kết nối máy chủ để tải báo cáo.');
    return data;
  };
}

export function createRevenueReportsApi() {
  const rpc = createRpc();
  return {
    operational(from: string, to: string): Promise<OperationalDashboard> {
      return rpc('get_operational_dashboard', { p_from: from, p_to: to }).then(
        (data) => parse(operationalDashboardSchema, data),
      );
    },
    mySummary(from: string, to: string): Promise<RevenueReport> {
      return rpc('get_my_sales_summary', { p_from: from, p_to: to }).then(
        (data) => parse(revenueReportSchema, data),
      );
    },
    revenue(
      from: string,
      to: string,
      scope: 'OWN' | 'ALL',
    ): Promise<RevenueReport> {
      return rpc('get_revenue_report', {
        p_from: from,
        p_to: to,
        p_scope: scope,
      }).then((data) => parse(revenueReportSchema, data));
    },
  };
}

export function createOwnerReportsApi() {
  const rpc = createRpc();
  return {
    owner(from: string, to: string): Promise<OwnerDashboard> {
      return rpc('get_owner_dashboard', { p_from: from, p_to: to }).then(
        (data) => parse(ownerDashboardSchema, data),
      );
    },
    profit(
      from: string,
      to: string,
      cursor?: { occurredAt: string; id: string } | null,
    ): Promise<ProfitPage> {
      return rpc('get_profit_report', {
        p_from: from,
        p_to: to,
        p_cursor_occurred_at: cursor?.occurredAt ?? null,
        p_cursor_id: cursor?.id ?? null,
        p_limit: 50,
      }).then((data) => parse(profitPageSchema, data));
    },
  };
}

export function createReportsApi() {
  return { ...createRevenueReportsApi(), ...createOwnerReportsApi() };
}
