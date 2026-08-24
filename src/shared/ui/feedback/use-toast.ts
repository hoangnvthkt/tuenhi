import { useContext } from 'react';
import { ToastContext } from './toast-context';

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error('useToast phải được dùng bên trong ToastProvider.');
  }

  return value;
}
