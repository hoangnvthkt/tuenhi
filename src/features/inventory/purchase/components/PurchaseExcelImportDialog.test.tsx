import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '@/shared/testing/render-with-query-client';
import { PurchaseExcelImportDialog } from './PurchaseExcelImportDialog';

const productId = '10000000-0000-4000-8000-000000000001';

describe('PurchaseExcelImportDialog', () => {
  it('only applies every imported line after the entire file validates', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const inspect = vi.fn().mockResolvedValue({
      target: 'PURCHASE_RECEIPT',
      version: 1,
      fileName: 'phieu-nhap.xlsx',
      fileSha256: 'hash',
      exactTemplate: true,
      headers: ['SKU', 'Số lượng nhận', 'Đơn giá nhập'],
      rows: [{ rowNumber: 2, cells: ['SP-001', '2', '12500'] }],
    });
    const resolveProducts = vi.fn().mockResolvedValue([
      {
        requestedSku: 'SP-001',
        productId,
        sku: 'SP-001',
        productName: 'Sản phẩm A',
        unitName: 'Hộp',
        isActive: true,
      },
    ]);

    renderWithQueryClient(
      <PurchaseExcelImportDialog
        existingProductIds={new Set()}
        inspect={inspect}
        resolveProducts={resolveProducts}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );

    await user.upload(
      screen.getByLabelText('Chọn file Excel'),
      new File(['workbook'], 'phieu-nhap.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );

    expect(await screen.findByText('Sản phẩm A')).toBeInTheDocument();
    const apply = screen.getByRole('button', { name: 'Nạp vào phiếu' });
    expect(apply).toBeEnabled();
    await user.click(apply);
    expect(onApply).toHaveBeenCalledWith([
      {
        productId,
        receivedQty: '2',
        unitCost: '12500',
        selectedSnapshot: { id: productId, name: 'Sản phẩm A', sku: 'SP-001' },
      },
    ]);
  });
});
