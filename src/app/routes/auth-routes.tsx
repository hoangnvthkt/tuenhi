/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router';
import { RouteLoading } from './RouteLoading';

const LoginPage = lazy(() =>
  import('@/features/auth').then((module) => ({ default: module.LoginPage })),
);
const ChangePasswordPage = lazy(() =>
  import('@/features/auth').then((module) => ({
    default: module.ChangePasswordPage,
  })),
);

export const loginRoute: RouteObject = {
  path: 'login',
  element: (
    <Suspense fallback={<RouteLoading />}>
      <LoginPage />
    </Suspense>
  ),
};

export const changePasswordRoute: RouteObject = {
  path: 'change-password',
  element: (
    <Suspense fallback={<RouteLoading />}>
      <ChangePasswordPage />
    </Suspense>
  ),
};
