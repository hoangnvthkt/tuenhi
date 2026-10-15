import { afterEach, describe, expect, it, vi } from 'vitest';
import { installAssetRecovery } from './asset-recovery';

const cleanups: Array<() => void> = [];
function browser(storage = new Map<string, string>()) {
  const target = Object.assign(new EventTarget(), {
    navigator: { onLine: true },
    location: {
      href: 'https://example.invalid/pos?focusProduct=product-1',
      reload: vi.fn(),
    },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  });
  cleanups.push(installAssetRecovery(target as unknown as Window));
  return target;
}
function failure(
  target: EventTarget,
  message = 'Failed to fetch dynamically imported module: https://example.invalid/assets/sales-old.js',
) {
  const event = Object.assign(
    new Event('vite:preloadError', { cancelable: true }),
    {
      payload: new TypeError(message),
    },
  );
  target.dispatchEvent(event);
  return event;
}
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

describe('asset recovery', () => {
  it('recovers a missing sales module by reloading the current deep link once', () => {
    const target = browser();
    expect(failure(target).defaultPrevented).toBe(true);
    expect(target.location.reload).toHaveBeenCalledOnce();
    expect(target.location.href).toBe(
      'https://example.invalid/pos?focusProduct=product-1',
    );
    failure(target);
    expect(target.location.reload).toHaveBeenCalledOnce();
  });
  it.each([
    'Importing a module script failed.',
    'error loading dynamically imported module',
    'Unable to preload CSS for /assets/inventory-old.css',
  ])('recovers the browser load failure %s', (message) => {
    const target = browser();
    expect(failure(target, message).defaultPrevented).toBe(true);
    expect(target.location.reload).toHaveBeenCalledOnce();
  });
  it('does not reload again when the same build still fails after navigation', () => {
    const storage = new Map<string, string>();
    failure(browser(storage));
    const reloaded = browser(storage);
    expect(failure(reloaded).defaultPrevented).toBe(false);
    expect(reloaded.location.reload).not.toHaveBeenCalled();
  });
  it('allows a newer build to recover independently', () => {
    const storage = new Map([['tuenhi:asset-recovery', 'previous-build']]);
    const target = browser(storage);
    failure(target);
    expect(target.location.reload).toHaveBeenCalledOnce();
  });
  it('leaves offline failures available for manual retry without consuming recovery', () => {
    const target = browser();
    target.navigator.onLine = false;
    expect(failure(target).defaultPrevented).toBe(false);
    expect(target.location.reload).not.toHaveBeenCalled();
    target.navigator.onLine = true;
    failure(target);
    expect(target.location.reload).toHaveBeenCalledOnce();
  });
  it('keeps ordinary module evaluation errors visible instead of hiding bugs with reloads', () => {
    const target = browser();
    expect(
      failure(target, 'Cannot access variable before initialization')
        .defaultPrevented,
    ).toBe(false);
    expect(target.location.reload).not.toHaveBeenCalled();
  });
  it('uses manual recovery when browser storage is blocked', () => {
    const target = browser();
    target.sessionStorage.setItem = () => {
      throw new Error('Storage denied');
    };
    expect(failure(target).defaultPrevented).toBe(false);
    expect(target.location.reload).not.toHaveBeenCalled();
  });
  it('removes the event handler on cleanup', () => {
    const target = browser();
    cleanups.pop()!();
    failure(target);
    expect(target.location.reload).not.toHaveBeenCalled();
  });
});
