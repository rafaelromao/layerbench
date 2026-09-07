import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AnalysisClientProvider } from './engine/client-context.js';
import './index.css';
import { createAppRouter } from './router.js';
import { useSession } from './state/session.js';
import { applyTheme, watchSystemTheme } from './state/theme.js';
import { StorageProvider } from './storage/use-storage.js';

applyTheme(useSession.getState().theme);
watchSystemTheme(() => useSession.getState().theme);

const router = createAppRouter();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AnalysisClientProvider>
      <StorageProvider>
        <RouterProvider router={router} />
      </StorageProvider>
    </AnalysisClientProvider>
  </StrictMode>,
);
