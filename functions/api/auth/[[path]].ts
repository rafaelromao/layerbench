/**
 * Cloudflare Pages runs this for every request under /api/auth/. The work is in the web app's
 * source, where it is typechecked and tested with the rest, and where the dev server uses it too.
 */
import { type AuthEnv, handleAuth } from '../../../apps/web/src/server/github-auth.js';

/** The part of a Pages Function's context this uses; Pages provides more. */
interface Context {
  request: Request;
  env: AuthEnv;
}

export const onRequest = (context: Context): Promise<Response> =>
  handleAuth(context.request, context.env);
