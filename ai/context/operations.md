# sfcc-commerce — operating contract (for humans and agents)

This is the standing guide to how this store is deployed and operated.
Instance facts (live URLs, workspace, whether a Salesforce store is connected,
the secrets it uses) live in [deployment.md](deployment.md), rendered from
probed reality by the bootstrap's `02-docs` phase; this file is the contract
that stays true between deployments. It is written to give an agent with
repository read access enough context to reason about and operate the store
without any other source.

## What this system is

A Salesforce Commerce Cloud storefront on Cloudflare, expressed as an Orun
component-native desired-state repo. Salesforce B2C Commerce itself — the
catalogue, categories, baskets, customers and orders — is the owner's
instance, reached over its Shopper APIs (SCAPI) with a SLAS client that
signs every shopper in as a guest; nothing here runs Salesforce.

- **`infra/terraform/cloudflare-r2`** — one R2 bucket per deployed
  environment (`stage`, `prod`), applied by Terraform: the storefront's
  Next.js incremental cache. After each apply it publishes a wiring document
  — `{r2_bucket_name}` — as the Orun secret `WIRING_CLOUDFLARE_R2` on that
  environment.
- **`apps/web`** — the storefront: Vercel's Next.js Commerce for Salesforce
  Commerce Cloud built by `@opennextjs/cloudflare` into one Worker plus
  Static Assets. Every route renders per request from cached SCAPI reads:
  each catalogue read in `lib/sfcc/index.ts` is a `"use cache"` function with
  `cacheLife("days")` and the tag `collections` (the categories),
  `products` (a product, search, recommendations) or both (a category's
  products, the home grid and carousel). The shopper's guest login, basket,
  checkout and order are never cached. The Worker binds the bucket
  (`NEXT_INC_CACHE_R2_BUCKET`) and exports two Durable Objects: the tag
  cache and the revalidation queue.
- **`tests/web`** — the store-name seam, the connection seam and its guest
  logins, `/api/health`, the URL helpers and the revalidation route
  (vitest). It does not
  run in a lane: the `dev` lane of `tests/web` installs it and checks its
  structure, so run `pnpm typecheck`, `pnpm lint` and `pnpm test` before you
  push.
- **`tooling/*`** — shared TypeScript and ESLint configuration, the wrangler
  renderer that turns `wrangler.template.jsonc` plus a wiring document into
  `wrangler.jsonc`, and the step that puts `SFCC_SECRET` and the
  revalidation secret on the Worker after its build.

Environments: **`stage`** and **`prod`** are deployed; **`dev` is
verify-only by design** — lanes build and dry-deploy, nothing deploys, and
no bucket exists for it (its build renders the committed fixture).

The Worker is about 2.5 MiB gzipped, inside Workers Free's 3 MiB.

## Identity and tenancy

Every remote operation runs against ONE Orun workspace, declared in
`intent.yaml` under `execution.state.workspace` — committed, enforced, and
what CI uses. Do not remove it; headless credentials depend on it. If it
reads `ws_SET_ME`, the bootstrap had no workspace to write: set the real one
before anything else.

## How deployment works

