import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initGitHubSession, returnFromGitHub } from './auth/github-session.js';
import { AnalysisClientProvider, SavedCorporaProvider } from './engine/client-context.js';
import './index.css';
import { createAppRouter } from './router.js';
import { useSession } from './state/session.js';
import { applyTheme, watchSystemTheme } from './state/theme.js';
import { StorageProvider } from './storage/use-storage.js';

/**
 * Never inside another site's frame, where clicks could be steered: the page can hold a GitHub
 * token, and its host sends no header that forbids framing. Production only, since editor preview
 * panes show the dev server in a frame.
 */
const framed = import.meta.env.PROD && window.top !== window.self;

if (!framed) {
  applyTheme(useSession.getState().theme);
  watchSystemTheme(() => useSession.getState().theme);

  // Before the router reads the address: back to the page the user signed in from.
  const back = returnFromGitHub();
  void initGitHubSession(back);

  const router = createAppRouter();

  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <AnalysisClientProvider>
        <StorageProvider>
          <SavedCorporaProvider>
            <RouterProvider router={router} />
          </SavedCorporaProvider>
        </StorageProvider>
      </AnalysisClientProvider>
    </StrictMode>,
  );
}
