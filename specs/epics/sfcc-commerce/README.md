# sfcc-commerce — Next.js Commerce for Salesforce Commerce Cloud on Cloudflare Workers

**Vercel's Salesforce Commerce Cloud starter is Next.js Commerce on B2C
Commerce's Shopper APIs, every shopper signed in as a SLAS guest, with
Next.js 16's Cache Components on. The port keeps every one of its
`"use cache"` reads — their lifetimes and their tags — and moves them onto
Cloudflare: one Worker, its data cache in R2, its tag cache in Durable
Objects, and the revalidation route made to refuse a wrong secret. Cache
Components are the one thing the adapter cannot run yet; a spike proved the
fallback keeps the caching honest before anything was built on it. A
product built from it deploys before its owner connects a store, and sells
from theirs once they set its SLAS client and site.**

| | |
|---|---|
| Status | In progress — SX0 on main |
| Upstream | [vercel-partner-solutions/nextjs-salesforce-commerce-cloud](https://github.com/vercel-partner-solutions/nextjs-salesforce-commerce-cloud) (MIT, `license.md`), at `a474b5e` (2026-08-18) |
| Reference | [commerce](https://github.com/sourceplane/commerce), [shopware-commerce](https://github.com/sourceplane/shopware-commerce), [saleor-commerce](https://github.com/sourceplane/saleor-commerce) — the same OpenNext, R2 and Durable Object shape for a Next.js Commerce storefront on a hosted commerce API, and the same unconnected state |
| Key | `SX` |

## Read in this order

1. [design.md](design.md) — the storefront, how each Vercel piece maps to
   Cloudflare, the cache and the spike that proved it, build-time settings,
   the unconnected store, the guest login, revalidation, the tests, and the
   alternatives rejected.
2. [implementation-plan.md](implementation-plan.md) — the milestones and
   what each one lands.
3. [risks-and-open-questions.md](risks-and-open-questions.md) — what is not
   proven, and what was accepted.
4. [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) — what shipped, and
   every departure from upstream.

## Milestones

| Milestone | What it lands | Task |
|---|---|---|
| SX0 — the spec | this doc set and the three task contracts | SX-1 |
| SX1 — the storefront on Workers | `apps/web`, the R2 root, `tests/web` | SX-2 |
| SX2 — a baseline | the card, the build document, the rename, the tiers | SX-3 |
