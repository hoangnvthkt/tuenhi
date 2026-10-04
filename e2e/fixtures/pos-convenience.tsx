import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CartPanel } from '../../src/features/sales/components/CartPanel';
import { CheckoutDialog } from '../../src/features/sales/components/CheckoutDialog';
import type { PosPaymentMethod } from '../../src/features/sales/model/pos-types';
import '../../src/styles/index.css';
const initial = Array.from({ length: 20 }, (_, i) => ({
  productId: `p${i}`,
  productName: `Sản phẩm ${i + 1}`,
  sku: `SP${i + 1}`,
  unitName: 'hộp',
  quantity: '1',
  unitSalePrice: '13700',
  lineDiscountAmount: '0',
  onHandQty: '50',
  lineOrder: i,
}));
export function Demo() {
  const [items, setItems] = useState(initial);
  const [payment, setPayment] = useState<PosPaymentMethod | null>(null);
  const [confirmed, setConfirmed] = useState(0);
  return (
    <QueryClientProvider client={new QueryClient()}>
      <main className="mx-auto max-w-xl p-4 pb-40">
        <h1>Quầy kiểm thử local</h1>
        <input id="pos-product-search" aria-label="Tìm hàng" />
        <CartPanel
          items={items}
          channels={[]}
          customers={[]}
          channelId=""
          customerId=""
          orderDiscount="0"
          note=""
          subtotal="274000"
          discountTotal="0"
          total="274000"
          canDiscount
          online
          saving={false}
          onUpdateLine={(id, field, value) =>
            setItems(
              items.map((i) =>
                i.productId === id ? { ...i, [field]: value } : i,
              ),
            )
          }
          onRemoveLine={(id) =>
            setItems(items.filter((i) => i.productId !== id))
          }
          onChannelChange={() => {}}
          onCustomerChange={() => {}}
          onOrderDiscountChange={() => {}}
          onNoteChange={() => {}}
          onSave={() => {}}
          onPrint={() => {}}
          onCheckout={() => setPayment('CASH')}
        />
        <output aria-label="Số lần xác nhận">{confirmed}</output>
        {payment ? (
          <CheckoutDialog
            payment={payment}
            total="274000"
            saving={false}
            onPaymentChange={setPayment}
            onCancel={() => setPayment(null)}
            onConfirm={() => {
              setConfirmed(confirmed + 1);
              setPayment(null);
            }}
          />
        ) : null}
      </main>
      <nav
        aria-label="Điều hướng thử"
        className="fixed bottom-0 left-0 right-0 z-10 h-16 border-t bg-white"
      >
        <button>Hàng hóa</button>
      </nav>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Demo />);
