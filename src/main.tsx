import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/index.css';
import { installAssetRecovery } from './app/bootstrap/asset-recovery';
import { startUpdateWatcher } from './app/bootstrap/app-update';

installAssetRecovery();
if (import.meta.env.PROD) startUpdateWatcher();

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Không tìm thấy phần tử gốc của ứng dụng.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
