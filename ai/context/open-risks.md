# sfcc-commerce — open risks

What is not yet proven or not yet decided. The full write-up of every risk,
including the accepted and resolved ones, is
`specs/epics/sfcc-commerce/risks-and-open-questions.md`; this page lists only what
is still live, so it should be short.

| ID | Risk | State | What closes it |
|---|---|---|---|
| SX-A | No live bootstrap yet: the repository created and linked, the two tokens minted, a real `terraform apply`, a real `wrangler deploy` with the R2 and Durable Object bindings and the Worker secrets, the probes, and a real B2C Commerce instance connected | OPEN | One bootstrap from a tag against a workspace, then Salesforce's public demo instance connected and a product browsed into the cart |
| SX-B | Size headroom: the Worker is 2.53 MiB gzipped with webpack, half a MiB under Workers Free's 3 MiB (Turbopack's is over) | WATCH | `wrangler deploy --dry-run` in `apps/web` after a build prints the gzipped size; over 3 MiB, a Free account refuses the deploy |
| SX-C | Cache Components off until @opennextjs/cloudflare runs them on workerd | ACCEPTED | An npm release with a fix for opennextjs-cloudflare#1450 |
| SX-I | The checkout takes no payment: it records a masked card on the basket and places the order, as upstream's demo does | OPEN — the owner's, stated in the README ("Checkout") | The owner wires a payment processor into `addPaymentMethod` and `placeOrder` |
| SX-M | A private SLAS client's login (`SFCC_SECRET`) is proven against the stand-in in the unit tests, on Node, not on workerd; the e2e browses as a public client | WATCH | The first connected deployment with a private client |

Accepted, and worth knowing before you change them: SX-D (Next pinned to
16.3.8 with the adapter), SX-E (images unoptimized), SX-F (the first request
after a revalidation may be stale), SX-G (the stand-in is not an instance),
SX-H (the store-name seam; gated), SX-J (two coarse tags), SX-K (the SLAS
client id is in the Worker's bundle), SX-L (upstream's format check, and the
added linter).
