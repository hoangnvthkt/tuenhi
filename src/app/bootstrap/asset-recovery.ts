const recoveryKey = 'tuenhi:asset-recovery';
const assetLoadFailure =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;

/** Recover an outdated deployment once per build and tab, retaining the current URL. */
export function installAssetRecovery(target: Window = window) {
  let recovering = false;
  const recover = (event: Event) => {
    const payload: unknown = (event as Event & { payload?: unknown }).payload;
    if (
      recovering ||
      !target.navigator.onLine ||
      !(payload instanceof Error) ||
      !assetLoadFailure.test(payload.message)
    )
      return;
    try {
      // The executing entry URL changes with each production build. Persist the
      // guard before reloading so a persistent failure cannot create a loop.
      if (target.sessionStorage.getItem(recoveryKey) === import.meta.url)
        return;
      target.sessionStorage.setItem(recoveryKey, import.meta.url);
    } catch {
      // Without persistent loop protection, retain the existing manual recovery.
      return;
    }
    recovering = true;
    event.preventDefault();
    target.location.reload();
  };
  target.addEventListener('vite:preloadError', recover);
  return () => target.removeEventListener('vite:preloadError', recover);
}
