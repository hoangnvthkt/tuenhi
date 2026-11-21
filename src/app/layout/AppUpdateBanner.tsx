import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  appSection,
  isUpdateReady,
  subscribeUpdate,
} from '../bootstrap/app-update';
import { reloadFresh } from '../bootstrap/fresh-reload';

/**
 * Offers a newer deployment and applies it when the user moves to another
 * section. Moves inside a flow (e.g. a cart becoming `/pos/<draft>` during
 * checkout) never reload.
 */
export function AppUpdateBanner({ pathname }: { pathname: string }) {
  const ready = useSyncExternalStore(subscribeUpdate, isUpdateReady);
  const shownAt = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const section = appSection(pathname);
    if (shownAt.current === null) shownAt.current = section;
    else if (shownAt.current !== section) void reloadFresh();
  }, [ready, pathname]);
  if (!ready) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 border-b border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-950"
    >
      <span>Có phiên bản mới</span>
      <button
        type="button"
        onClick={() => void reloadFresh()}
        className="min-h-11 rounded-lg bg-teal-700 px-4 font-semibold text-white"
      >
        Cập nhật
      </button>
    </div>
  );
}
