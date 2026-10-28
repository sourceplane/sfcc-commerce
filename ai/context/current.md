# sfcc-commerce — where this repository stands

The entry page for anyone (or any agent) picking this repository up. It is
this repository's own state and does not ship to a storefront built from it;
the two pages that do are [operations.md](operations.md) and
[deployment.md](deployment.md).

## What it is

Vercel's Next.js Commerce for Salesforce Commerce Cloud
(vercel-partner-solutions/nextjs-salesforce-commerce-cloud — Next.js Commerce
on Salesforce B2C Commerce's Shopper APIs, every shopper a SLAS guest) on
Cloudflare Workers + Static Assets through `@opennextjs/cloudflare`, its
Next.js cache in an R2 bucket and two Durable Objects the Worker exports,
packaged as an Orun baseline: `orun new --blueprint repo-blueprint.yaml`
builds a new storefront in its own repository and takes it to live on stage
and prod in one landing (`01-product`) — the R2 bucket applied before the
Worker that binds it — then records what went live (`02-docs`). With no
Salesforce store connected every page answers with an empty catalogue and `/`
says "Connect your Salesforce Commerce Cloud store"; the owner connects one by
setting its SLAS client id, organization, short code and site as Orun secrets
and redeploying. The Worker is about 2.5 MiB gzipped (`next build --webpack`),
so Workers Free is enough.

## Release

| | |
|---|---|
| Latest tag | `baseline-v1` (SX2) |
| Proven live | No. Everything short of the platform is proven offline in Baseline CI — the storefront built and served as born, then connected to a stand-in SCAPI + SLAS, its cache reused (a second visit reads Salesforce not at all, guest login included) and revalidated through the secret-checked route. The tokens minted, a real R2 apply, a real `wrangler deploy`, the probes and a real B2C Commerce instance are still to come (risk SX-A) |

## Where to read

| Question | Page |
|---|---|
| What shipped, and every departure from upstream | `specs/epics/sfcc-commerce/IMPLEMENTATION-STATUS.md` |
| Why it is built this way | [decisions.md](decisions.md), then `specs/epics/sfcc-commerce/design.md` |
| What could still go wrong | [open-risks.md](open-risks.md), then `specs/epics/sfcc-commerce/risks-and-open-questions.md` |
| The spike that proved the caching on Workers | `specs/epics/sfcc-commerce/design.md` §4 |
| How to instantiate it | `BOOTSTRAP.md`, `docs/phases/` |
| What each component is | `apps/web/docs/`, `infra/terraform/cloudflare-r2/docs/`, `tests/web/docs/` (generated; `python3 tooling/catalog/gen-component-docs.py`) |

## Next

1. Bootstrap one storefront from `baseline-v1` and record its timings;
   connect Salesforce's public demo instance to it once (the values in
   `apps/web/.env.example`), call the revalidation route, and browse a
   product into the cart. That closes SX-A.
2. When an npm release of @opennextjs/cloudflare runs Cache Components on
   workerd (opennextjs-cloudflare#1450), turn them back on (SX-C).
