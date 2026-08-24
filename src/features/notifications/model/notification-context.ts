import { createContext } from 'react';
import type { NotificationApi } from '../api/notification-api';

export const NotificationApiContext = createContext<NotificationApi | null>(
  null,
);
