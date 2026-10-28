# sfcc-commerce — implementation plan

| Milestone | Lands | Done when |
|---|---|---|
| SX0 — the spec | the repository born (intent, CI, tooling, spec index), this doc set, SX-1…SX-3 | on main |
| SX1 — the storefront on Workers | `apps/web` (upstream at `a474b5e` plus the departures in IMPLEMENTATION-STATUS), `infra/terraform/cloudflare-r2`, `tests/web` | typecheck, lint, upstream's check, tests/web and build green with no store; served unconnected and connected under `wrangler dev` |
| SX2 — a baseline | `blueprint.yaml`, `repo-blueprint.yaml`, `.baseline/`, the rename engine and bootstrap helpers, the record renderer, the context pack, `testing/` with the stand-in SCAPI + SLAS, `baseline.yml`, `tag.yml` | Baseline CI green; `baseline-v1` tagged |

Order inside SX1: the spike (Cache Components off, `useCache`, the R2/DO
caches, the SDK and the PKCE login on workerd, a cached read reused and
revalidated under `wrangler dev`, the Worker's size); the build-time
settings; the unconnected seam; the guest login only where a cart is; the
revalidation route; the Open Graph images on workerd; the workspace; the
tests.
