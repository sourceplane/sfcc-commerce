#!/usr/bin/env node
// A stand-in Salesforce B2C Commerce (SCAPI + SLAS), for testing a CONNECTED
// storefront offline.
//
//   node fake-sfcc.mjs --port <n> --client <clientId> --org <organizationId> --site <siteId> [--secret <s>]
//
// It answers what lib/sfcc calls, shaped as SCAPI answers it:
//   SLAS (public client, guest PKCE): GET  /shopper/auth/v1/organizations/{org}/oauth2/authorize
//                                     POST /shopper/auth/v1/organizations/{org}/oauth2/token
//   SLAS (private client, with --secret): POST …/oauth2/token, grant_type=client_credentials
//                                     and `Authorization: Basic base64(client:secret)`
//   Shopper Products: GET /product/shopper-products/v1/organizations/{org}/categories?ids=
//                     GET /product/shopper-products/v1/organizations/{org}/products/{id}
//   Shopper Search:   GET /search/shopper-search/v1/organizations/{org}/product-search
//   Shopper Baskets:  POST /checkout/shopper-baskets/v1/organizations/{org}/baskets
//                     GET  …/baskets/{id}   POST …/baskets/{id}/items   DELETE …/baskets/{id}/items/{item}
// Every Shopper API call must carry a guest token this server issued
// (`Authorization: Bearer guest-…`), and the configured site and organization;
// otherwise the answer is SCAPI's 401/400.
//
// Control (for the e2e's cache assertions):
//   GET  /__calls → {"<operation>": <reads>, …} since the last reset
//   POST /__reset → zero the counts
//   POST /__bump  → every product name says the next version ("v2", …)
//   GET  /media/* → a tiny SVG, for every image URL it hands out
//
// The catalogue: three products in the storefront's four categories (mens,
// womens, newarrivals, top-seller), all three in the two hidden categories
// the home page's grid and carousel read (hidden-homepage-featured-items,
// hidden-homepage-carousel — the README's "Store configuration").
import { createServer } from "node:http";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const port = Number(arg("port") ?? 4030);
const client = arg("client") ?? "";
const org = arg("org") ?? "";
const site = arg("site") ?? "";
const secret = arg("secret") ?? "";
if (!client || !org || !site) {
  console.error("usage: fake-sfcc.mjs --port <n> --client <id> --org <org> --site <site>");
  process.exit(2);
}
const origin = `http://127.0.0.1:${port}`;

let version = 1;
let calls = {};
let tokens = 0;
const issued = new Set();
const codes = new Map();
const baskets = new Map();
const count = (op) => (calls[op] = (calls[op] ?? 0) + 1);

const CATEGORIES = [
  { id: "mens", name: "Mens", description: "Clothing for men", pageTitle: "Mens" },
  { id: "womens", name: "Womens", description: "Clothing for women", pageTitle: "Womens" },
  { id: "newarrivals", name: "New Arrivals", description: "Just in", pageTitle: "New Arrivals" },
  { id: "top-seller", name: "Top Sellers", description: "Best sellers", pageTitle: "Top Sellers" },
];

const HOME = ["hidden-homepage-featured-items", "hidden-homepage-carousel"];
const PRODUCTS = [
  { id: "sample-shirt", base: "Sample Shirt", price: 25, cat: "mens", cats: ["mens", "top-seller", ...HOME] },
  { id: "sample-dress", base: "Sample Dress", price: 49, cat: "womens", cats: ["womens", ...HOME] },
  { id: "sample-scarf", base: "Sample Scarf", price: 18, cat: "newarrivals", cats: ["newarrivals", ...HOME] },
];

