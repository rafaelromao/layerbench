# Security scan, 2026-10-08

Scope: this repository (source, all git history, workflows, local build) and the published app at
https://layerbench.github.io, whose source is the public repository `layerbench/layerbench.github.io`.
Goal: confirm no credential is exposed. Values are never quoted here; occurrences are referenced
by file and line.

## Result

No credential is exposed. No real token, key, client secret or session secret appears in the
source, in any commit of either repository, in the workflows, or in the published bundle. The
sign-in secrets live only as Cloudflare Worker secrets and GitHub Actions secrets, where they
belong.

## What was checked and how

### 1. This repository, working tree and full history (214 commits, all refs)

| Check | Command | Result |
|---|---|---|
| Secret-like files ever committed | `git log --all --diff-filter=A --name-only --pretty=format: \| sort -u \| grep -iE '\.env\|secret\|key\|token\|cred\|\.pem\|dev\.vars\|id_rsa'` | Only source files with `key` in the name (keyboard code). No `.env*`, `.dev.vars*`, `*.pem`, deploy key. |
| Known token formats in history | `git log -p --all \| grep -nE '(ghp_\|gho_\|ghu_\|ghs_\|ghr_\|github_pat_\|AKIA[0-9A-Z]{16}\|sk-[A-Za-z0-9]{20,}\|xox[baprs]-\|-----BEGIN [A-Z ]*PRIVATE KEY\|AIza[0-9A-Za-z_-]{35}\|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)'` | Only test placeholders: `ghu_one`, `ghu_two`, `ghu_first`, `ghr_first` and similar in `apps/web/src/auth/github-session.test.ts` and `apps/web/src/server/github-auth.test.ts`. |
| Secret names assigned a value, anywhere in history | `git log -p --all \| grep -nE '^\+.*(SESSION_SECRET\|GITHUB_CLIENT_SECRET\|CLOUDFLARE_API_TOKEN\|APP_DEPLOY_KEY)\s*[:=]\s*[\x27"]'` | One hit: the literal placeholder `client-secret` in `apps/web/src/server/github-auth.test.ts:13`, added in commit 708e769. |
| Long high-entropy literals in tracked files | `git ls-files \| grep -vE 'pnpm-lock\|packages/corpora/\|\.svg$\|\.json$\|\.md$' \| xargs grep -nE "[\x27\"][A-Za-z0-9+/=_-]{40,}[\x27\"]"` | One hit, an alphabet string at `packages/core/src/corpus/scrub.ts:10`. Not a secret. |
| Stray key files on disk | `find . -name 'lb-deploy*' -o -name '*.pem' -o -name '.dev.vars*' -o -name '.env*'` (outside node_modules) | None. `worker/.wrangler` is empty. The sandbox blocks reading `.env*`, so their presence was checked by listing only. |
| What reaches the browser bundle | `grep -rnE 'VITE_\|process\.env\.\|import\.meta\.env' apps packages worker` | Only `VITE_AUTH_ORIGIN` (`apps/web/src/auth/github-session.ts:53`) and `VITE_BASE` (`apps/web/vite.config.ts:207`). Both are public origins. No `define` in the Vite config. The client imports the server module as a type only (`github-session.ts:3`). |
| Lockfile sources | `grep -nE 'tarball\|git\+\|github\.com/.*#' pnpm-lock.yaml` | None. All 244 resolutions carry a registry integrity hash. `.npmrc` sets only local store paths. |

### 2. Workflows (`.github/workflows/*.yml`)

- Every job runs with `permissions: contents: read`; `pages.yml` adds `pages: write` and
  `id-token: write` to the deploy job only.
- Every checkout sets `persist-credentials: false`.
- The deploy key `APP_DEPLOY_KEY` is read in `ci.yml:74` only, inside the `app` environment,
  by a job gated on `github.event_name == 'push'` on `main` of `rafaelromao/layerbench`. The
  job pushes the build to the site repository and nothing else.
- `pages.yml` validates `APP_ORIGIN` as an https origin before using it in `sed` (`pages.yml:35-38`).
- The Worker config `worker/wrangler.jsonc` holds only public values: the GitHub App client id,
  the app slug and `ALLOWED_ORIGINS`. The comment at the top explains that the two secrets are
  set with `wrangler secret put` and are refused as vars.

### 3. The published site (`layerbench/layerbench.github.io`, 9 commits, cloned read-only)

