import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerServiceWorker } from './lib/pwaUpdate';
import { applySettings } from './lib/settings';

applySettings();
registerServiceWorker();
// Ask the browser not to evict saved poems and explanations under storage pressure.
void navigator.storage?.persist?.().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
