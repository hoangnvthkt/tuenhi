import { hasCheckoutChanged } from '../model/checkout-confirmation';
import { calculatePosTotals } from '../model/pos-totals';
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { refreshOperationalData } from '@/shared/api/refresh-operational-data';
import {
  FINANCIAL_COMMAND_MARKERS_CHANGED_EVENT,
  FinancialBusinessError,
  FinancialOutcomeUnknownError,
  FinancialStorageUnavailableError,
  findPendingFinancialCommand,
  getFinancialCorrelationId,
} from '@/shared/api/financial-command';
import { useFinancialCommand } from '@/shared/hooks/use-financial-command';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { createPaymentProofApi } from '@/features/payments';
import type { SalesApi } from '../api/sales-api';
import type { DraftPrint, Sale } from '../api/sales-schemas';
import type { PosCartItem, PosPaymentMethod } from '../model/pos-types';
import {
  posCartStorageKey,
  removePosCartSnapshot,
  type PosCartIdentity,
} from '../model/pos-storage';

export function usePosCommands({
  api,
  online,
  userId,
  saleId,
  draft,
  items,
  customerId,
  channelId,
  orderDiscount,
  note,
  canDiscount,
  payment,
  setDraft,
  setItems,
  setPayment,
}: {
  api: SalesApi;
  online: boolean;
  userId?: string;
  saleId?: string;
  draft: Sale | null;
  items: PosCartItem[];
  customerId: string;
  channelId: string;
  orderDiscount: string;
  note: string;
  canDiscount: boolean;
  payment: PosPaymentMethod | null;
  setDraft: Dispatch<SetStateAction<Sale | null>>;
  setItems: Dispatch<SetStateAction<PosCartItem[]>>;
  setPayment: Dispatch<SetStateAction<PosPaymentMethod | null>>;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const runFinancialCommand = useFinancialCommand(userId);
  const payingRef = useRef(false);
  const [paying, setPaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preparingPrint, setPreparingPrint] = useState(false);
  const [provisionalDocument, setProvisionalDocument] =
    useState<DraftPrint | null>(null);
  const [paymentProofApi] = useState(createPaymentProofApi);
  const cartIdentity: PosCartIdentity = saleId
    ? { kind: 'DRAFT', saleId }
    : { kind: 'NEW' };

  const originalAttempt = useRef<{
    sale: Sale;
    method: PosPaymentMethod;
    invoke: (key: string) => ReturnType<SalesApi['complete']>;
    proofPath?: string;
    key?: string;
    userId?: string;
  } | null>(null);
  const [awaitingOutcome, setAwaitingOutcome] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<{
    total: string;
    method: PosPaymentMethod;
  } | null>(null);
  const pendingIdentity = {
    userId: userId ?? '',
    commandName: 'sale.complete' as const,
    entityId: draft?.id ?? saleId ?? '',
  };
  const readPending = () =>
    pendingIdentity.userId && pendingIdentity.entityId
      ? findPendingFinancialCommand(pendingIdentity)
      : undefined;
  let checkoutPending = awaitingOutcome;
  try {
    checkoutPending ||= Boolean(readPending());
  } catch {
    /* Commands surface storage errors. */
  }
  useEffect(() => {
    const update = () => {
      if (!userId || !(draft?.id ?? saleId)) return;
      try {
        if (
          findPendingFinancialCommand({
            userId,
            commandName: 'sale.complete',
            entityId: draft?.id ?? saleId!,
          })
        )
          setAwaitingOutcome(true);
      } catch {
        /* A command will report the storage error. */
      }
    };
    window.addEventListener(FINANCIAL_COMMAND_MARKERS_CHANGED_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(
        FINANCIAL_COMMAND_MARKERS_CHANGED_EVENT,
        update,
      );
      window.removeEventListener('storage', update);
    };
  }, [userId, draft?.id, saleId]);

  const clearLocalCart = () => {
    if (!userId) return;
    removePosCartSnapshot(userId, cartIdentity);
    try {
      localStorage.removeItem(posCartStorageKey(userId));
    } catch {
      // A stale legacy cart must not turn a confirmed server action into an error.
    }
  };

  const save = async () => {
    try {
      if (checkoutPending || readPending()) return null;
    } catch {
      toast.show({
        kind: 'error',
        title: 'Chưa thể lưu',
        message: new FinancialStorageUnavailableError().message,
      });
      return null;
    }
    if (!online) {
      toast.show({
        kind: 'info',
        title: 'Đang ngoại tuyến',
        message:
          'Giỏ hàng được giữ trên thiết bị. Vui lòng kết nối lại để lưu tạm.',
      });
      return null;
    }
    if (!channelId || !items.length) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể lưu',
        message: 'Vui lòng chọn kênh bán và ít nhất một sản phẩm.',
      });
      return null;
    }
    setSaving(true);
    try {
      const result = await api.saveDraft({
        saleId: draft?.id,
        expectedVersion: draft?.version,
        customerId: customerId || undefined,
        channelId,
        lines: items.map((item, index) => ({
          productId: item.productId,
          quantity: item.quantity,
          lineDiscountAmount: canDiscount ? item.lineDiscountAmount : '0',
          lineOrder: index,
        })),
        orderDiscount: canDiscount ? orderDiscount : '0',
        note,
        idempotencyKey: crypto.randomUUID(),
      });
      setDraft(result.sale);
      setItems(
        result.sale.lines.map((line) => ({
          ...line,
          onHandQty:
            items.find((item) => item.productId === line.productId)
              ?.onHandQty ?? '0',
        })),
      );
      if (!saleId) {
        clearLocalCart();
        navigate(`/pos/${result.sale.id}`, { replace: true });
      }
      await refreshOperationalData(queryClient);
      toast.show({
        kind: 'success',
        title: 'Đã lưu tạm',
        message: 'Giỏ hàng đã được lưu an toàn trên máy chủ.',
      });
      return result.sale;
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Không thể lưu tạm',
        message: error instanceof Error ? error.message : 'Vui lòng thử lại.',
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const preparePrint = async () => {
    if (saving || preparingPrint) return;
    setPreparingPrint(true);
    setProvisionalDocument(null);
    try {
      const saved = await save();
      if (!saved) return;
      setProvisionalDocument(await api.draftPrint(saved.id));
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Không thể mở phiếu tạm tính',
        message: error instanceof Error ? error.message : 'Vui lòng thử lại.',
      });
    } finally {
      setPreparingPrint(false);
    }
  };

  const pay = async (proofFile?: File) => {
    if (!payment || payingRef.current || saving || preparingPrint) return;
    let pendingCompletion;
    try {
      pendingCompletion =
        userId && draft
          ? findPendingFinancialCommand({
              userId,
              commandName: 'sale.complete',
              entityId: draft.id,
            })
          : undefined;
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể thanh toán',
        message:
          error instanceof FinancialStorageUnavailableError
            ? error.message
            : 'Không thể kiểm tra mã yêu cầu đã lưu trên thiết bị.',
      });
      return;
    }
    if (pendingCompletion || checkoutPending) {
      setAwaitingOutcome(true);
      setPayment(null);
      toast.show({
        kind: 'info',
        title: 'Cần đối soát giao dịch trước',
        message:
          'Giữ nguyên giao dịch đã gửi. Chọn Đối soát giao dịch để kiểm tra kết quả.',
      });
      return;
    }
    if (!online) {
      toast.show({
        kind: 'info',
        title: 'Đang ngoại tuyến',
        message: 'Không thể thanh toán khi mất kết nối.',
      });
      return;
    }
    if (payment === 'BANK_TRANSFER' && !proofFile && !pendingCompletion) {
      toast.show({
        kind: 'error',
        title: 'Thiếu ảnh chứng từ',
        message: 'Cần ảnh chứng từ chuyển khoản để xác nhận.',
      });
      return;
    }
    const confirmed = {
      customerId: customerId || null,
      channelId,
      orderDiscount,
      netTotal: calculatePosTotals(items, orderDiscount).total,
      lines: items.map((line) => ({ ...line })),
    };
    payingRef.current = true;
    setPaying(true);
    let transferProofPath: string | undefined;
    try {
      const saved = await save();
      if (!saved) return;
      if (hasCheckoutChanged(confirmed, saved)) {
        toast.show({
          kind: 'info',
          title: 'Cần xác nhận lại',
          message: 'Giá đã thay đổi. Vui lòng kiểm tra và xác nhận lại.',
        });
        return;
      }
      const attempt = {
        sale: saved,
        method: payment,
        proofPath: undefined as string | undefined,
        key: undefined as string | undefined,
        userId,
        invoke: async (idempotencyKey: string) => {
          attempt.key = idempotencyKey;
          if (payment === 'BANK_TRANSFER' && proofFile && !attempt.proofPath) {
            try {
              attempt.proofPath = (
                await paymentProofApi.upload({
                  transaction: { kind: 'sale', id: saved.id },
                  file: proofFile,
                })
              ).objectPath;
              transferProofPath = attempt.proofPath;
            } catch {
              throw new FinancialBusinessError(
                'Không thể tải ảnh chứng từ. Giao dịch chưa được gửi.',
              );
            }
          }
          return api.complete(
            saved.id,
            saved.version,
            payment,
            idempotencyKey,
            attempt.proofPath,
          );
        },
      };
      originalAttempt.current = attempt;
      setPendingPayment({ total: saved.netTotal, method: payment });
      const completed = await runFinancialCommand({
        commandName: 'sale.complete',
        entityId: saved.id,
        invoke: attempt.invoke,
        parseCachedResponse: api.parseCompleteResponse,
      });
      originalAttempt.current = null;
      setAwaitingOutcome(false);
      clearLocalCart();
      await refreshOperationalData(queryClient);
      toast.show({
        kind: 'success',
        title: 'Thanh toán thành công',
        message: `Đã hoàn tất hóa đơn ${completed.saleNumber}.`,
      });
      navigate(`/sales/${completed.saleId}`);
    } catch (error) {
      if (error instanceof FinancialOutcomeUnknownError)
        setAwaitingOutcome(true);
      else originalAttempt.current = null;
      if (transferProofPath && error instanceof FinancialBusinessError) {
        try {
          await paymentProofApi.remove(transferProofPath);
        } catch {
          // A later protected cleanup may delete only an unattached proof.
        }
      }
      toast.show({
        kind: 'error',
        title: 'Chưa thể thanh toán',
        message:
          error instanceof Error
            ? error.message
            : 'Vui lòng kiểm tra lại giỏ hàng.',
        requestId:
          error instanceof FinancialOutcomeUnknownError
            ? error.requestId
            : undefined,
        correlationId: getFinancialCorrelationId(error),
      });
    } finally {
      payingRef.current = false;
      setPaying(false);
      setPayment(null);
    }
  };

  const reconcilePayment = async () => {
    if (payingRef.current || !online) return;
    payingRef.current = true;
    setPaying(true);
    setPayment(null);
    try {
      const pending = readPending();
      if (!pending) {
        navigate(`/sales/${draft?.id ?? saleId}`);
        return;
      }
      const original = originalAttempt.current;
      const attempt =
        original?.userId === userId &&
        original?.sale.id === pending.entityId &&
        original?.key === pending.idempotencyKey
          ? original
          : null;
      const completed = await runFinancialCommand({
        commandName: 'sale.complete',
        entityId: pending.entityId,
        resumeOnly: true,
        retryPending: Boolean(attempt && attempt.sale.id === pending.entityId),
        invoke:
          attempt?.invoke ??
          (async () => {
            throw new FinancialOutcomeUnknownError(pending.idempotencyKey);
          }),
        parseCachedResponse: api.parseCompleteResponse,
      });
      originalAttempt.current = null;
      setAwaitingOutcome(false);
      clearLocalCart();
      await refreshOperationalData(queryClient);
      toast.show({
        kind: 'success',
        title: 'Đã xác định kết quả thanh toán',
        message: `Đã hoàn tất hóa đơn ${completed.saleNumber}.`,
      });
      navigate(`/sales/${completed.saleId}`);
    } catch (error) {
      if (error instanceof FinancialBusinessError) {
        const path = originalAttempt.current?.proofPath;
        if (path)
          try {
            await paymentProofApi.remove(path);
          } catch {
            /* Protected cleanup can retry. */
          }
        originalAttempt.current = null;
        setAwaitingOutcome(false);
      }
      toast.show({
        kind: 'error',
        title: 'Chưa hoàn tất đối soát',
        message: error instanceof Error ? error.message : 'Vui lòng thử lại.',
        requestId:
          error instanceof FinancialOutcomeUnknownError
            ? error.requestId
            : undefined,
      });
    } finally {
      payingRef.current = false;
      setPaying(false);
    }
  };

  const discard = async () => {
    if (!draft || !online || checkoutPending || readPending()) return;
    try {
      await api.discardDraft(draft.id, draft.version, crypto.randomUUID());
      clearLocalCart();
      await refreshOperationalData(queryClient);
      navigate('/pos');
      toast.show({ kind: 'success', title: 'Đã bỏ nháp' });
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Không thể bỏ nháp',
        message: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return {
    discard,
    checkoutPending,
    reconcilePayment,
    pendingPayment,
    pay,
    save,
    preparePrint,
    provisionalDocument,
    closePrint: () => setProvisionalDocument(null),
    saving: saving || preparingPrint || paying,
  };
}
