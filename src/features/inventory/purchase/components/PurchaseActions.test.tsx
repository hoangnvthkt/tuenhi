import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '@/shared/testing/render-with-query-client';
import type { PurchaseApi } from '../api/purchase-api';
import type { PurchaseReceipt } from '../api/purchase-schemas';
import { PurchaseActions } from './PurchaseActions';

const receipt: PurchaseReceipt = {
  id: '10000000-0000-4000-8000-000000000001',
  receiptNumber: 'PN000001',
  status: 'DRAFT',
  supplierId: null,
  supplierName: null,
  receivedAt: '2026-09-08T08:00:00.000Z',
  note: null,
  createdBy: '10000000-0000-4000-8000-000000000002',
  createdByName: 'Người lập',
  submittedByName: null,
  postedByName: null,
  reversedByName: null,
  cancelledByName: null,
  submittedAt: null,
  postedAt: null,
  reversedAt: null,
  cancelledAt: null,
  reverseReason: null,
  cancelReason: null,
  version: 1,
  createdAt: '2026-09-08T08:00:00.000Z',
  updatedAt: '2026-09-08T08:00:00.000Z',
  lines: [],
};

describe('PurchaseActions', () => {
  it('shows direct posting for a post-permitted user even without draft editing permission', () => {
    renderWithQueryClient(
      <PurchaseActions
        api={{} as PurchaseApi}
        receipt={receipt}
        costs={{}}
        editable={false}
        canDraft={false}
        canPost
        online
        busy={false}
        onSave={vi.fn()}
        onPerform={vi.fn()}
        userId={receipt.createdBy}
      />,
    );

    expect(screen.getByRole('button', { name: 'Ghi sổ' })).toBeEnabled();
  });
});
