import { useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createSessionApi } from '../api/session-api';
import type {
  SessionApi,
  SessionContext,
  SessionStatus,
} from '../model/session-context';
import { SessionContextValue, type SessionValue } from '../model/session-store';

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
  const authIdentity = useRef<string | null>(null);
  const authenticatedSession = useRef<SessionContext | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [session, setSession] = useState<SessionContext | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearIdentity = useCallback(() => {
    authenticatedSession.current = null;
    authIdentity.current = null;
    // clear() destroys queries and cancels their retries/responses synchronously.
    queryClient.clear();
    setSession(null);
  }, [queryClient]);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    let verifiedIdentity: string | null = null;

    try {
      const authSession = await api.getAuthSession();
      if (!mounted.current || sequence !== refreshSequence.current) return;

      if (!authSession) {
        clearIdentity();
        setErrorMessage(null);
        setStatus('anonymous');
        return;
      }

      verifiedIdentity = authSession.userId;
      if (authIdentity.current !== verifiedIdentity) {
        clearIdentity();
        authIdentity.current = verifiedIdentity;
        setStatus('loading');
        setErrorMessage(null);
      }
      const nextSession = await api.getSessionContext();
      if (!mounted.current || sequence !== refreshSequence.current) return;

      if (nextSession.userId !== verifiedIdentity) {
        clearIdentity();
        throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.');
      }
      if (!nextSession.isActive) {
        ignoredAuthChanges.current += 1;
        clearIdentity();
        setStatus('loading');
        try {
          await api.signOut();
        } catch {
          // The authoritative profile still makes the local session unusable.
        }
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
        clearIdentity();
        setStatus('loading');
        try {
          await api.signOut();
        } catch {
          // The local session is still treated as unusable.
        }
      }
      if (!mounted.current || sequence !== refreshSequence.current) return;

      if (
        verifiedIdentity &&
        authenticatedSession.current?.userId === verifiedIdentity &&
        authIdentity.current === verifiedIdentity
      ) {
        setSession(authenticatedSession.current);
        setErrorMessage(null);
        setStatus('authenticated');
        return;
      }

      clearIdentity();
      setErrorMessage(message);
      setStatus('error');
    }
  }, [api, clearIdentity]);

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
        await api.changePassword(
          password,
          session?.mustChangePassword ?? false,
        );
        await refresh();
      },
      signOut: async () => {
        ++refreshSequence.current;
        clearIdentity();
        setStatus('anonymous');
        await api.signOut();
        setErrorMessage(null);
        setStatus('anonymous');
      },
    }),
    [api, clearIdentity, errorMessage, refresh, session, status],
  );

  return (
    <SessionContextValue.Provider value={value}>
      {children}
    </SessionContextValue.Provider>
  );
}