function product(p) {
  return {
    id: p.id,
    name: `${p.base} v${version}`,
    shortDescription: `The ${p.base.toLowerCase()}, a stand-in product.`,
    longDescription: `<p>The ${p.base.toLowerCase()}, a stand-in product.</p>`,
    primaryCategoryId: p.cat,
    currency: "USD",
    price: p.price,
    priceMax: p.price,
    pageTitle: p.base,
    pageDescription: `Buy the ${p.base.toLowerCase()}.`,
    imageGroups: [
      {
        viewType: "large",
        images: [{ alt: p.base, link: `${origin}/media/${p.id}.svg`, disBaseLink: `${origin}/media/${p.id}.svg` }],
      },
    ],
    variationAttributes: [],
    variants: [],
    type: { item: true },
    inventory: { orderable: true, ats: 10 },
  };
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function authed(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
  return Boolean(m && issued.has(m[1]));
}

function basketOut(b) {
  return {
    basketId: b.id,
    currency: "USD",
    productItems: b.items.map((it) => {
      const p = PRODUCTS.find((x) => x.id === it.productId);
      return {
        itemId: it.itemId,
        productId: it.productId,
        productName: p ? `${p.base} v${version}` : it.productId,
        quantity: it.quantity,
        price: (p?.price ?? 0) * it.quantity,
      };
    }),
    productSubTotal: b.items.reduce((s, it) => s + (PRODUCTS.find((x) => x.id === it.productId)?.price ?? 0) * it.quantity, 0),
    orderTotal: b.items.reduce((s, it) => s + (PRODUCTS.find((x) => x.id === it.productId)?.price ?? 0) * it.quantity, 0),
    taxTotal: 0,
    shippingTotal: 0,
  };
}

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", origin);
  const p = url.pathname;

  if (p === "/__calls") return json(res, 200, calls);
  if (p === "/__reset" && req.method === "POST") return ((calls = {}), json(res, 200, { ok: true }));
  if (p === "/__bump" && req.method === "POST") return (version++, json(res, 200, { version }));
  if (p.startsWith("/media/")) {
    res.writeHead(200, { "content-type": "image/svg+xml" });
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>');
  }

  const slas = `/shopper/auth/v1/organizations/${org}/oauth2`;
  if (p === `${slas}/authorize` && req.method === "GET") {
    count("slas.authorize");
    if (url.searchParams.get("client_id") !== client || url.searchParams.get("channel_id") !== site) {
      return json(res, 400, { title: "Bad Request", detail: "unknown client or channel" });
    }
    const challenge = url.searchParams.get("code_challenge") ?? "";
    const code = `code-${Math.random().toString(36).slice(2)}`;
    codes.set(code, challenge);
    const redirect = new URL(url.searchParams.get("redirect_uri") ?? "http://localhost:3000/callback");
    redirect.searchParams.set("code", code);
    redirect.searchParams.set("usid", "usid-1");
    res.writeHead(303, { location: redirect.toString() });
    return res.end();
  }
  if (p === `${slas}/token` && req.method === "POST") {
    count("slas.token");
    const form = new URLSearchParams(await body(req));
    if (form.get("grant_type") === "client_credentials") {
      const basic = `Basic ${Buffer.from(`${client}:${secret}`).toString("base64")}`;
      if (!secret || req.headers.authorization !== basic || form.get("channel_id") !== site) {
        return json(res, 401, { error: "unauthorized_client" });
      }
      const token = `guest-${++tokens}`;
      issued.add(token);
      return json(res, 200, { access_token: token, token_type: "Bearer", expires_in: 1800, usid: "usid-1" });
    }
    const code = form.get("code") ?? "";
    const verifier = form.get("code_verifier") ?? "";
    const challenge = codes.get(code);
    const { createHash } = await import("node:crypto");
    const expected = createHash("sha256").update(verifier).digest("base64url");
    if (form.get("grant_type") !== "authorization_code_pkce" || !challenge || challenge !== expected) {
      return json(res, 400, { error: "invalid_grant" });
    }
    codes.delete(code);
    const token = `guest-${++tokens}`;
    issued.add(token);
    return json(res, 200, { access_token: token, token_type: "Bearer", expires_in: 1800, usid: "usid-1" });
  }

  const api = (family, name) => `/${family}/${name}/v1/organizations/${org}`;
  const shopper = p.startsWith(api("product", "shopper-products")) || p.startsWith(api("search", "shopper-search")) || p.startsWith(api("checkout", "shopper-baskets"));
  if (shopper) {
    if (!authed(req)) return json(res, 401, { title: "Unauthorized", detail: "a valid shopper token is required" });
    if (url.searchParams.get("siteId") !== site) return json(res, 400, { title: "Bad Request", detail: "siteId" });
  }

  if (p === `${api("product", "shopper-products")}/categories` && req.method === "GET") {
    count("products.getCategories");
    const ids = (url.searchParams.get("ids") ?? "").split(",");
    const data = CATEGORIES.filter((c) => ids.includes(c.id));
    return json(res, 200, { data, total: data.length, limit: data.length });
  }
  let m;
  if ((m = new RegExp(`^${api("product", "shopper-products")}/products/([^/]+)$`).exec(p)) && req.method === "GET") {
    count("products.getProduct");
    const found = PRODUCTS.find((x) => x.id === decodeURIComponent(m[1]));
    if (!found) return json(res, 404, { title: "Not Found", detail: "product" });
    return json(res, 200, product(found));
  }
  if (p === `${api("search", "shopper-search")}/product-search` && req.method === "GET") {
    count("search.productSearch");
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const refine = url.searchParams.getAll("refine");
    const cgid = refine.map((r) => /^cgid=(.+)$/.exec(r)?.[1]).find(Boolean);
    let hits = PRODUCTS;
    if (cgid) hits = hits.filter((x) => x.cats.includes(cgid));
    if (q) hits = hits.filter((x) => x.base.toLowerCase().includes(q));
    return json(res, 200, {
      hits: hits.map((x) => ({ productId: x.id, productName: `${x.base} v${version}`, price: x.price, currency: "USD" })),
      total: hits.length,
      limit: Number(url.searchParams.get("limit") ?? 25),
      offset: 0,
      query: q,
    });
  }
  const bk = api("checkout", "shopper-baskets");
  if (p === `${bk}/baskets` && req.method === "POST") {
    count("baskets.createBasket");
    const id = `basket-${baskets.size + 1}`;
    baskets.set(id, { id, items: [] });
    return json(res, 200, basketOut(baskets.get(id)));
  }
  if ((m = new RegExp(`^${bk}/baskets/([^/]+)$`).exec(p)) && req.method === "GET") {
    count("baskets.getBasket");
    const b = baskets.get(m[1]);
    return b ? json(res, 200, basketOut(b)) : json(res, 404, { title: "Not Found", detail: "basket" });
  }
  if ((m = new RegExp(`^${bk}/baskets/([^/]+)/items$`).exec(p)) && req.method === "POST") {
    count("baskets.addItemToBasket");
    const b = baskets.get(m[1]);
    if (!b) return json(res, 404, { title: "Not Found", detail: "basket" });
    for (const line of JSON.parse(await body(req))) {
      b.items.push({ itemId: `item-${b.items.length + 1}`, productId: line.productId, quantity: line.quantity });
    }
    return json(res, 200, basketOut(b));
  }
  if ((m = new RegExp(`^${bk}/baskets/([^/]+)/items/([^/]+)$`).exec(p)) && req.method === "DELETE") {
    count("baskets.removeItemFromBasket");
    const b = baskets.get(m[1]);
    if (!b) return json(res, 404, { title: "Not Found", detail: "basket" });
    b.items = b.items.filter((it) => it.itemId !== m[2]);
    return json(res, 200, basketOut(b));
  }

  json(res, 404, { title: "Not Found", detail: p });
}).listen(port, "127.0.0.1", () => console.log(`fake sfcc on ${origin}`));
