import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executeFinancialCommand,
  FinancialOutcomeUnknownError,
  FinancialTransportError,
  readPendingFinancialCommands,
} from '@/shared/api/financial-command';
import type { FinancialOutcomeApi } from '@/shared/api/financial-outcome-api';
import { ToastProvider } from './ToastProvider';
import { PendingFinancialCommandRecoveryBanner } from './PendingFinancialCommandRecoveryBanner';

const userId = '10000000-0000-4000-8000-000000000001';
const saleId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';

async function seedPending() {
  await expect(
    executeFinancialCommand({
      userId,
      commandName: 'sale.complete',
      entityId: saleId,
      createId: () => requestId,
      now: () => new Date('2026-08-31T07:00:00.000Z'),
      invoke: async () => {
        throw new FinancialTransportError();
      },
      lookup: async () => ({ status: 'NOT_FOUND', response: null }),
      parseCachedResponse: (response) => response as never,
      isOnline: () => false,
      wait: async () => undefined,
    }),
  ).rejects.toBeInstanceOf(FinancialOutcomeUnknownError);
}

function renderBanner({
  online = true,
  lookup,
}: {
  online?: boolean;
  lookup: FinancialOutcomeApi['lookup'];
}) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <PendingFinancialCommandRecoveryBanner
            userId={userId}
            online={online}
            outcomeApi={{ lookup }}
          />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => localStorage.clear());

describe('PendingFinancialCommandRecoveryBanner', () => {
  it('keeps a NOT_FOUND marker visible with its request ID and document route', async () => {
    await seedPending();
    const lookup = vi
      .fn<FinancialOutcomeApi['lookup']>()
      .mockResolvedValue({ status: 'NOT_FOUND', response: null });

    renderBanner({ lookup });

    expect(
      await screen.findByText('Có giao dịch cần đối soát'),
    ).toBeInTheDocument();
    expect(screen.getByText(requestId)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở chứng từ' })).toHaveAttribute(
      'href',
      `/sales/${saleId}`,
    );
    expect(lookup).toHaveBeenCalledWith('sale.complete', requestId);
  });

  it('removes a validated RESOLVED marker and shows a routed success toast', async () => {
    await seedPending();
    const lookup = vi.fn<FinancialOutcomeApi['lookup']>().mockResolvedValue({
      status: 'RESOLVED',
      response: {
        ok: true,
        data: { saleId },
        error: null,
        correlationId: '40000000-0000-4000-8000-000000000001',
      },
    });

    renderBanner({ lookup });

    expect(
      await screen.findByText('Đã xác định kết quả giao dịch'),
    ).toBeInTheDocument();
    expect(readPendingFinancialCommands()).toEqual([]);
    expect(
      screen.queryByText('Có giao dịch cần đối soát'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở chứng từ' })).toHaveAttribute(
      'href',
      `/sales/${saleId}`,
    );
  });

  it('does not lookup while offline and reconciles when connectivity returns', async () => {
    await seedPending();
    const lookup = vi
      .fn<FinancialOutcomeApi['lookup']>()
      .mockResolvedValue({ status: 'NOT_FOUND', response: null });
    const rendered = renderBanner({ online: false, lookup });

    expect(
      await screen.findByText('Có giao dịch cần đối soát'),
    ).toBeInTheDocument();
    expect(lookup).not.toHaveBeenCalled();

    rendered.rerender(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <ToastProvider>
            <PendingFinancialCommandRecoveryBanner
              userId={userId}
              online
              outcomeApi={{ lookup }}
            />
          </ToastProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(lookup).toHaveBeenCalledOnce());
  });

  it('lets the user request another read-only reconciliation', async () => {
    const user = userEvent.setup();
    await seedPending();
    const lookup = vi
      .fn<FinancialOutcomeApi['lookup']>()
      .mockResolvedValue({ status: 'NOT_FOUND', response: null });
    renderBanner({ lookup });
    await screen.findByText('Có giao dịch cần đối soát');
    lookup.mockClear();

    await user.click(screen.getByRole('button', { name: 'Đối soát lại' }));

    await waitFor(() => expect(lookup).toHaveBeenCalledOnce());
  });
});
