import type { RouteObject } from 'react-router';
import {
  ChangePasswordPage,
  ForgotPasswordPage,
  LoginPage,
} from '@/features/auth';

export const loginRoute: RouteObject = {
  path: 'login',
  element: <LoginPage />,
};

export const forgotPasswordRoute: RouteObject = {
  path: 'forgot-password',
  element: <ForgotPasswordPage />,
};

export const changePasswordRoute: RouteObject = {
  path: 'change-password',
  element: <ChangePasswordPage />,
};
