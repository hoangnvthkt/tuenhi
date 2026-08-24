import { useState, type Dispatch, type SetStateAction } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '@/shared/ui/feedback/use-toast';
import type { SalesApi } from '../api/sales-api';
import type { Sale } from '../api/sales-schemas';
import type { PosCartItem, PosPaymentMethod } from '../model/pos-types';
import { posCartStorageKey } from '../model/pos-storage';

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
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const save = async () => {
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
      if (!saleId) navigate(`/pos/${result.sale.id}`, { replace: true });
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

  const pay = async () => {
    if (!payment) return;
    if (!online) {
      toast.show({
        kind: 'info',
        title: 'Đang ngoại tuyến',
        message: 'Không thể thanh toán khi mất kết nối.',
      });
      return;
    }
    const saved = await save();
    if (!saved) return;
    setSaving(true);
    try {
      const completed = await api.complete(
        saved.id,
        saved.version,
        payment,
        crypto.randomUUID(),
      );
      if (userId) localStorage.removeItem(posCartStorageKey(userId));
      toast.show({
        kind: 'success',
        title: 'Thanh toán thành công',
        message: `Đã hoàn tất hóa đơn ${completed.saleNumber}.`,
      });
      navigate(`/sales/${completed.saleId}`);
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể thanh toán',
        message:
          error instanceof Error
            ? error.message
            : 'Vui lòng kiểm tra lại giỏ hàng.',
      });
    } finally {
      setSaving(false);
      setPayment(null);
    }
  };

  const discard = async () => {
    if (!draft || !online) return;
    try {
      await api.discardDraft(draft.id, draft.version, crypto.randomUUID());
      if (userId) localStorage.removeItem(posCartStorageKey(userId));
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

  return { discard, pay, save, saving };
}
