# sfcc-commerce

A Salesforce Commerce Cloud storefront — a home page with a featured grid and
a carousel, the catalogue's categories with sorting, search, product pages
with variants and recommendations, a cart, a guest checkout and a sitemap —
on **Cloudflare Workers + Static Assets** through
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), built from
Vercel's [Next.js Commerce for Salesforce Commerce Cloud](https://github.com/vercel-partner-solutions/nextjs-salesforce-commerce-cloud)
(MIT — `apps/web/license.md`). It reads your B2C Commerce instance through the
Shopper APIs (SCAPI), every shopper signed in as a SLAS guest. Every catalogue
read is cached with `"use cache"` in an **R2 bucket** that Terraform
provisions per environment; the tag cache and the revalidation queue are
**Durable Objects** the Worker itself exports, and a secret-checked route
drops the cache when your catalogue changes.

It is live from its first deploy, before any Salesforce store is connected:
every page answers, the catalogue is empty, and `/` says **"Connect your
Salesforce Commerce Cloud store"**. Once you give the build your SLAS client
and your site, it sells your products.

## Live deployment

<!-- 02-docs:begin -->
Not recorded yet. The bootstrap's last phase writes the live URLs, the
workspace, whether a Salesforce store is connected and the secrets the store
uses into [ai/context/deployment.md](ai/context/deployment.md); how the store
deploys and how to operate it is in
[ai/context/operations.md](ai/context/operations.md).
<!-- 02-docs:end -->

## What is here

| Surface | Where |
|---|---|
| The storefront's routes: `/` (the grid and the carousel), `/search` and `/search/<category>`, `/product/<id>`, the content pages (`/about` and the others in `lib/sfcc/content.ts`), `/checkout` (information, shipping, payment) and `/checkout/confirmation`; `/api/revalidate`, `/api/health`; the sitemap and the Open Graph images | `apps/web/app` |
| The store's name and its source link | `apps/web/app/site.ts` (`SITE_NAME`, `SOURCE_URL`) |
| Whether a Salesforce store is connected, and what the storefront says until one is | `apps/web/lib/sfcc/connection.ts`, `apps/web/components/connect-store.tsx` |
| The SCAPI client (`commerce-sdk-isomorphic`), the SLAS guest login, the cached reads and their tags, the cart and checkout calls, the revalidation route's logic | `apps/web/lib/sfcc` |
| Workers build, cache bindings and deploy contract | `apps/web/next.config.ts`, `open-next.config.ts`, `wrangler.template.jsonc` + `wiring.fixture.json` (→ `wrangler.jsonc`), `component.yaml` |
| The R2 bucket (stage, prod) | `infra/terraform/cloudflare-r2` |
| Tests | `tests/web` (vitest); upstream's own check (`pnpm --filter @app/web test`: its format check) |

## Getting started

```bash
pnpm install
pnpm run wire:fixture   # render apps/web/wrangler.jsonc from the offline fixture
pnpm typecheck
pnpm lint
pnpm test
pnpm build              # next build + opennextjs-cloudflare build → apps/web/.open-next
```

