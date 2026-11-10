import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { usePrivateQueryKey, useSession } from '@/features/auth';
import { formatReportMoney } from '@/features/reports';
import { useFinancialCommand } from '@/shared/hooks/use-financial-command';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { ViNumberInput } from '@/shared/ui/forms/ViNumberInput';
import { FinancialOutcomeUnknownError } from '@/shared/api/financial-command';
import {
  createSupplierDebtApi,
  type SupplierDebt,
} from '../api/supplier-debt-api';
import { isPositiveMoney } from '../model/supplier-money';
import { formatDay, invalidateSupplierQueries } from '../model/supplier-ui';

const entryLabel: Record<SupplierDebt['entries'][number]['kind'], string> = {
  RECEIPT_POSTED: 'Ghi sổ',
  RECEIPT_REVERSED: 'Đảo',
  OPENING: 'Nợ đầu kỳ',
  PAYMENT: 'Trả NCC',
  PURCHASE_RETURN: 'Trả hàng',
};
const daysSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | null;
  sub?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="text-sm text-slate-600">{label}</span>
      {value === null ? (
        <span
          role="status"
          aria-label={`Đang tải ${label.toLowerCase()}`}
          className="h-7 w-28 animate-pulse rounded bg-slate-200"
        />
      ) : (
        <span className="text-xl font-bold tabular-nums text-slate-950">
          {value}
        </span>
      )}
      {sub ? <span className="text-sm text-slate-600">{sub}</span> : null}
    </div>
  );
}

