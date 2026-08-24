import { createContext } from 'react';
import type { SessionContext, SessionStatus } from './session-context';

export type SessionValue = {
  status: SessionStatus;
  session: SessionContext | null;
  errorMessage: string | null;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  changePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const SessionContextValue = createContext<SessionValue | null>(null);
