import { fireEvent, screen, act, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '@/shared/testing/render-with-query-client';
import { StoreSettingsPage } from './StoreSettingsPage';
const mocks = vi.hoisted(() => ({
  getStoreSettings: vi.fn(),
  saveStoreSettings: vi.fn(),
  show: vi.fn(),
}));
vi.mock('../api/settings-api', () => ({
  createSettingsApi: () => mocks,
  settingsKeys: { store: ['settings', 'store'] },
}));
vi.mock('@/shared/ui/feedback/use-toast', () => ({
  useToast: () => ({ show: mocks.show }),
}));
const settings = {
  version: 1,
  displayName: 'Tuệ Nhi',
  logoPath: null,
  address: null,
  contactPhone: null,
  zalo: null,
  invoiceFooter: null,
};
beforeEach(() => vi.resetAllMocks());
it('shows retry after load failure and prevents saving without a loaded version', async () => {
  mocks.getStoreSettings
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValue(settings);
  renderWithQueryClient(<StoreSettingsPage />);
  await screen.findByRole('alert');
  expect(
    screen.queryByRole('button', { name: 'Lưu cấu hình' }),
  ).not.toBeInTheDocument();
  expect(mocks.saveStoreSettings).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByLabelText('Tên cửa hàng')).toHaveValue('Tuệ Nhi');
});
it('keeps dirty fields and their original version across refetch or refetch failure', async () => {
  mocks.getStoreSettings.mockResolvedValue(settings);
  mocks.saveStoreSettings.mockRejectedValue(new Error('Phiên bản đã thay đổi'));
  const view = renderWithQueryClient(<StoreSettingsPage />);
  fireEvent.change(await screen.findByLabelText('Tên cửa hàng'), {
    target: { value: 'Tên đang nhập' },
  });
  mocks.getStoreSettings.mockRejectedValueOnce(new Error('network'));
  await act(() => view.queryClient.invalidateQueries());
  expect(screen.getByLabelText('Tên cửa hàng')).toHaveValue('Tên đang nhập');
  mocks.getStoreSettings.mockResolvedValue({
    ...settings,
    version: 2,
    displayName: 'Tên mới từ máy chủ',
  });
  await act(() => view.queryClient.invalidateQueries());
  fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));
  await waitFor(() =>
    expect(mocks.saveStoreSettings).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ displayName: 'Tên đang nhập' }),
      expect.any(String),
    ),
  );
  expect(screen.getByLabelText('Tên cửa hàng')).toHaveValue('Tên đang nhập');
});
