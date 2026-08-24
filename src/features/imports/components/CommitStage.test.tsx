import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { CommitStage } from './CommitStage';

describe('CommitStage opening balances', () => {
  it('states that Excel creates a draft and links to the opening document', () => {
    render(
      <MemoryRouter>
        <CommitStage
          target="OPENING_BALANCES"
          mode="CREATE_ONLY"
          fileName="opening-balances-v1.xlsx"
          totalRows={2}
          importRunId="10000000-0000-4000-8000-000000000001"
          isOnline
          isBusy={false}
          errorMessage={null}
          onCommit={vi.fn()}
          result={{
            importRunId: '10000000-0000-4000-8000-000000000001',
            targetType: 'OPENING_BALANCES',
            createdRows: 2,
            updatedRows: 0,
            totalRows: 2,
            stockCountId: '10000000-0000-4000-8000-000000000002',
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Tồn kho chưa thay đổi/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Kiểm tra phiếu mở sổ' }),
    ).toHaveAttribute(
      'href',
      '/more/inventory/opening/10000000-0000-4000-8000-000000000002',
    );
  });

  it('locks commit while offline and explains there is no automatic retry', () => {
    render(
      <MemoryRouter>
        <CommitStage
          target="OPENING_BALANCES"
          mode="CREATE_ONLY"
          fileName="opening-balances-v1.xlsx"
          totalRows={1}
          importRunId="10000000-0000-4000-8000-000000000001"
          isOnline={false}
          isBusy={false}
          result={null}
          errorMessage={null}
          onCommit={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('button', { name: 'Nhập toàn bộ dữ liệu' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/không tự gửi khi có mạng lại/),
    ).toBeInTheDocument();
  });
});
