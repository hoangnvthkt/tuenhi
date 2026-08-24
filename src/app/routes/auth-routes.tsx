import type { RouteObject } from 'react-router';
import { ChangePasswordPage, LoginPage } from '@/features/auth';

export const loginRoute: RouteObject = {
  path: 'login',
  element: <LoginPage />,
};

export const changePasswordRoute: RouteObject = {
  path: 'change-password',
  element: <ChangePasswordPage />,
};