1. Merge (or push) to `main`.
2. CI (`.github/workflows/ci.yml`) runs `orun plan --changed` — only
   components whose files changed are planned — then runs each planned lane
   with `orun run --remote-state`, authenticated by GitHub OIDC (the
   exchange resolves this repository's linked workspace server-side).
3. **The bucket before the Worker.** `cloudflare-r2` applies for the
   environment and publishes `WIRING_CLOUDFLARE_R2`. `apps/web` declares an
   enforced `dependsOn` on it for pushes to `main`, so its deploy starts only
   after that apply — and a job resolves its secrets when it starts, so the
   document is there.
4. `apps/web` renders `wrangler.jsonc` from that document (the real bucket
   name) and builds once per environment: `NEXT_PUBLIC_SITE_URL` is the
   environment's `SITE_URL` (intent.yaml) or its workers.dev URL, and the
   store is the environment's `SFCC_CLIENT_ID`, `SFCC_ORGANIZATIONID`,
   `SFCC_SHORTCODE` and `SFCC_SITEID` secrets, when set — inlined by the
   build. The build runs without `SFCC_SECRET` and
   `SFCC_REVALIDATION_SECRET`; once it is done,
   `tooling/wire/worker-secrets.mjs` puts those (when set) on
   `sfcc-commerce-web-<env>`. `wrangler deploy` ships the Worker (the
   Durable Objects are created by the config's migration on the first
   deploy), and a smoke test fetches `/` and `/api/health`, which only the
   Worker answers.
5. `prod` deploys after `stage` has converged on the same commit
   (`environments.prod.promotion` in intent.yaml).
6. **The convergence run is the deployment.** A green run means every
   planned lane applied. Failed lanes are retried with
   `gh run rerun --failed`, which resumes the same execution.

On a pull request nothing applies or deploys: the R2 root plans, the
storefront builds and dry-deploys, and the edges in step 3 are advisory.

Caveats that matter:

- A push that touches no component files plans zero lanes — that run is
  green and deployed nothing. Never treat "latest run green" as "store
  converged"; probe the URLs instead.
- A change to `intent.yaml`'s `environments` maps to no component and
  redeploys nothing on its own. Land it with a change under `apps/web`.
- Setting or changing any `SFCC_*` secret deploys nothing: the four
  coordinates are read when the storefront builds, and the two Worker
  secrets are put on the Worker by its deploy. Redeploy it (below).
- `wrangler.jsonc` is generated. Edit `wrangler.template.jsonc`, run
  `pnpm run wire:fixture` and commit both; the deploy renders its own
  config from the template, so a stale committed render misleads local work.

## The store

- **No Salesforce store connected** (any of the four `SFCC_*` coordinates
  unset for the environment): the storefront calls nothing — no guest
  login, no read; every page answers 200 with an empty catalogue and the
  note "No Salesforce Commerce Cloud store is connected yet"; `/` says
  "Connect your Salesforce Commerce Cloud store" and how; the sitemap lists
  the home and content pages alone; adding to the cart or checking out says
  no store is connected; `/api/health` answers
  `{"ok":true,"connected":false}`.
- **Connected**: the header is the four `storeCatalog` categories (`mens`,
  `womens`, `newarrivals`, `top-seller` — RefArch's), the home page shows
  `hidden-homepage-featured-items` (grid) and `hidden-homepage-carousel`
  (carousel), falling back to `newarrivals` while those are empty, and the
  footer's pages are the fixed content in `lib/sfcc/content.ts`. Each
  catalogue read that misses the cache signs in a SLAS guest first: a
  public client's PKCE flow (authorize, then token), or a private client's
  `client_credentials` with `SFCC_SECRET`. A shopper who adds to the cart
  gets a basket and a guest token kept in cookies (`cartId`,
  `guest_token`, 30 minutes); a visitor without one costs no login. The
  checkout places an order in the instance and takes no payment (README,
  "Checkout"). `/api/health` answers `{"ok":true,"connected":true}`.
- **Revalidation**: `POST /api/revalidate?secret=<SFCC_REVALIDATION_SECRET>`
  with `x-sfcc-topic: products/{create,update,delete}` revalidates the
  `products` tag, and `collections/{create,update,delete}` the
  `collections` tag, in the Durable Object tag cache; the next request is
  served the old entry while a fresh one is read (stale-while-revalidate),
  and the one after shows the change. Any other topic answers 200 and drops
  nothing. A missing or wrong secret is refused (401, compared in constant
  time); with no secret set the route answers 503 and entries expire after
  their `days` lifetime.

## Secrets model

- **Brokered provider secrets**: `CLOUDFLARE_API_TOKEN` (the
  `workers-deploy` scope: Workers Scripts and KV Storage write) deploys the
  Worker; `CLOUDFLARE_R2_TOKEN` (the `r2-data` scope: R2 Storage write) is
  what the R2 root's Terraform authenticates with, because the deploy token
  carries no R2; `CLOUDFLARE_ACCOUNT_ID` is the connection fact both bind.
  Minted per run from the workspace's Cloudflare connection — no long-lived
  values at rest, nothing to rotate by hand.
- **Wiring**: `WIRING_CLOUDFLARE_R2` on `stage` and `prod`, written by the R2
  root's apply (lease-published), read by the Worker's build as
  `WIRING_CLOUDFLARE_R2_<ENV>`. It holds the bucket name, not a credential.
- **The store**: `SFCC_CLIENT_ID`, `SFCC_ORGANIZATIONID`, `SFCC_SHORTCODE`
  and `SFCC_SITEID` per environment, Orun secrets the owner sets (`orun
  secrets set … --env <env>`), optional — read by the build and inlined.
  None of them is a credential on its own: a public SLAS client is meant to
  be named in a browser, and its guest tokens act on a shopper's own basket,
  nothing of the instance's administration.
- **The Worker's secrets**: `SFCC_SECRET` (a private SLAS client's secret)
  and `SFCC_REVALIDATION_SECRET` per environment, Orun secrets the owner
  sets, optional. The build never sees them (`env -u`); the deploy hands
  them to `wrangler secret bulk` on `sfcc-commerce-web-<env>`.
- Inspect by NAME only: `orun secrets list --org <ws> --project` and
  `--env stage|prod`; `wrangler secret list --name sfcc-commerce-web-<env>`.
  No tooling in this repository prints a secret value, and no document in
  `ai/context/` may contain one.

## Verifying the system

```bash
# the storefront on each environment (also recorded, probed, in deployment.md);
# /api/health says whether a Salesforce store is connected
curl -s https://sfcc-commerce-web-stage.your-workers-subdomain.workers.dev/api/health
curl -s -o /dev/null -w '%{http_code}\n' https://sfcc-commerce-web-prod.your-workers-subdomain.workers.dev/

# the wiring and the store the deploys read, and workspace readiness
orun secrets list --org <ws> --env stage && orun secrets list --org <ws> --env prod
orun integrations list --org <ws> --json && orun cloud check --org <ws>
```

## Common operations

| task | how |
|---|---|
| change the storefront | edit `apps/web` (its name: `apps/web/app/site.ts`), merge |
| connect a Salesforce store | the README's "Connecting Salesforce Commerce Cloud": the four `SFCC_*` coordinates per environment (and `SFCC_SECRET` for a private client), then redeploy the storefront |
| let the catalogue revalidate | `SFCC_REVALIDATION_SECRET` per environment, redeploy, and have a job of yours call `/api/revalidate?secret=…` with an `x-sfcc-topic` when products or categories change |
| revalidate by hand | `curl -X POST -H "x-sfcc-topic: products/update" "https://<host>/api/revalidate?secret=<SFCC_REVALIDATION_SECRET>"` (`collections/update` for the categories) |
| change the home page's categories | the category ids in `apps/web/components/grid/three-items.tsx` and `apps/web/components/carousel.tsx`; the header's in `storeCatalog` (`apps/web/lib/sfcc/constants.ts`) |
| take payment | wire a payment processor into `addPaymentMethod` and `placeOrder` (`apps/web/lib/sfcc/index.ts`); the checkout records a masked card and takes none |
| deploy a change | merge to `main`; watch the run; failed lanes → `gh run rerun --failed` |
| deploy by hand | Orunbase's Deploy button, or `gh workflow run ci.yml --ref main -f environment=<env> [-f component=<a,b>]` — the named components (blank: every one) run in that environment as a merge runs them; started off `main` it is refused |
| redeploy without a change | edit the last line of `apps/web/component.yaml` (`# orun: redeploy <reason> <stamp>`) and merge — it is a deploy trigger, nothing reads it |
| empty the data cache | `POST /api/revalidate` with the secret twice, `products/update` and `collections/update`, or delete the bucket's `incremental-cache/` objects |
| add a binding (D1, KV, another bucket) | a Terraform root under `infra/terraform/` that publishes `WIRING_<ROOT>`, a token in `wrangler.template.jsonc`, its fixture entry, the root in the build's `--components`, the `WIRING_<ROOT>_<ENV>` secretEnv and an enforced `dependsOn` on it in `apps/web/component.yaml` |
| serve a custom domain | attach it to the Worker in Cloudflare and set `SITE_URL` for the environment in `intent.yaml` (README, "Custom domain"), then replace the placeholder `sfcc-commerce.example.com` in `intent.yaml`'s `BASE_DOMAIN` with it |
| add a runtime secret | an Orun secret for the build (`optionalSecretEnv` in `apps/web/component.yaml`); for one the Worker reads at request time, also `env -u` it from the build and add a `--secret` to the `worker-secrets.mjs` step |
| headless credentials | `ORUN_TOKEN` (workspace-scoped) + `GITHUB_TOKEN` |

The deployment record is the bootstrap's `02-docs` phase. Re-running it (the
Orun console's Retry on that phase, or `orun new … --phase 02-docs`)
re-probes the URLs and re-renders [deployment.md](deployment.md); it is
idempotent.

## Evolution

Structural changes follow the same contract that deployed the store: add a
component under `apps/`, `infra/` or `packages/` with a `component.yaml`,
land it as a pull request, and the convergence run applies it. When
@opennextjs/cloudflare runs Cache Components on workerd, turning them back on
(`cacheComponents: true` in place of `experimental.useCache`) restores
upstream's setting; the `"use cache"` reads need no change.
