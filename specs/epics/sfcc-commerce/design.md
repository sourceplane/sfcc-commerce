# sfcc-commerce — design

## 1. The storefront

Vercel's Next.js Commerce for Salesforce Commerce Cloud
(vercel-partner-solutions/nextjs-salesforce-commerce-cloud `a474b5e`):
Next.js 16.3 App Router with Cache Components on. Routes: the home page (a
three-item grid and a carousel, each one category's products), `/search`
and `/search/<category>` with sorting, `/product/<id>` with variants and
recommendations, fixed content pages (`lib/sfcc/content.ts`), a guest
checkout (`/checkout`: information, shipping, payment; then
`/checkout/confirmation`), Open Graph images (`next/og`), the sitemap and
robots.txt. Every SCAPI call goes through `commerce-sdk-isomorphic` 3.5
(`lib/sfcc/index.ts`) with a SLAS guest token: a public client's
authorization-code + PKCE flow written with plain `fetch`, or a private
client's `helpers.loginGuestUserPrivate` with `SFCC_SECRET`. Five readers are
`"use cache"` functions with `cacheLife("days")` and the tags `collections`
and/or `products`. The cart is the instance's basket, its id and the guest
token kept in cookies, changed by server actions; the checkout adds the
shopper's details, a shipping method and a masked card to the basket and
creates the order. The revalidation route reads a `?secret=` and an
`x-sfcc-topic` header. Every setting is read from the environment at request
time.

## 2. Vercel → Cloudflare

| Vercel | Here |
|---|---|
| Next.js hosting | `@opennextjs/cloudflare` 1.20.11: one Worker (`.open-next/worker.js`) + Static Assets |
| Data Cache | R2 (`NEXT_INC_CACHE_R2_BUCKET`), a bucket per environment from `infra/terraform/cloudflare-r2` |
| Tag revalidation | the sharded Durable Object tag cache (`NEXT_TAG_CACHE_DO_SHARDED`) |
| Stale-while-revalidate | the Durable Object queue (`NEXT_CACHE_DO_QUEUE`) through `WORKER_SELF_REFERENCE` |
| Image Optimization | off — the instance's images are served as it sends them |
| Env vars | the four coordinates as optional build secrets, inlined; `SFCC_SECRET` and `SFCC_REVALIDATION_SECRET` as Worker secrets the deploy sets |
| `VERCEL_PROJECT_PRODUCTION_URL` | `NEXT_PUBLIC_SITE_URL`: the environment's `SITE_URL`, else its workers.dev URL |

## 3. The cache

The commerce baselines' shape, unchanged: R2 incremental cache, sharded
Durable Object tag cache, Durable Object queue — `open-next.config.ts`, the
bindings and the `migrations` in `wrangler.template.jsonc`. No database to
provision or seed, and strongly consistent per tag shard.

## 4. Cache Components off, `"use cache"` kept — the spike

On workerd through the adapter a Cache Components page answers 500 and then
hangs (opennextjs-cloudflare#1450). So `cacheComponents` is off and
`experimental.useCache` keeps every `"use cache"` read with its lifetime and
tags; routes render per request from cached reads. Because the template's
caching was unverified on OpenNext, a spike came first (a scratch copy of
upstream, the commerce fallback, a stand-in SCAPI + SLAS, `wrangler dev`):

- a second visit to a product page read no product and no search — only one
  SLAS authorize + token pair, which was `getCart` minting a guest token for
  a visitor without a cart (§7);
- after a store change, `POST /api/revalidate?secret=…` with
  `x-sfcc-topic: products/update` answered `revalidated: true`; the next
  visit was served the old entry and re-read the product in the background
  (`revalidateTag(tag, "max")`, stale-while-revalidate), and the one after
  showed the change;
- the SDK runs on workerd (it takes `node-fetch`, since `nodejs_compat` sets
  `process.versions.node`), and the PKCE login's WebCrypto and `Buffer` work;
- Turbopack's Worker is 3200.79 KiB gzipped, over Workers Free's 3 MiB;
  `next build --webpack`'s is 2572.24 KiB. The build is webpack.

The verdict was that the fallback keeps the caching honest, and the e2e now
asserts all of it on every tag (§9). Next is 16.3.8, the lowest 16.x the
adapter's peer range accepts; 16.4.x fails every request on it.

## 5. Build-time settings

On Vercel the starter reads `SFCC_CLIENT_ID`, `SFCC_ORGANIZATIONID`,
`SFCC_SHORTCODE`, `SFCC_SITEID`, `COMPANY_NAME` and the origin from
`process.env` per request. A Worker's `process.env` holds only its vars and
secrets, so `next.config.ts` `env` inlines those at build — the deploy builds
once per environment with that environment's values. None of the four is a
credential on its own: a public SLAS client is made to be named in a
browser. They reach the server bundle only: no client component reads them.
`SFCC_SECRET` and `SFCC_REVALIDATION_SECRET` are not inlined: OpenNext puts
the Worker's secrets on `process.env` per request, where the code reads them.

## 6. Before a store, and after

A baseline goes live with no key the platform cannot broker. With no
coordinates upstream builds `https://.api.commercecloud.salesforce.com/…`
and every page throws. Salesforce's public PWA Kit demo instance would work
as a default, but a product would then show a vendor's demo catalogue and
depend on it staying up, so it is documented (`.env.example`, the README's
"Connecting Salesforce Commerce Cloud") and not defaulted. Instead the
unconfigured state is explicit: `lib/sfcc/connection.ts` says whether the
build had all four coordinates; unconnected, every reader answers empty, the
guest login and so every cart or checkout write throw `SFCCNotConnected`
before a request, every page carries the note "No Salesforce Commerce Cloud
store is connected yet", `/` says "Connect your Salesforce Commerce Cloud
store" and how, and the sitemap lists the home and content pages alone.
`/api/health` reports the connection for the smoke and the record. The owner
sets the Orun secrets and redeploys.

## 7. The guest login

Upstream's `getCart` called `getGuestUserConfig` — which mints a SLAS guest
token when the visitor has none — before it checked for a cart, so every page
view by a visitor without a cart cost one SLAS login, cached nowhere (the
spike's one remaining read). The port checks the cookie first, in `getCart`
and `getCheckoutOrder`; the answer is the same (no cart), and a second visit
reads Salesforce not at all. A catalogue read that misses the cache still
logs a guest in, as upstream does: the cached entry is shared, so no
shopper's token is kept in it.

## 8. Revalidation

Upstream's route compared `?secret=` with `!==` and, when it did not match,
logged and answered 200. The port answers 503 while no
`SFCC_REVALIDATION_SECRET` is set, 401 for a missing or wrong secret
(SHA-256 digests compared without an early exit), and keeps upstream's
topics: `products/{create,update,delete}` revalidates `products`,
`collections/{create,update,delete}` `collections`, anything else answers
200 and drops nothing. The secret is an Orun secret: the build runs without
it (`env -u`), so it is in no bundle, and `tooling/wire/worker-secrets.mjs`
puts it — and `SFCC_SECRET` — on the environment's Worker after the build,
on deploy lanes only. B2C Commerce sends no cache webhook of its own, so the
README names the owner's ways to call it: a job step, a hook, a scheduled
call.

## 9. Tests

Upstream's check (`prettier --check`) is `@app/web`'s `test`. `tests/web`
covers the port's seams (23 tests): the store name; the connection — four
coordinates, every reader empty with no request, a cart write refused, and,
against the stand-in, a public client's PKCE login, a private client's
`client_credentials` login, a visitor without a cart costing no login,
search; `/api/health`; the URL helpers and the origin; the revalidation
route's 503, 401s, topics and tags. The e2e serves the bootstrapped product
twice: as born (the deploy's own smoke, every page with the note, health,
revalidation off, the sitemap, the Open Graph image), then rebuilt by the
stage lane's own build step with a stand-in SCAPI + SLAS connected
(`tests/web/fake-sfcc.mjs`, which the unit tests use too: it checks the PKCE verifier against the
challenge, refuses a shopper call without a token it issued or for another
site, answers from a three-product catalogue in six categories, and counts
every call) — catalogue pages, a second visit with no read at all (guest
login included), a change that stays cached until the secret revalidates
`products`, refusals that drop nothing, the products re-read and not the
categories, and neither server-side secret in the build output.
`SFCC_API_ORIGIN` points the SDK (its own `proxy` option) and the SLAS calls
at the stand-in; a product never sets it.

## 10. The rename

Slug `sfcc-commerce`, store name `ACME Store` (upstream's own) at the
`SITE_NAME` seam (`app/site.ts`), with `SOURCE_URL` beside it. The leak gate
fails any other spelling of the name under `app/`, `components/` or `lib/`.
The storefront's own words — Salesforce, SFCC, SLAS, SCAPI — are not the
identity and no rule touches them.

## 11. Alternatives rejected

- **Cache Components on, a patched adapter**: hacking around an open
  upstream bug.
- **Turbopack**: its Worker is over Workers Free's 3 MiB.
- **Salesforce's demo instance as the default**: a vendor's catalogue in
  somebody's store, gone when Salesforce moves it, and no connect state.
- **A shopper's token in the cache, or no guest login for cached reads**:
  the shared entries would carry one shopper's token, or the reads would
  have none.
- **The two secrets as build secrets**: they would be inlined into the
  Worker's bundle.
- **Upstream's revalidation answer kept**: a wrong secret would be told it
  succeeded.
