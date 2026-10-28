# sfcc-commerce — implementation status

| Milestone | State | Landed |
|---|---|---|
| SX0 — the spec | ✅ | SX-1 |
| SX1 — the storefront on Workers | ✅ | SX-2 |
| SX2 — a baseline | planned | SX-3 |

## Departures from the upstream template

Everything not listed here is vercel-partner-solutions/nextjs-salesforce-commerce-cloud
as it is at `a474b5e`.

| # | What | Why |
|---|---|---|
| 1 | The app lives in `apps/web` of a pnpm workspace (`@app/web`); dependencies pinned to upstream's locked versions; `dev`/`start` on port 3000 | The workspace's shape |
| 2 | `next` 16.3.1 → 16.3.8 | @opennextjs/cloudflare 1.20.11 accepts `>=16.3.8` on 16.x, and 16.4.x fails every request on it |
| 3 | `cacheComponents` off; `experimental.useCache: true` (`inlineCss` kept) | A Cache Components page hangs on workerd under @opennextjs/cloudflare 1.20 (opennextjs-cloudflare#1450); every `"use cache"` read, lifetime and tag is kept |
| 4 | `next build --webpack` | Turbopack's Worker is 3.13 MiB gzipped, over Workers Free's 3 MiB; webpack's is 2.53 MiB |
| 5 | `output: "standalone"`, `outputFileTracingRoot` at the workspace root, `images.unoptimized`, `initOpenNextCloudflareForDev()`; `open-next.config.ts` (R2 + DO caches), `wrangler.template.jsonc`, `wiring.fixture.json`, `cloudflare-env.d.ts`, `@opennextjs/cloudflare` and `wrangler` added | OpenNext's build and bindings |
| 6 | `next.config.ts` `env` inlines `SFCC_CLIENT_ID`, `SFCC_ORGANIZATIONID`, `SFCC_SHORTCODE`, `SFCC_SITEID`, `NEXT_PUBLIC_SITE_URL`, `COMPANY_NAME` and the test-only `SFCC_API_ORIGIN` | A Worker's `process.env` holds only its vars and secrets |
| 7 | `lib/sfcc/connection.ts` (`isSFCCConfigured`, `SFCCNotConnected`): unconnected, the collections, product and search readers answer empty, the guest login throws (so every cart and checkout write does, before a request), `getCart` and `getCheckoutOrder` answer nothing; `components/connect-store.tsx`: the note in the layout, the "Connect your Salesforce Commerce Cloud store" panel on `/` | A product deploys before its owner connects a store; upstream threw on every page without one |
| 8 | `getCart` and `getCheckoutOrder` check their cookie before minting a guest token | Upstream logged a SLAS guest in on every page view by a visitor without a cart |
| 9 | `revalidate()`: 503 with no `SFCC_REVALIDATION_SECRET`, 401 for a missing or wrong `?secret=` (SHA-256 constant-time compare); topics and tags as upstream | Upstream logged a wrong secret and answered 200, comparing with `!==` |
| 10 | `SFCC_API_ORIGIN` sets the SDK's `proxy` and the SLAS base | The e2e's stand-in; a product leaves it empty |
| 11 | `app/site.ts`: `SITE_NAME = "ACME Store"` (upstream's) and `SOURCE_URL`; the layout's title, the navbar, the logo's label, the footer and the Open Graph image read `SITE_NAME` | One rename seam; upstream read `SITE_NAME` from the environment |
| 12 | The footer's "Deploy" button (Vercel's clone link) is a "Source" link to `SOURCE_URL`, and "View the source" links it too; the welcome toast says "on Cloudflare Workers" and links the source; the home page's description no longer names Vercel. "Created by ▲ Vercel" stays | The product is not deployed by Vercel's button |
| 13 | `lib/utils.ts` `baseUrl` from `NEXT_PUBLIC_SITE_URL` (upstream: `VERCEL_PROJECT_PRODUCTION_URL`), without a trailing slash | Each environment's own origin |
| 14 | The Open Graph image reads its font from `public/fonts/Inter-Bold.ttf` (moved from `fonts/`), from the file system or the Worker's `ASSETS` | A Worker has no project file system |
| 15 | `app/api/health/route.ts` | The deploy's smoke and the record's probe |
| 16 | `test` is upstream's check (`prettier --check`), which failed upstream on six files: formatted once (`prettier --write`); `lint` (ESLint, the workspace config, unused arguments allowed), `typecheck`, `preview`, `wire:fixture` added; the dead `hasPayment` line in `lib/sfcc/utils.ts` removed; `.gitignore` extended with `.open-next`, `.wrangler`, `.turbo`, `.dev.vars`; `.prettierignore` for the two wrangler files and the generated docs | The workspace's checks; no behaviour changes |
| 17 | `README.md` replaced by the app's own; `.env.example` says what is optional and where each value lives on Workers, with Salesforce's demo values commented | Settings are Orun secrets, never committed |
| 18 | Not carried: `.vscode`, `AGENTS.md`, `CLAUDE.md`, `pnpm-lock.yaml` | Editor- and agent-specific; the lockfile is the workspace's |

## Verified

- The spike (design.md §4): the fallback
  keeps the caching — a second visit read no catalogue, a change stayed
  cached until the secret revalidated `products`, then showed after one
  stale visit; the SDK and the PKCE login run on workerd.
- `pnpm typecheck`, `lint`, `test` (upstream's check; the port's 23) and
  `build` green with no store; the Worker is 2585.94 KiB gzipped (11639.53 KiB raw).
- Unconnected under `wrangler dev`: every page 200 with the note, `/` asks
  for a store, `/api/health` `{"ok":true,"connected":false}`,
  `POST /api/revalidate` 503, the sitemap lists no product, the Open Graph
  images are PNGs.
- Connected, in Baseline CI's e2e: the catalogue from the stand-in behind a
  PKCE login; a second visit reads Salesforce not at all; a change waits for
  revalidation, which re-reads the products and not the categories; wrong
  and missing secrets refused; neither server-side secret in the build.
