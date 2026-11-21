import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appSection,
  isUpdateReady,
  resetUpdateStateForTests,
  startUpdateWatcher,
} from './app-update';

const stops: Array<() => void> = [];
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  resetUpdateStateForTests();
});

function browser(storage = new Map<string, string>()) {
  const target = Object.assign(new EventTarget(), {
    navigator: { onLine: true },
    document: Object.assign(new EventTarget(), {
      visibilityState: 'visible',
    }),
    location: { reload: vi.fn() },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    },
    setInterval: () => 1,
    clearInterval: () => undefined,
  });
  return target as typeof target & Window;
}

const served = (buildId: string) =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ buildId }),
  }) as unknown as typeof fetch;

describe('app update watcher', () => {
  it('stays quiet when the served build is the running one', async () => {
    const target = browser();
    const fetcher = served('abc');
    stops.push(startUpdateWatcher(target, fetcher, 'abc'));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(isUpdateReady()).toBe(false);
    expect(target.location.reload).not.toHaveBeenCalled();
  });

  it('reloads once at start-up when a newer build is served', async () => {
    const storage = new Map<string, string>();
    const target = browser(storage);
    stops.push(startUpdateWatcher(target, served('new'), 'old'));
    await vi.waitFor(() =>
      expect(target.location.reload).toHaveBeenCalledOnce(),
    );
    // Same tab still on the old build after reload: offer the update instead.
    const again = browser(storage);
    stops.push(startUpdateWatcher(again, served('new'), 'old'));
    await vi.waitFor(() => expect(isUpdateReady()).toBe(true));
    expect(again.location.reload).not.toHaveBeenCalled();
  });

  it('marks the update ready when found after start-up', async () => {
    const target = browser();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => ({ buildId: 'old' }) })
      .mockResolvedValue({
        ok: true,
        json: () => ({ buildId: 'new' }),
      }) as unknown as typeof fetch;
    stops.push(startUpdateWatcher(target, fetcher, 'old'));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 0));
    target.document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(isUpdateReady()).toBe(true));
    expect(target.location.reload).not.toHaveBeenCalled();
  });

  it('ignores a missing or malformed version file', async () => {
    const target = browser();
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    stops.push(startUpdateWatcher(target, fetcher, 'old'));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(isUpdateReady()).toBe(false);
  });

  it('groups pages into sections so in-flow moves never reload', () => {
    expect(appSection('/pos')).toBe(appSection('/pos/abc'));
    expect(appSection('/more/purchases/new')).toBe('more/purchases');
    expect(appSection('/more/purchases/1')).not.toBe(
      appSection('/more/suppliers'),
    );
    expect(appSection('/')).toBe('');
  });
});