| Check | Result |
|---|---|
| Files ever published, outside `assets/` and `corpora/` | `.assets`, `.nojekyll`, `404.html`, `README.md` (GitHub's one-line default, since removed), favicons, `index.html`. No source maps, no `.env`, no `.git` leftovers. |
| Token patterns and secret names in the checkout and in all history (same regexes as above, plus `client_secret`) | 0 matches. |
| GitHub App client id in the bundle | Not present. The page receives it from the Worker at runtime. |
| External origins the bundle names | `github.com`, `api.github.com`, `gist.github.com`, the Worker `https://layerbench-auth.rafaelromao.workers.dev`, the landing page, documentation links, and a `http://localhost` fallback inside the TanStack Router library. All expected. |
| Published CSP (`index.html`) | `default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.github.com https://layerbench-auth.rafaelromao.workers.dev; form-action 'none'`. Matches `contentSecurityPolicy()` in `apps/web/vite.config.ts:40-53` with the auth origin set. `referrer` is `no-referrer`. |

### 4. Sign-in code review (`apps/web/src/server/github-auth.ts`, `apps/web/src/auth/github-session.ts`, `worker/`)

- `GITHUB_CLIENT_SECRET` and `SESSION_SECRET` are read server-side only. The session key must
  be exactly 32 bytes (`github-auth.ts:109-116`).
- The session is sealed with AES-GCM and a random IV. The browser keeps the sealed blob in
  localStorage (`github-session.ts:61,95-102`); the access token is kept in memory only
  (`github-session.ts:44`). The refresh token exists only inside the sealed blob. No cookies
  (`github-auth.ts:11-13`).
- OAuth uses PKCE and a single-use state with a 10 minute lifetime; the `code` is removed from
  the address bar after use. The return path is checked to be same-site.
- CORS: the Worker answers only to `ALLOWED_ORIGINS` or its own origin, echoes exactly that
  origin with `Vary: Origin`, and requires a JSON `Content-Type` so every cross-site call is
  preflighted (`github-auth.ts:384-390,409-431`).
- No `console.*` calls anywhere in the app, worker or Vite config. Error responses are generic
  and never relay GitHub's reply.

## Findings (none involve an exposed credential)

| Severity | Finding | Where | Suggested action |
|---|---|---|---|
| Medium, by design | The sealed session in localStorage is a bearer credential valid until the refresh token expires, or 180 days when GitHub App token expiry is off (`SESSION_FALLBACK_MAX_AGE_MS`). The Origin check constrains browsers, not a script with a forged `Origin` header. Logout revokes the access token only. | `github-session.ts:61`, `github-auth.ts:73,210,341-350,384-390` | Keep GitHub App token expiry on (README already says so). Document that rotating `SESSION_SECRET` is the way to sign everyone out (README already does). Consider also revoking the refresh token on logout, or shortening the fallback age. |
| Low | No rate limiting on the Worker. With a forged Origin anyone can make it call GitHub with the client secret. Bounded by input format checks and GitHub's own limits. | `worker/`, `github-auth.ts:79-83` | Add a Cloudflare rate-limiting rule on the Worker route if abuse is a concern. |
| Low | CSP is delivered as a `<meta>` tag, so `frame-ancestors` cannot be set. Framing is blocked in JavaScript, in production only. | `vite.config.ts:89-96`, `apps/web/src/main.tsx:17` | GitHub Pages cannot send headers, so this is the ceiling. Acceptable. |
| Low | The dev server derives the request origin from the `Host` header, so rebinding protection depends on Vite's own host check. Dev only. | `vite.config.ts:169` | None needed. |
| Info | `loadEnv(mode, dir, '')` loads every variable server-side. Nothing ships today, but a future `VITE_`-prefixed secret would. | `vite.config.ts:185-190` | Keep the `AUTH_ENV_KEYS` allowlist; a comment warning against `VITE_` names for secrets would help. |
| Info | Actions are pinned by major tag (`actions/checkout@v5`, `pnpm/action-setup@v4`, ...), not by commit SHA, and there is no `dependabot.yml`. | `.github/workflows/*.yml` | Optional hardening: pin to SHAs and let Dependabot bump them. |

### 5. Dependency audit (`pnpm audit`, run by the user on 2026-10-08)

One advisory, high severity: GHSA-68fv-2mgg-jv7q, an event-loop denial of service in
`source-map-js` below 1.2.2. The lockfile had 1.2.1, reached only through Vite, PostCSS and
jsdom under Vitest. It is a build-time and test-time dependency, never part of the shipped
bundle, and the only input it would parse is the project's own source maps. Fixed with an
`overrides` entry in `pnpm-workspace.yaml` (pnpm 11 no longer reads the `pnpm` field of
`package.json`) pinning `source-map-js` to `>=1.2.2`; `pnpm install`
refreshes the lockfile.

## Steps that need the user's terminal (network)

```bash
pnpm install
```

```bash
pnpm audit
```

```bash
brew install gitleaks
```

```bash
gitleaks git --redact .
```

gitleaks is a Go binary, not an npm package. Run it from the repository root for a tool-backed
pass over history with the same goal as the greps above.
