const recoveryKey = 'tuenhi:asset-recovery';

// Browsers word a missing or mismatched build file differently; Safari reports
// an HTML fallback as a MIME-type error rather than a failed import.
const assetLoadFailure =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|is not a valid JavaScript MIME type|Expected a JavaScript(?:-or-Wasm)? module script/i;

type BrowserLike = Pick<Window, 'location' | 'navigator' | 'sessionStorage'> & {
  caches?: CacheStorage;
};

export function isAssetLoadError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'ChunkLoadError' || assetLoadFailure.test(error.message))
  );
}

/** Drops cached app files and the service worker, then reloads from the network. */
export async function reloadFresh(target: BrowserLike = window) {
  const cleanup = (async () => {
    try {
      const keys = (await target.caches?.keys()) ?? [];
      await Promise.all(keys.map((key) => target.caches!.delete(key)));
    } catch {
      // A stale cache only delays the update; the reload still proceeds.
    }
    try {
      const registrations =
        (await target.navigator.serviceWorker?.getRegistrations()) ?? [];
      await Promise.all(registrations.map((item) => item.unregister()));
    } catch {
      // The new service worker replaces the old one on the next load.
    }
  })();
  await Promise.race([
    cleanup,
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  target.location.reload();
}

/**
 * Reloads once per build and tab after a missing build file. Returns false when
 * the failure is not recoverable here (offline, storage blocked, already tried).
 */
export function recoverAssetLoadOnce(
  error: unknown,
  target: BrowserLike = window,
) {
  if (!target.navigator.onLine || !isAssetLoadError(error)) return false;
  try {
    // The executing entry URL changes with each production build. Persist the
    // guard before reloading so a persistent failure cannot create a loop.
    if (target.sessionStorage.getItem(recoveryKey) === import.meta.url)
      return false;
    target.sessionStorage.setItem(recoveryKey, import.meta.url);
  } catch {
    return false;
  }
  void reloadFresh(target);
  return true;
}
