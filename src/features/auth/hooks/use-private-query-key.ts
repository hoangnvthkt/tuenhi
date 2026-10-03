import { useCallback, useContext } from 'react';
import { privateQueryKey } from '@/shared/api/private-query-key';
import { SessionContextValue } from '../model/session-store';

/** Private screens are mounted only after RequireSession has resolved identity. */
export function usePrivateQueryKey() {
  const auth = useContext(SessionContextValue);
  const userId = auth?.session?.userId ?? 'no-session';
  return useCallback(
    (...parts: readonly unknown[]) => privateQueryKey(userId, ...parts),
    [userId],
  );
}
