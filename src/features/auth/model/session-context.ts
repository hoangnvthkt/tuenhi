export type RoleTemplate = 'SALES_WAREHOUSE' | 'BUSINESS' | 'OWNER';

export interface AuthSession {
  userId: string;
}

export interface SessionContext {
  userId: string;
  email: string;
  displayName: string;
  roleTemplate: RoleTemplate;
  isActive: boolean;
  mustChangePassword: boolean;
  permissions: readonly string[];
}

export interface SessionApi {
  getAuthSession(): Promise<AuthSession | null>;
  getSessionContext(): Promise<SessionContext>;
  signIn(email: string, password: string): Promise<void>;
  changePassword(
    password: string,
    isInitialPasswordChange: boolean,
  ): Promise<void>;
  signOut(): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated' | 'error';
