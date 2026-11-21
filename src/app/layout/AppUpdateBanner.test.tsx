import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppUpdateBanner } from './AppUpdateBanner';

const mocks = vi.hoisted(() => ({
  ready: false,
  listeners: new Set<() => void>(),
  reloadFresh: vi.fn(),
}));
vi.mock('../bootstrap/app-update', async (original) => ({
  ...(await original<typeof import('../bootstrap/app-update')>()),
  isUpdateReady: () => mocks.ready,
  subscribeUpdate: (listener: () => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
}));
vi.mock('../bootstrap/fresh-reload', () => ({
  reloadFresh: mocks.reloadFresh,
}));
afterEach(() => {
  mocks.ready = false;
  mocks.reloadFresh.mockReset();
});

it('offers the update and applies it only when leaving the section', () => {
  const { rerender } = render(<AppUpdateBanner pathname="/pos" />);
  expect(screen.queryByText('Có phiên bản mới')).not.toBeInTheDocument();
  act(() => {
    mocks.ready = true;
    mocks.listeners.forEach((listener) => listener());
  });
  expect(screen.getByText('Có phiên bản mới')).toBeVisible();
  rerender(
    <AppUpdateBanner pathname="/pos/20000000-0000-4000-8000-000000000001" />,
  );
  expect(mocks.reloadFresh).not.toHaveBeenCalled();
  rerender(<AppUpdateBanner pathname="/sales" />);
  expect(mocks.reloadFresh).toHaveBeenCalledOnce();
});

it('updates at once from the button', () => {
  mocks.ready = true;
  render(<AppUpdateBanner pathname="/" />);
  screen.getByRole('button', { name: 'Cập nhật' }).click();
  expect(mocks.reloadFresh).toHaveBeenCalledOnce();
});
