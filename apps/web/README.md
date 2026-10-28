# apps/web — the storefront

Vercel's Next.js Commerce for Salesforce Commerce Cloud (MIT, `license.md`)
on Cloudflare Workers + Static Assets: server components over Salesforce B2C
Commerce's Shopper APIs, every shopper a SLAS guest, a server-action cart and
checkout kept in your instance's basket, `"use cache"` reads revalidated by
tag. The upstream pages and components are kept; what this app adds is the
Workers build, the cache bindings, a storefront that says how to connect a
store while none is, a secret-checked revalidation route and `/api/health`.

- `app/` — the routes: home, `/search`, `/search/<category>`,
  `/product/<id>`, the content pages (`[page]`), `/checkout` (information,
  shipping, payment) and `/checkout/confirmation`, the Open Graph images,
  `robots.txt`, `sitemap.xml`, `/api/revalidate` and `/api/health`
- `app/site.ts` — the store's name and the repository its footer links to
- `lib/sfcc/` — the SCAPI client (`commerce-sdk-isomorphic`), the SLAS guest
  login (a public client's PKCE flow, or a private client's secret), the
  cached readers and their tags, the cart and checkout calls, the reshaping
  to the page's types, and the revalidation route's logic; `connection.ts`
  says whether a store is connected, and while none is every reader answers
  empty without a call
- `components/` — cart (server actions, modal), checkout forms, navbar,
  grid, carousel, product gallery and variants, the connect-store note

```bash
pnpm dev        # next dev on http://localhost:3000
pnpm build      # next build --webpack + opennextjs-cloudflare build → .open-next/
pnpm test       # upstream's check: the prettier format check
pnpm preview    # wrangler dev over the built Worker: a local R2 bucket, local Durable Objects
```

The cache's bucket is not hand-written. `wrangler.template.jsonc` names it as
a wiring token; `wrangler.jsonc` is that template rendered from
`wiring.fixture.json` (placeholder names, for local work and verification),
and every deploy renders it again from the name the `cloudflare-r2` Terraform
root published for the environment (`component.yaml`'s `buildCommand`).

## Store backend

| The four `SFCC_*` coordinates | catalogue                                                                                      | cart and checkout                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| unset (a fresh deploy)        | empty; `/` says "Connect your Salesforce Commerce Cloud store" and every page carries the note | none                                             |
| set (read by the build)       | the Shopper APIs, cached in R2 (`"use cache"`), revalidated through `/api/revalidate`          | the instance's own basket and order, per shopper |

Connecting a store is four Orun secrets and a redeploy (five for a private
SLAS client), and revalidation one more — the repository's README,
"Connecting Salesforce Commerce Cloud".
