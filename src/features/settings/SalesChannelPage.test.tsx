import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import type {
  DirectoryApi,
  SalesChannelItem,
} from '../directories/directory-api';
import { SalesChannelPage } from './SalesChannelPage';

const channels: SalesChannelItem[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    code: 'IN_STORE',
    name: 'Tại quầy',
    sortOrder: 10,
    isActive: true,
    version: 1,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    code: 'ONLINE',
    name: 'Online',
    sortOrder: 30,
    isActive: true,
    version: 1,
  },
];

function createApi(overrides: Partial<DirectoryApi> = {}): DirectoryApi {
  return {
    listSuppliers: vi.fn(),
    listCustomers: vi.fn(),
    listSalesChannels: vi.fn().mockResolvedValue(channels),
    saveSupplier: vi.fn(),
    saveCustomer: vi.fn(),
    saveSalesChannel: vi.fn().mockResolvedValue({ channelId: channels[0]!.id }),
    ...overrides,
  };
}

function renderPage(api: DirectoryApi, isOnline = true) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ToastProvider>
        <SalesChannelPage api={api} isOnline={isOnline} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('SalesChannelPage', () => {
  it('shows seeded channels in configured order and never exposes delete', async () => {
    renderPage(createApi());
    const rows = await screen.findAllByTestId(/sales-channel-row/);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Tại quầy'),
      expect.stringContaining('Online'),
    ]);
    expect(
      screen.queryByRole('button', { name: /xóa/i }),
    ).not.toBeInTheDocument();
  });

  it('creates a channel and keeps its code immutable while editing', async () => {
    const user = userEvent.setup();
    const saveSalesChannel = vi
      .fn()
      .mockResolvedValue({ channelId: channels[0]!.id });
    renderPage(createApi({ saveSalesChannel }));
    await user.click(
      await screen.findByRole('button', { name: 'Thêm kênh bán' }),
    );
    await user.type(screen.getByLabelText('Mã kênh bán'), 'SOCIAL');
    await user.type(screen.getByLabelText('Tên kênh bán'), 'Mạng xã hội');
    await user.type(screen.getByLabelText('Thứ tự hiển thị'), '40');
    await user.click(screen.getByRole('button', { name: 'Lưu kênh bán' }));
    await waitFor(() =>
      expect(saveSalesChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.objectContaining({ code: 'SOCIAL', sortOrder: '40' }),
        }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Sửa Tại quầy' }));
    expect(screen.getByLabelText('Mã kênh bán')).toBeDisabled();
    await user.clear(screen.getByLabelText('Tên kênh bán'));
    await user.type(screen.getByLabelText('Tên kênh bán'), 'Bán tại quầy');
    await user.click(screen.getByRole('button', { name: 'Lưu kênh bán' }));
    await waitFor(() =>
      expect(saveSalesChannel).toHaveBeenLastCalledWith(
        expect.objectContaining({
          channelId: channels[0]!.id,
          values: expect.objectContaining({
            code: 'IN_STORE',
            name: 'Bán tại quầy',
          }),
        }),
      ),
    );
  });

  it('requires confirmation before deactivation and locks writes offline', async () => {
    const user = userEvent.setup();
    const saveSalesChannel = vi
      .fn()
      .mockResolvedValue({ channelId: channels[0]!.id });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const firstRender = renderPage(createApi({ saveSalesChannel }));
    await user.click(
      await screen.findByRole('button', { name: 'Ngừng Tại quầy' }),
    );
    expect(confirm).toHaveBeenCalled();
    expect(saveSalesChannel).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Ngừng Tại quầy' }));
    await waitFor(() =>
      expect(saveSalesChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.objectContaining({
            isActive: false,
            code: 'IN_STORE',
          }),
        }),
      ),
    );
    confirm.mockRestore();

    firstRender.unmount();
    renderPage(createApi(), false);
    expect(
      await screen.findByRole('button', { name: 'Thêm kênh bán' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Cần kết nối mạng để cập nhật kênh bán.'),
    ).toBeInTheDocument();
  });
});