export function SupplierDebtPage() {
  const { session } = useSession();
  const privateKey = usePrivateQueryKey();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const toast = useToast();
  const run = useFinancialCommand(session?.userId);
  const [api] = useState(createSupplierDebtApi);
  const [params, setParams] = useSearchParams();
  const can = (code: string) => session?.permissions.includes(code) ?? false;
  const list = useQuery({
    queryKey: privateKey('supplier-debts'),
    queryFn: () => api.debts(),
  });
  const parsed = z.uuid().safeParse(params.get('supplier'));
  const supplierId = parsed.success
    ? parsed.data
    : (list.data?.items[0]?.supplierId ?? null);
  const detail = useQuery({
    queryKey: privateKey('supplier-debts', supplierId),
    queryFn: () => api.debt(supplierId!),
    enabled: Boolean(supplierId),
  });
  const [opening, setOpening] = useState({ amount: '', note: '' });
  const [busy, setBusy] = useState(false);
  const summary = list.data?.summary;
  const debt = detail.data;

  async function saveOpening() {
    if (!supplierId || busy) return;
    setBusy(true);
    try {
      await run({
        commandName: 'supplier.debt.opening',
        entityId: supplierId,
        invoke: (idempotencyKey) =>
          api.setOpening({
            supplierId,
            amount: opening.amount,
            note: opening.note.trim(),
            idempotencyKey,
          }),
        parseCachedResponse: api.parseMutation,
      });
      toast.show({ kind: 'success', title: 'Đã lưu nợ đầu kỳ' });
      setOpening({ amount: '', note: '' });
      await invalidateSupplierQueries(queryClient);
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể lưu nợ đầu kỳ',
        message: error instanceof Error ? error.message : undefined,
        requestId:
          error instanceof FinancialOutcomeUnknownError
            ? error.requestId
            : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Công nợ nhà cung cấp
        </h1>
        <div className="flex flex-wrap gap-2">
          {can('inventory.writeoff.post') ? (
            <Link
              to="/more/write-offs"
              className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
            >
              Xuất hủy
            </Link>
          ) : null}
          {can('purchase.return.post') ? (
            <Link
              to="/more/purchases?status=POSTED"
              className="inline-flex min-h-11 items-center rounded-lg border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-800"
            >
              Trả hàng nhập
            </Link>
          ) : null}
          {can('supplier.debt.pay') &&
          supplierId &&
          debt &&
          isPositiveMoney(debt.balance) ? (
            <Link
              to={`/more/supplier-debts/${supplierId}/pay`}
              className="inline-flex min-h-11 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white"
            >
              Trả nợ NCC
            </Link>
          ) : null}
        </div>
      </div>

      {list.isError ? (
        <p role="alert" className="text-sm text-red-800">
          Không tải được công nợ nhà cung cấp.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Phải trả NCC"
          value={summary ? formatReportMoney(summary.totalPayable) : null}
          sub={
            summary
              ? `${summary.supplierCount} nhà cung cấp · ${summary.openPayableCount} phiếu`
              : undefined
          }
        />
        <Stat
          label="Đã trả tháng này"
          value={summary ? formatReportMoney(summary.paidThisMonth) : null}
        />
        <Stat
          label="Hàng trả NCC tháng này"
          value={summary ? formatReportMoney(summary.returnedThisMonth) : null}
          sub={summary ? `${summary.returnCountThisMonth} phiếu` : undefined}
        />
      </div>

      {list.data ? (
        list.data.items.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            Chưa có công nợ nhà cung cấp.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="p-3 font-semibold">Nhà cung cấp</th>
                  <th className="hidden p-3 text-right font-semibold sm:table-cell">
                    Phiếu còn nợ
                  </th>
                  <th className="hidden p-3 font-semibold sm:table-cell">
                    Nợ cũ nhất
                  </th>
                  <th className="p-3 text-right font-semibold">Phải trả</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.data.items.map((item) => (
                  <tr
                    key={item.supplierId}
                    className={
                      item.supplierId === supplierId ? 'bg-teal-50' : ''
                    }
                  >
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => setParams({ supplier: item.supplierId })}
                        className="min-h-11 text-left font-semibold text-teal-800 underline"
                      >
                        {item.code} · {item.name}
                      </button>
                    </td>
                    <td className="hidden p-3 text-right tabular-nums sm:table-cell">
                      {item.openCount}
                    </td>
                    <td className="hidden p-3 tabular-nums sm:table-cell">
                      {item.oldestOpenAt
                        ? `${formatDay(item.oldestOpenAt)} (${daysSince(item.oldestOpenAt)} ngày)`
                        : '—'}
                    </td>
                    <td className="p-3 text-right font-bold tabular-nums">
                      {formatReportMoney(item.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : list.isPending ? (
        <div
          role="status"
          aria-label="Đang tải danh sách nhà cung cấp"
          className="h-24 animate-pulse rounded-2xl bg-slate-200"
        />
      ) : null}

      {debt ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section
            aria-label={`Phiếu còn nợ ${debt.supplier.name}`}
            className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
          >
            <h2 className="text-base font-semibold text-slate-950">
              Phiếu còn nợ · {debt.supplier.name}
            </h2>
            {debt.openPayables.length === 0 ? (
              <p className="text-sm text-slate-600">Không còn nợ.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-slate-600">
                  <tr>
                    <th className="py-2 font-semibold">Phiếu</th>
                    <th className="py-2 font-semibold">Ngày</th>
                    <th className="hidden py-2 text-right font-semibold sm:table-cell">
                      Tiền hàng
                    </th>
                    <th className="hidden py-2 text-right font-semibold sm:table-cell">
                      Đã trả
                    </th>
                    <th className="py-2 text-right font-semibold">Còn nợ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {debt.openPayables.map((payable) => (
                    <tr key={payable.payableId}>
                      <td className="py-2">
                        {payable.receiptId ? (
                          <Link
                            to={`/more/purchases/${payable.receiptId}`}
                            className="inline-flex min-h-11 items-center font-semibold text-teal-800 underline"
                          >
                            {payable.receiptNumber}
                          </Link>
                        ) : (
                          'Nợ đầu kỳ'
                        )}
                      </td>
                      <td className="py-2 tabular-nums">
                        {formatDay(payable.openedAt)}
                      </td>
                      <td className="hidden py-2 text-right tabular-nums sm:table-cell">
                        {formatReportMoney(payable.totalAmount)}
                      </td>
                      <td className="hidden py-2 text-right tabular-nums sm:table-cell">
                        {formatReportMoney(payable.paidAmount)}
                      </td>
                      <td className="py-2 text-right font-bold tabular-nums">
                        {formatReportMoney(payable.outstandingAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {can('supplier.debt.adjust') && !debt.hasOpening ? (
              <form
                aria-label="Nợ đầu kỳ"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveOpening();
                }}
                className="space-y-2 border-t border-slate-100 pt-3"
              >
                <h3 className="text-sm font-semibold text-slate-900">
                  Nhập nợ đầu kỳ
                </h3>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-sm font-medium text-slate-700">
                    Số nợ
                    <ViNumberInput
                      maxFractionDigits={2}
                      value={opening.amount}
                      onChange={(amount) => setOpening({ ...opening, amount })}
                      className="mt-1 block min-h-11 w-40 rounded-lg border border-slate-300 px-3 text-right tabular-nums"
                    />
                  </label>
                  <label className="min-w-48 flex-1 text-sm font-medium text-slate-700">
                    Lý do
                    <input
                      value={opening.note}
                      onChange={(event) =>
                        setOpening({ ...opening, note: event.target.value })
                      }
                      maxLength={500}
                      className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={
                      !online ||
                      busy ||
                      !isPositiveMoney(opening.amount) ||
                      !opening.note.trim()
                    }
                    className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Lưu nợ đầu kỳ
                  </button>
                </div>
              </form>
            ) : null}
          </section>
          <section
            aria-label={`Lịch sử công nợ ${debt.supplier.name}`}
            className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
          >
            <h2 className="text-base font-semibold text-slate-950">
              Lịch sử công nợ · {debt.supplier.name}
            </h2>
            <table className="w-full text-sm">
              <thead className="text-left text-slate-600">
                <tr>
                  <th className="py-2 font-semibold">Ngày</th>
                  <th className="py-2 font-semibold">Nội dung</th>
                  <th className="py-2 text-right font-semibold">Phát sinh</th>
                  <th className="hidden py-2 text-right font-semibold sm:table-cell">
                    Còn nợ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {debt.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2 tabular-nums">
                      {formatDay(entry.occurredAt)}
                    </td>
                    <td className="py-2">
                      {entryLabel[entry.kind]}{' '}
                      {entry.receiptId ? (
                        <Link
                          to={`/more/purchases/${entry.receiptId}`}
                          className="font-semibold text-teal-800 underline"
                        >
                          {entry.returnNumber ?? entry.receiptNumber}
                        </Link>
                      ) : null}
                      {entry.note ? (
                        <p className="text-xs text-slate-500">{entry.note}</p>
                      ) : null}
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums ${entry.delta.startsWith('-') ? 'text-emerald-700' : 'text-red-700'}`}
                    >
                      {entry.delta.startsWith('-') ? '' : '+'}
                      {formatReportMoney(entry.delta)}
                    </td>
                    <td className="hidden py-2 text-right tabular-nums sm:table-cell">
                      {formatReportMoney(entry.balanceAfter)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : detail.isError ? (
        <p role="alert" className="text-sm text-red-800">
          Không tải được chi tiết nhà cung cấp.
        </p>
      ) : null}
    </section>
  );
}
