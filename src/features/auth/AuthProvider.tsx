import { useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createSessionApi } from './session-api';
import type {
  SessionApi,
  SessionContext,
  SessionStatus,
} from './session-context';
import { SessionContextValue, type SessionValue } from './session-store';

function safeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại.';
}

export function AuthProvider({
  api: providedApi,
  children,
}: {
  api?: SessionApi;
  children: ReactNode;
}) {
  const api = useMemo(() => providedApi ?? createSessionApi(), [providedApi]);
  const queryClient = useQueryClient();
  const mounted = useRef(true);
  const refreshSequence = useRef(0);
  const ignoredAuthChanges = useRef(0);
  const authenticatedSession = useRef<SessionContext | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [session, setSession] = useState<SessionContext | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;

    try {
      const authSession = await api.getAuthSession();
      if (!mounted.current || sequence !== refreshSequence.current) return;

      if (!authSession) {
        authenticatedSession.current = null;
        setSession(null);
        setErrorMessage(null);
        setStatus('anonymous');
        return;
      }

      const nextSession = await api.getSessionContext();
      if (!mounted.current || sequence !== refreshSequence.current) return;

      if (!nextSession.isActive) {
        ignoredAuthChanges.current += 1;
        authenticatedSession.current = null;
        try {
          await api.signOut();
        } catch {
          // The authoritative profile still makes the local session unusable.
        }
        queryClient.clear();
        if (!mounted.current || sequence !== refreshSequence.current) return;
        setSession(null);
        setErrorMessage('Tài khoản đã bị khóa.');
        setStatus('error');
        return;
      }

      authenticatedSession.current = nextSession;
      setSession(nextSession);
      setErrorMessage(null);
      setStatus('authenticated');
    } catch (error) {
      if (!mounted.current || sequence !== refreshSequence.current) return;
      const message = safeErrorMessage(error);
      if (message === 'Tài khoản đã bị khóa.') {
        ignoredAuthChanges.current += 1;
        try {
          await api.signOut();
        } catch {
          // The local session is still treated as unusable.
        }
        queryClient.clear();
        authenticatedSession.current = null;
      }
      if (!mounted.current || sequence !== refreshSequence.current) return;

      if (authenticatedSession.current) {
        setSession(authenticatedSession.current);
        setErrorMessage(null);
        setStatus('authenticated');
        return;
      }

      setSession(null);
      setErrorMessage(message);
      setStatus('error');
    }
  }, [api, queryClient]);

  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => void refresh());

    const unsubscribe = api.subscribe(() => {
      if (ignoredAuthChanges.current > 0) {
        ignoredAuthChanges.current -= 1;
        return;
      }
      queueMicrotask(() => void refresh());
    });

    return () => {
      mounted.current = false;
      refreshSequence.current += 1;
      unsubscribe();
    };
  }, [api, refresh]);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      session,
      errorMessage,
      refresh,
      signIn: async (email, password) => {
        await api.signIn(email, password);
        await refresh();
      },
      changePassword: async (password) => {
        await api.changePassword(password);
        await refresh();
      },
      signOut: async () => {
        await api.signOut();
        queryClient.clear();
        authenticatedSession.current = null;
        setSession(null);
        setErrorMessage(null);
        setStatus('anonymous');
      },
    }),
    [api, errorMessage, queryClient, refresh, session, status],
  );

  return (
    <SessionContextValue.Provider value={value}>
      {children}
    </SessionContextValue.Provider>
  );
}
