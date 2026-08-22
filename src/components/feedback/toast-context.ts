import { createContext } from 'react';

export type ToastInput = {
  kind: 'success' | 'error' | 'info';
  title: string;
  message?: string;
  dedupeKey?: string;
  correlationId?: string;
  actionRoute?: string;
  actionLabel?: string;
};

export interface ToastApi {
  show(input: ToastInput): string;
  dismiss(id: string): void;
}

export const ToastContext = createContext<ToastApi | null>(null);
