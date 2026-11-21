import { recoverAssetLoadOnce } from './fresh-reload';

/** Recover an outdated deployment once per build and tab, retaining the current URL. */
export function installAssetRecovery(target: Window = window) {
  let recovering = false;
  const recover = (event: Event) => {
    const payload: unknown = (event as Event & { payload?: unknown }).payload;
    if (recovering || !recoverAssetLoadOnce(payload, target)) return;
    recovering = true;
    event.preventDefault();
  };
  target.addEventListener('vite:preloadError', recover);
  return () => target.removeEventListener('vite:preloadError', recover);
}
