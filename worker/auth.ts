/**
 * Sign-in with GitHub for the app on GitHub Pages, which runs no code of its own: a Cloudflare
 * Worker, on a domain of its own, answering every request under /api/auth/. The work is in the web
 * app's source, where it is typechecked and tested with the rest, and where the dev server uses it
 * too. `wrangler.jsonc` beside this file says how it is deployed.
 */
import { type AuthEnv, handleAuth } from '../apps/web/src/server/github-auth.js';

export default {
  fetch: (request: Request, env: AuthEnv): Promise<Response> => handleAuth(request, env),
};
