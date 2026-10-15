import { createRoot } from 'react-dom/client';
import { ProductPicker } from '../../src/features/sales/components/ProductPicker';
import { X, Files } from '@phosphor-icons/react';
import { calculatePosTotals } from '../../src/features/sales/model/pos-totals';
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
  const reference = new URLSearchParams(window.location.search).has(
    'reference',
  );
  const [items, setItems] = useState(
    reference
      ? [
          {
            ...initial[0]!,
            productName: '20b vàng nâu',
            unitSalePrice: '55000',
          },
        ]
      : initial,
  );
  const [search, setSearch] = useState('');
  const sample = {
    id: 'p0',
    name: '20b vàng nâu',
    sku: '20B',
    barcode: '893000000001',
    unitName: 'Hộp',
    onHandQty: '-3',
    currentSalePrice: '55000',
    categoryId: null,
    categoryName: null,
    isActive: true,
    version: 1,
    minStockQty: '0',
    primaryImagePath: null,
  };

  const [orderDiscount, setOrderDiscount] = useState('0');
  const [payment, setPayment] = useState<PosPaymentMethod | null>(null);
  const [confirmed, setConfirmed] = useState(0);
  return (
    <QueryClientProvider client={new QueryClient()}>
      <div className="app-shell pos-active">
        <main className="app-content">
          <main className="pos-page">
            <div className="pos-titlebar">
              <button
                type="button"
                className="pos-close"
                aria-label="Đóng bán hàng"
              >
                <X size={23} />
              </button>
              <h1 className="flex-1">Bán hàng</h1>
              <button type="button" className="pos-close" aria-label="Đơn nháp">
                <Files size={24} />
              </button>
            </div>
            <div className="pos-search-area">
              <ProductPicker
                search={search}
                resolvedSearch={search}
                products={search.trim() ? [sample] : []}
                isLoading={false}
                onSearchChange={setSearch}
                onExactLookup={async () => [sample]}
                onAdd={() =>
                  setItems([
                    ...items,
                    {
                      ...initial[0]!,
                      productId: `p${items.length}`,
                      productName: sample.name,
                      unitSalePrice: '55000',
                    },
                  ])
                }
                onCreate={() => setSearch('20B')}
              />
            </div>
            <CartPanel
              items={items}
              channels={[]}
              customers={[]}
              channelId=""
              customerId=""
              orderDiscount={orderDiscount}
              note=""
              {...calculatePosTotals(items, orderDiscount)}
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
              onOrderDiscountChange={setOrderDiscount}
              onNoteChange={() => {}}
              onSave={() => {}}
              onPrint={() => {}}
              onCheckout={() => setPayment('CASH')}
            />
            <output className="sr-only" aria-label="Số lần xác nhận">
              {confirmed}
            </output>
            {payment ? (
              <CheckoutDialog
                payment={payment}
                total={calculatePosTotals(items, orderDiscount).total}
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
        </main>
        <nav
          aria-label="Điều hướng thử"
          className="fixed bottom-0 left-0 right-0 z-10 h-16 border-t bg-white"
        >
          <button>Hàng hóa</button>
        </nav>
      </div>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Demo />);