None of these needs a store: with none the build is the "connect your
Salesforce Commerce Cloud store" storefront. To work against yours, copy
`apps/web/.env.example` to `apps/web/.env.local` and set the four `SFCC_*`
coordinates (it lists Salesforce's public demo values, for a first look),
then:

```bash
pnpm --filter @app/web dev        # http://localhost:3000, Next's dev server
pnpm --filter @app/web preview    # wrangler dev over the built Worker, a local R2 bucket and local Durable Objects
```

## Connecting Salesforce Commerce Cloud

1. **A B2C Commerce instance and a SLAS client.** You need four values: the
   **client id** of a SLAS client with the shopper scopes for your site
   (`SFCC_CLIENT_ID`), your **organization id** (`f_ecom_…`,
   `SFCC_ORGANIZATIONID`), your instance's **short code**
   (`SFCC_SHORTCODE`) and the **site id** (`RefArch`, say: `SFCC_SITEID`) —
   Salesforce's [base URL](https://developer.salesforce.com/docs/commerce/commerce-api/guide/base-url.html)
   and [SLAS](https://developer.salesforce.com/docs/commerce/commerce-api/guide/authorization-for-shopper-apis.html)
   guides say where each is. A **public** client signs shoppers in with the
   guest PKCE flow and needs `http://localhost:3000/callback` among its
   redirect URIs (the storefront never visits it: it reads the code from the
   redirect). A **private** client also needs its secret, `SFCC_SECRET`,
   which stays on the Worker. To try the storefront first, Salesforce's
   public demo instance works as a public client: the values are in
   `apps/web/.env.example`.
2. **Give the build your store**, once per deployed environment. The build
   reads the four coordinates (they are fixed per deploy), so they are this
   repository's Orun secrets, and stage and prod can each name their own site:

   ```bash
   orun secrets set SFCC_CLIENT_ID --env stage   # prompts for the value
   orun secrets set SFCC_ORGANIZATIONID --env stage
   orun secrets set SFCC_SHORTCODE --env stage
   orun secrets set SFCC_SITEID --env stage
   orun secrets set SFCC_SECRET --env stage      # a private client only
   ```

   and the same with `--env prod`. Then **redeploy the storefront**: a
   secret is read when the storefront deploys, and setting one deploys
   nothing. Use **Deploy by hand** below, or change the stamp on the last
   line of `apps/web/component.yaml` (`# orun: redeploy …`) and merge. From
   that deploy on the catalogue is yours. `SFCC_SECRET` is never in the
   build: the deploy puts it on the Worker as a secret.
3. **The home page** shows the products of two categories, as upstream does:
   `hidden-homepage-featured-items` (the grid) and `hidden-homepage-carousel`
   (the carousel). Create both in Business Manager and assign products to
   them; until they exist the home page shows `newarrivals` instead. The
   header's categories are `mens`, `womens`, `newarrivals` and `top-seller`
   (`storeCatalog` in `apps/web/lib/sfcc/constants.ts`), RefArch's.
4. **Let your catalogue revalidate the cache** (recommended). Every catalogue
   read is cached at the edge for days; a call to the revalidation route makes
   a change show on the next requests instead. Set a long random secret for
   each environment:

   ```bash
   orun secrets set SFCC_REVALIDATION_SECRET --env stage
   orun secrets set SFCC_REVALIDATION_SECRET --env prod
   ```

   and redeploy: the deploy hands it to the Worker as a secret (the build
   never sees it). Then have a job of yours — a B2C Commerce job step, a
   hook, a scheduled call — `POST` to
   `https://sfcc-commerce-web-prod.your-workers-subdomain.workers.dev/api/revalidate?secret=<SFCC_REVALIDATION_SECRET>`
   with an `x-sfcc-topic` header naming the change: `products/create`,
   `products/update` or `products/delete` drops the products,
   `collections/create`, `collections/update` or `collections/delete` the
   categories. Any other topic drops nothing. A wrong or missing secret is
   refused (401), and until the secret is set the route answers 503 to
   everyone. The next visit after a drop may still see the old page while
   the new one renders (stale-while-revalidate); the one after sees the
   change.

## Checkout

The cart is your instance's basket (`cartId` and `guest_token` cookies). The
checkout is upstream's: the shopper's email, a shipping address, a shipping
method, a card and a confirmation, then **Place order** creates the order in
your instance. It **takes no payment**: upstream calls it the simplest
credit-card example, "for demo purposes" — the basket gets a `CREDIT_CARD`
payment instrument with the card's type and masked number, and the full
number and the security code go nowhere. Wire a payment processor
(Salesforce Payments, or your own provider's tokenised flow) into
`addPaymentMethod` and `placeOrder` in `apps/web/lib/sfcc/index.ts` before you
sell.

## How the cache is wired

The Worker binds the bucket as `NEXT_INC_CACHE_R2_BUCKET` (every `"use cache"`
entry), and two Durable Objects: `NEXT_TAG_CACHE_DO_SHARDED` (which tags were
revalidated, and when) and `NEXT_CACHE_DO_QUEUE` (background revalidation of
stale entries, through the Worker's own `WORKER_SELF_REFERENCE` binding). The
bucket's name is never hand-written: `apps/web/wrangler.template.jsonc` names
it as a wiring token, and `wrangler.jsonc` is that template rendered — from
`wiring.fixture.json` for local work and verification, and on every deploy
from the document the `cloudflare-r2` Terraform root publishes after its
apply (`WIRING_CLOUDFLARE_R2`, per environment). Edit the template, then
`pnpm run wire:fixture` and commit the render with the template. The Durable
Objects need no root: the migration in the config creates them on the first
deploy.

The cart, the checkout and a shopper's guest login are never cached: they are
read per request with the shopper's own token. A visitor without a cart costs
no guest login at all.

## How it deploys

Merges to `main` converge through [Orun](https://github.com/sourceplane/orun):
`.github/workflows/ci.yml` plans the changed components and runs each lane
against the workspace in `intent.yaml`. The R2 bucket applies first, then the
storefront builds for that environment — its bucket, its origin, and its
Salesforce store if one is set — and deploys, to `stage`, then to `prod` once
stage has converged on the same commit; `dev` only verifies. The Worker is
`sfcc-commerce-web-<env>` on your account's workers.dev subdomain, and
every deploy is smoke-tested over HTTP: the home page must answer, and so
must `/api/health`, which only the Worker can. A pull request runs the same
pipeline's verify lanes, with nothing applied or deployed: the R2 bucket
planned for stage and prod, and the storefront built and dry-deployed for
each environment. They do not run the tests or the linter — run those before
you push (Getting started, above). (A push to `main` applies, builds and
deploys.)

The pipeline holds one credential, GitHub's own `GITHUB_TOKEN`. The Cloudflare
tokens and account id are brokered per run from the workspace's Cloudflare
connection — one to deploy the Worker, one with R2 access for the bucket's
apply — and the bucket names, your store's coordinates and the two Worker
secrets travel as Orun secrets; nothing provider-shaped is stored in the
repository or in GitHub.

**Deploy by hand.** Orunbase's **Deploy** button on a component, or **Run
workflow** on the CI workflow in GitHub's Actions tab (on `main`), runs
`ci.yml` for the environment and components you pick, and each one deploys
exactly as a merge would deploy it. Leave the component blank to redeploy
every component in that environment, with nothing changed: after setting your
store's coordinates, say. A component with nothing to run in that
environment (a test suite in `prod`) is left out with a notice.

## How it maps to Vercel

| Vercel | Here |
|---|---|
| Next.js hosting (SSR, server actions, route handlers, `next/og`) | One Cloudflare Worker (`.open-next/worker.js`) + Static Assets (`ASSETS`) |
| Cache Components: `"use cache"` with `cacheLife` and `cacheTag` | `"use cache"`, its lifetimes and its tags kept (`experimental.useCache`); routes render per request (below) |
| Data Cache entries | The R2 bucket bound as `NEXT_INC_CACHE_R2_BUCKET` |
| `revalidateTag` | A sharded Durable Object tag cache consulted on every cache read |
| Stale-while-revalidate | A Durable Object queue that re-renders stale entries through the Worker |
| Image Optimization (`/_next/image`) | Off (`images.unoptimized`): images come from your instance's image URLs |
| `SFCC_CLIENT_ID`, `SFCC_ORGANIZATIONID`, `SFCC_SHORTCODE`, `SFCC_SITEID` | Orun secrets (above), read by the build; the "connect your Salesforce Commerce Cloud store" storefront until set |
| `SFCC_SECRET`, `SFCC_REVALIDATION_SECRET` | Orun secrets the deploy puts on the Worker, never in the build; without the first the client is public, without the second the route refuses |
| `VERCEL_PROJECT_PRODUCTION_URL` (the sitemap's and robots.txt's origin) | Each environment's `SITE_URL` (intent.yaml), else its workers.dev URL — set by the build |
| `SITE_NAME` | `apps/web/app/site.ts` |
| Deploy on push | Orun applies the bucket and deploys `sfcc-commerce-web-{stage,prod}` on merge to `main` (`apps/web/component.yaml`) |

Cache Components are off: `@opennextjs/cloudflare` 1.20 cannot run Next.js
16's Cache Components on workerd yet (a Cache Components page answers 500 and
then hangs), so the storefront keeps every `"use cache"` read, its lifetime
and its tags through `experimental.useCache`, and renders each route at
request time from those cached reads.

## Custom domain

The store answers on workers.dev from its first deploy. To serve it on your
own domain:

1. Add the domain to the Cloudflare account the store deploys into, and attach
   it to the Worker (dashboard → Workers & Pages →
   `sfcc-commerce-web-prod` → Settings → Domains & Routes → Add →
   Custom domain).
2. Set the environment's public origin in `intent.yaml`, so the next deploy
   builds the store's sitemap, robots.txt and Open Graph URLs for it (until
   then they use the workers.dev URL):

   ```yaml
   environments:
     prod:
       env:
         SITE_URL: https://shop.example.com
   ```

   The store was born with the reserved placeholder
   `sfcc-commerce.example.com` where its domain goes: `BASE_DOMAIN` under
   each environment in `intent.yaml`. Replace it with your domain in the same
   change, and land it with a change under `apps/web` so the merge rebuilds
   the store. Point your revalidation call at the new domain too.

## Licence

The storefront is Vercel's Next.js Commerce for Salesforce Commerce Cloud,
under the MIT licence (`apps/web/license.md`).
