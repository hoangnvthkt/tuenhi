import { useContext } from 'react';
import { SessionContextValue } from '../model/session-store';

export function useSession() {
  const value = useContext(SessionContextValue);
  if (!value) {
    throw new Error('useSession phải được dùng bên trong AuthProvider.');
  }

  return value;
}
