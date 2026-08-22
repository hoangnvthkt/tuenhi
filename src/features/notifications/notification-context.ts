import { createContext } from 'react';
import type { NotificationApi } from './notification-api';

export const NotificationApiContext = createContext<NotificationApi | null>(
  null,
);
