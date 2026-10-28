# sfcc-commerce — decisions

The choices that shape this repository, one line each, with where the full
reasoning lives. Superseded decisions stay listed, marked, so the history
reads in order.

| # | Decision | Why | Source |
|---|---|---|---|
| 1 | OpenNext on Workers + Static Assets, the commerce baselines' shape | The starter is a Next.js App Router app: server components, server actions, route handlers and `next/og` run in the Worker | `specs/epics/sfcc-commerce/design.md` §2 |
| 2 | The incremental cache in R2, the tag cache (sharded) and the revalidation queue in Durable Objects | The commerce baselines' proven shape: no database to provision or seed; tag revalidation needs strong consistency | design.md §3 |
| 3 | `experimental.useCache`, not `cacheComponents` | A Cache Components page answers 500 then hangs under the adapter (opennextjs-cloudflare#1450). Every `"use cache"` read, `cacheLife` and `cacheTag` is kept, and the spike proved them reused and revalidated on workerd | design.md §4, risk SX-C |
| 4 | Next.js 16.3.8, not upstream's 16.3.1 | @opennextjs/cloudflare 1.20.11 accepts `>=16.3.8` on Next 16, and 16.4.x fails every request on it | risk SX-D |
| 5 | `next build --webpack` | Turbopack's Worker is 3.13 MiB gzipped, over Workers Free's 3 MiB; webpack's is 2.53 MiB | design.md §4, risk SX-B |
| 6 | The four store coordinates inlined at build (`next.config.ts` `env`), with the origin and the company name | On Workers `process.env` at request time holds only the Worker's vars and secrets; upstream read them at request time on Vercel | design.md §5 |
| 7 | No store, no calls: one connection seam (`lib/sfcc/connection.ts`); unconnected, every reader answers empty, the guest login and every cart or checkout write refuse before a request, every page carries the note, `/` says "Connect your Salesforce Commerce Cloud store" | A baseline goes live with no key the platform cannot broker; with no coordinates upstream builds `https://.api.commercecloud.salesforce.com/…` and every page throws | design.md §6 |
| 8 | Salesforce's public demo instance is documented, not defaulted | A fresh product showing a vendor's demo catalogue is not a connect state, and a product must not depend on a demo instance staying up | design.md §6 |
| 9 | The coordinates are OPTIONAL build secrets (`optionalSecretEnv`); `SFCC_SECRET` and `SFCC_REVALIDATION_SECRET` are Orun secrets kept out of the build (`env -u`) and put on the Worker by the deploy (`tooling/wire/worker-secrets.mjs`) | The build inlines the coordinates; the two secrets are read per request and must not be in the bundle | design.md §6 |
| 10 | No guest login for a visitor without a cart: `getCart` and `getCheckoutOrder` check their cookie first | Upstream minted a SLAS guest token before the check, one login per cart-less page view, which the spike measured | design.md §7 |
| 11 | The revalidation route refuses: 503 with no secret set, 401 for a missing or wrong `?secret=`, compared in constant time; upstream's topics (`x-sfcc-topic`) and tags kept | Upstream answered 200 to a wrong secret and compared with `!==` | design.md §7 |
| 12 | One store-name seam (`SITE_NAME`, `app/site.ts`, upstream's own "ACME Store"); the title, navbar, footer and Open Graph image read it; the footer's source link is `SOURCE_URL` | The rename rewrites one line; upstream read `SITE_NAME` from the environment | risk SX-H |
| 13 | Each environment builds for its own origin: `NEXT_PUBLIC_SITE_URL` = `SITE_URL` or the workers.dev URL | The sitemap, robots.txt and Open Graph URLs need an absolute origin; upstream read Vercel's | design.md §5 |
| 14 | Images unoptimized; the Open Graph font served from Static Assets | Workers has no Next.js image optimizer, and no filesystem for upstream's `readFile` of the font | risk SX-E |
| 15 | `SFCC_API_ORIGIN`, a test-only origin for the SDK (its own `proxy` option) and the SLAS calls | The e2e's stand-in must be reachable without patching the SDK; a product leaves it empty | design.md §8 |
| 16 | The e2e connects a stand-in SCAPI + SLAS (`tests/web/fake-sfcc.mjs`, which the unit tests use too) that checks the PKCE verifier and every shopper token, and answers from a three-product catalogue | Offline and deterministic; the real instance is the owner's | design.md §8 |
| 17 | Upstream's check (`prettier --check`) is `@app/web`'s `test`, formatted once because it failed upstream; an ESLint config added for the workspace's `lint`, with unused arguments allowed | Upstream had no linter; its server actions keep arguments they do not read | risk SX-L |
| 18 | stack-tectonic 0.19.0, `ci.yml` as the commerce baselines', no `checks.yml`, the domain not asked, the subdomain from the Cloudflare connection | The commerce baselines' settled shape | `intent.yaml`, `blueprint.yaml` |
