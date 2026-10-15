import { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  Link,
  Outlet,
  RouterProvider,
} from 'react-router';
import { RouterErrorPage } from '../../src/app/errors/RouterErrorPage';
import { installAssetRecovery } from '../../src/app/bootstrap/asset-recovery';

export const Sales = lazy(() => import('./recovery-sale'));
export const Purchase = lazy(() => import('./recovery-purchase'));
installAssetRecovery();
const router = createBrowserRouter([
  {
    element: (
      <>
        <nav>
          <Link to="/pos?focusProduct=fixture-product">Bán hàng</Link>
          <Link to="/more/purchases/new?productId=fixture-product">
            Nhập hàng
          </Link>
        </nav>
        <Suspense fallback={<p>Đang tải…</p>}>
          <Outlet />
        </Suspense>
      </>
    ),
    errorElement: <RouterErrorPage />,
    children: [
      { path: '/', element: <h1>Danh mục</h1> },
      { path: '/pos', element: <Sales /> },
      { path: '/more/purchases/new', element: <Purchase /> },
    ],
  },
]);
createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />,
);
