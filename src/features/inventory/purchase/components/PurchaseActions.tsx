import type { PurchaseApi } from '../api/purchase-api';
import type { PurchaseReceipt } from '../api/purchase-schemas';
import { useFinancialCommand } from '@/shared/hooks/use-financial-command';

export function PurchaseActions({
  api,
  receipt,
  costs,
  editable,
  canDraft,
  canPost,
  online,
  busy,
  onSave,
  onPerform,
  userId,
}: {
  api: PurchaseApi;
  receipt: PurchaseReceipt | null;
  costs: Record<string, string>;
  editable: boolean;
  canDraft: boolean;
  canPost: boolean;
  online: boolean;
  busy: boolean;
  onSave: () => Promise<void>;
  onPerform: (
    action: () => Promise<unknown>,
    success: string,
    redirect?: boolean,
  ) => Promise<void>;
  userId?: string;
}) {
  const runFinancialCommand = useFinancialCommand(userId);
  return (
    <div className="sticky bottom-20 z-20 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg lg:static lg:border-0 lg:bg-slate-50 lg:p-0 lg:py-2 lg:shadow-none">
      {editable && canDraft ? (
        <button
          disabled={!online || busy}
          onClick={() => void onSave()}
          className="min-h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Lưu nháp
        </button>
      ) : null}
      {receipt?.status === 'DRAFT' && canDraft ? (
        <button
          disabled={!online || busy}
          onClick={() =>
            void onPerform(
              () => api.command('submit', receipt.id, receipt.version),
              'Đã gửi phiếu chờ nhập giá',
            )
          }
          className="min-h-11 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Gửi owner nhập giá
        </button>
      ) : null}
      {receipt?.status === 'AWAITING_COST' && canPost ? (
        <button
          disabled={
            !online || busy || receipt.lines.some((line) => !costs[line.id])
          }
          onClick={() =>
            void onPerform(
              () =>
                runFinancialCommand({
                  commandName: 'purchase.post',
                  entityId: receipt.id,
                  invoke: (idempotencyKey) =>
                    api.post(
                      receipt.id,
                      receipt.version,
                      receipt.lines.map((line) => ({
                        lineId: line.id,
                        unitCost: costs[line.id] ?? '',
                      })),
                      idempotencyKey,
                    ),
                  parseCachedResponse: api.parseMutationResponse,
                }),
              'Đã ghi sổ phiếu nhập',
            )
          }
          className="min-h-11 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Ghi sổ
        </button>
      ) : null}
      {receipt?.status === 'POSTED' && canPost ? (
        <button
          disabled={!online || busy}
          onClick={() =>
            void onPerform(
              () =>
                runFinancialCommand({
                  commandName: 'purchase.reverse',
                  entityId: receipt.id,
                  invoke: (idempotencyKey) =>
                    api.command(
                      'reverse',
                      receipt.id,
                      receipt.version,
                      'Owner đảo phiếu',
                      idempotencyKey,
                    ),
                  parseCachedResponse: api.parseMutationResponse,
                }),
              'Đã đảo phiếu nhập',
            )
          }
          className="min-h-11 rounded-lg border border-red-300 px-5 text-sm font-semibold text-red-800 disabled:opacity-50"
        >
          Đảo phiếu
        </button>
      ) : null}
      {receipt &&
      ['DRAFT', 'AWAITING_COST'].includes(receipt.status) &&
      canDraft ? (
        <button
          disabled={!online || busy}
          onClick={() =>
            void onPerform(
              () =>
                api.command(
                  'cancel',
                  receipt.id,
                  receipt.version,
                  'Người dùng hủy phiếu',
                ),
              'Đã hủy phiếu nhập',
              true,
            )
          }
          className="min-h-11 px-5 text-sm font-semibold text-red-700 disabled:opacity-50"
        >
          Hủy phiếu
        </button>
      ) : null}
    </div>
  );
}
