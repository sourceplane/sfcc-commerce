# sfcc-commerce — risks and open questions

| ID | Risk | State | Notes |
|---|---|---|---|
| SX-A | Not proven live: the repository and link, the minted tokens, a real `terraform apply` and `wrangler deploy`, the Worker secrets put on a real Worker, the probes, a real B2C Commerce instance | OPEN | Baseline CI proves everything else offline; one bootstrap with Salesforce's public demo instance connected closes it |
| SX-B | Size: the Worker is 2.53 MiB gzipped with webpack, half a MiB under Workers Free's 3 MiB; Turbopack's is 3.13 MiB | WATCH | `wrangler deploy --dry-run` after a build prints the size; a dependency upgrade could cross the line |
| SX-C | Cache Components off | ACCEPTED | opennextjs-cloudflare#1450; turning them back on needs no change to the `"use cache"` reads |
| SX-D | Next pinned to 16.3.8 (upstream 16.3.1) | ACCEPTED | The adapter's peer range starts at 16.3.8 on 16.x; 16.4.x fails every request on 1.20.11 |
| SX-E | Images unoptimized | ACCEPTED | B2C Commerce serves its own image sizes; the owner's image host is not known at build |
| SX-F | `revalidateTag(tag, "max")` is stale-while-revalidate | ACCEPTED | The first request after a revalidation may be served the old entry while the fresh one is read; the e2e allows ten visits |
| SX-G | The e2e's store is a stand-in: the calls the storefront makes, answered from a three-product catalogue; no item is added to a basket end to end, and no order placed | ACCEPTED | The stand-in answers the basket calls; a real instance is SX-A |
| SX-H | The store's name: the rename rewrites one line and the sweep does not look for it | ACCEPTED, gated | The leak gate fails any other spelling under `app/`, `components/` and `lib/`; the placement and e2e tiers check the branded product |
| SX-I | The checkout takes no payment: a `CREDIT_CARD` instrument with the card's type and masked number, then the order | OPEN — the owner's | Upstream's own demo checkout; stated in the product's README ("Checkout") |
| SX-J | Two coarse tags: revalidating `products` drops every product entry | ACCEPTED | Upstream's own tags; a finer scheme would change every reader |
| SX-K | The SLAS client id, organization, short code and site are inlined into the Worker's bundle | ACCEPTED | None is a credential on its own (a public client is meant to be named in a browser); no client bundle carries them; they are Orun secrets, never committed. `SFCC_SECRET` is a Worker secret |
| SX-L | Upstream's check failed upstream (prettier on six files at `a474b5e`): formatted once; upstream had no linter, and the workspace's ESLint allows unused arguments (upstream's server actions keep theirs) and found one dead line (`hasPayment`), removed | ACCEPTED | No behaviour changes |
| SX-M | A private SLAS client's login is proven against the stand-in in `tests/web`, on Node; the e2e browses as a public client on workerd | WATCH | The SDK's other calls run on workerd in the e2e; the first connected deployment with a private client closes it |
| SX-N | Every catalogue read that misses the cache logs a SLAS guest in first, as upstream does | ACCEPTED | A guest login per cache miss, not per visit; a shared entry must not hold a shopper's token |
