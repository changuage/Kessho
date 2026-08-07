import React from 'react';
import ReactDOM from 'react-dom/client';
import { DEFAULT_STATE } from './ui/state';
import './designSystem/designSystem.css';
import './ui/sharedSlider.css';

const root = document.getElementById('root')!;
const parityRoute = new URLSearchParams(window.location.search).get('parity') === '1';
const captureEnabled = import.meta.env.DEV || import.meta.env.VITE_KESSHO_ENABLE_GRAPH_CAPTURE === 'true';

if (parityRoute && captureEnabled) {
  document.documentElement.dataset.coreProductRuntimePhase = 'harness-loading';
  import('./audio/sonicParityHarness')
    .then(({ installSonicParityHarness }) => {
      installSonicParityHarness({ getState: () => DEFAULT_STATE });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      document.documentElement.dataset.coreProductRuntimePhase = 'error';
      document.documentElement.dataset.coreProductRuntimeError = message;
      console.error('Failed to install sonic parity harness:', error);
    });
} else {
  import('./App').then(({ default: App }) => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
}
