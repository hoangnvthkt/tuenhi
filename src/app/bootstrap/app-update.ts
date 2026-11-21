import { reloadFresh } from './fresh-reload';

/** Build of the running code; `/version.json` holds the build being served. */
export const BUILD_ID: string = import.meta.env.VITE_BUILD_ID ?? 'dev';

const startupReloadKey = 'tuenhi:update-reload';
const CHECK_INTERVAL_MS = 5 * 60_000;

type Listener = () => void;
let updateReady = false;
const listeners = new Set<Listener>();

export function isUpdateReady() {
  return updateReady;
}

export function subscribeUpdate(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function markReady() {
  if (updateReady) return;
  updateReady = true;
  listeners.forEach((listener) => listener());
}

export async function fetchServedBuildId(fetcher: typeof fetch = fetch) {
  try {
    const response = await fetcher(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const buildId =
      body && typeof body === 'object' && 'buildId' in body
        ? body.buildId
        : null;
    return typeof buildId === 'string' && buildId ? buildId : null;
  } catch {
    return null;
  }
}

/**
 * Watches for a newer deployment. A newer build found right after start-up
 * reloads at once (nothing is in progress yet); later it only marks the update
 * ready, and the app applies it at a safe moment.
 */
export function startUpdateWatcher(
  target: Window = window,
  fetcher: typeof fetch = fetch,
  buildId = BUILD_ID,
) {
  if (buildId === 'dev') return () => undefined;
  let startup = true;
  let checking = false;
  const check = async () => {
    if (checking || updateReady || !target.navigator.onLine) return;
    checking = true;
    try {
      void target.navigator.serviceWorker
        ?.getRegistration()
        .then((registration) => registration?.update())
        .catch(() => undefined);
      const served = await fetchServedBuildId(fetcher);
      if (!served || served === buildId) return;
      if (startup && reloadOnceForBuild(served, target)) {
        void reloadFresh(target);
        return;
      }
      markReady();
    } finally {
      startup = false;
      checking = false;
    }
  };
  const onVisible = () => {
    if (target.document.visibilityState === 'visible') void check();
  };
  void check();
  target.document.addEventListener('visibilitychange', onVisible);
  target.addEventListener('online', onVisible);
  const timer = target.setInterval(onVisible, CHECK_INTERVAL_MS);
  return () => {
    target.document.removeEventListener('visibilitychange', onVisible);
    target.removeEventListener('online', onVisible);
    target.clearInterval(timer);
  };
}

/** One automatic start-up reload per served build, so a lagging cache cannot loop. */
function reloadOnceForBuild(served: string, target: Window) {
  try {
    if (target.sessionStorage.getItem(startupReloadKey) === served)
      return false;
    target.sessionStorage.setItem(startupReloadKey, served);
    return true;
  } catch {
    return false;
  }
}

/** `/pos/abc` → `pos`, `/more/purchases/1` → `more/purchases`. */
export function appSection(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  return parts.slice(0, parts[0] === 'more' ? 2 : 1).join('/');
}

/** For tests: forget a detected update. */
export function resetUpdateStateForTests() {
  updateReady = false;
  listeners.clear();
}
