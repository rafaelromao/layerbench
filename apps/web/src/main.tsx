import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initGitHubSession, restoreAfterSignIn } from './auth/github-session.js';
import { AnalysisClientProvider } from './engine/client-context.js';
import './index.css';
import { createAppRouter } from './router.js';
import { useSession } from './state/session.js';
import { applyTheme, watchSystemTheme } from './state/theme.js';
import { StorageProvider } from './storage/use-storage.js';

applyTheme(useSession.getState().theme);
watchSystemTheme(() => useSession.getState().theme);

// Before the router reads the address: back to the page the user signed in from.
restoreAfterSignIn();
void initGitHubSession();

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
