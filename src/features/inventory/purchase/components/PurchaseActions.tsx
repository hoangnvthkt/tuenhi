import type { PurchaseApi } from '../api/purchase-api';
import type { PurchaseReceipt } from '../api/purchase-schemas';
import { useFinancialCommand } from '@/shared/hooks/use-financial-command';
import { useState } from 'react';

export function PurchaseActions({
  api,
  receipt,
  costs,
  editable,
  canDraft,
  canPost,
  online,
  busy,
  dirty = false,
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
  dirty?: boolean;
  onSave: () => Promise<void>;
  onPerform: (
    action: () => Promise<unknown>,
    success: string,
    redirect?: boolean,
  ) => Promise<void>;
  userId?: string;
}) {
  const runFinancialCommand = useFinancialCommand(userId);
  const [reversing, setReversing] = useState(false);
  const [reverseReason, setReverseReason] = useState('');
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
      {receipt?.status === 'DRAFT' && canPost ? (
        canPost ? (
          <button
            disabled={!online || busy || dirty}
            onClick={() =>
              void onPerform(
                () =>
                  runFinancialCommand({
                    commandName: 'purchase.post',
                    entityId: receipt.id,
                    invoke: (idempotencyKey) =>
                      api.post(receipt.id, receipt.version, idempotencyKey),
                    parseCachedResponse: api.parseMutationResponse,
                  }),
                'Đã ghi sổ phiếu nhập',
              )
            }
            className="min-h-11 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Ghi sổ
          </button>
        ) : null
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
                    api.postLegacy(
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
        <>
          <button
            disabled={!online || busy}
            onClick={() => setReversing(true)}
            className="min-h-11 rounded-lg border border-red-300 px-5 text-sm font-semibold text-red-800 disabled:opacity-50"
          >
            Đảo phiếu
          </button>
          {reversing ? (
            <section
              aria-label="Xác nhận đảo phiếu"
              className="w-full space-y-3 rounded-lg border border-red-200 bg-red-50 p-4"
            >
              <p className="text-sm text-red-900">
                Đảo phiếu sẽ giảm tồn kho và giá trị nhập tương ứng. Chỉ tiếp
                tục khi phiếu đủ điều kiện đảo.
              </p>
              <label className="block text-sm font-semibold">
                Lý do đảo phiếu
                <textarea
                  maxLength={500}
                  value={reverseReason}
                  disabled={busy}
                  onChange={(event) => setReverseReason(event.target.value)}
                  className="mt-2 min-h-20 w-full rounded-lg border border-red-200 bg-white p-3"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => setReversing(false)}
                className="min-h-11 px-3 text-sm font-semibold"
              >
                Quay lại
              </button>
              <button
                type="button"
                disabled={!online || busy || !reverseReason.trim()}
                onClick={() => {
                  if (!reverseReason.trim()) return;
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
                            reverseReason.trim(),
                            idempotencyKey,
                          ),
                        parseCachedResponse: api.parseMutationResponse,
                      }),
                    'Đã đảo phiếu nhập',
                  );
                }}
                className="min-h-11 rounded-lg border border-red-600 px-4 text-sm font-semibold text-red-800 disabled:opacity-50"
              >
                Xác nhận đảo phiếu
              </button>
            </section>
          ) : null}
        </>
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
