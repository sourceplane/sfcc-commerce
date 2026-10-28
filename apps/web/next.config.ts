import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Upstream turns on `cacheComponents`. Its staged rendering cannot yet run
  // on workerd under @opennextjs/cloudflare 1.20 (opennextjs-cloudflare#1450:
  // every request hangs), so — as the commerce baseline this port follows —
  // it is off, and `experimental.useCache` keeps the `"use cache"` directives
  // lib/sfcc caches every Shopper API read with (tagged `collections` /
  // `products`, `cacheLife("days")`). Routes render per request; the reads
  // are served from the cache (open-next.config.ts) until they expire or
  // app/api/revalidate drops their tag.
  experimental: {
    inlineCss: true,
    useCache: true,
  },
  // The catalogue's images come from the owner's own instance (its DIS or
  // static host), unknown until a store is connected; they are served as
  // the instance sends them.
  images: {
    unoptimized: true,
  },
  // The store this build talks to, decided at build time (component.yaml's
  // buildCommand passes the environment's Orun secrets): unset, every page
  // renders without calling Salesforce and says how to connect a store
  // (lib/sfcc/connection.ts). These four are the SLAS client's public
  // coordinates. SFCC_SECRET (a private client's secret) and
  // SFCC_REVALIDATION_SECRET are NOT here: they are Worker secrets, read per
  // request. SFCC_API_ORIGIN is the e2e's stand-in, empty in a product.
  env: {
    SFCC_CLIENT_ID: process.env.SFCC_CLIENT_ID ?? "",
    SFCC_ORGANIZATIONID: process.env.SFCC_ORGANIZATIONID ?? "",
    SFCC_SHORTCODE: process.env.SFCC_SHORTCODE ?? "",
    SFCC_SITEID: process.env.SFCC_SITEID ?? "",
    SFCC_API_ORIGIN: process.env.SFCC_API_ORIGIN ?? "",
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "",
    COMPANY_NAME: process.env.COMPANY_NAME ?? "",
  },
  // Required by @opennextjs/cloudflare, which bundles `.next/standalone/**`
  // into the Worker. Trace from the monorepo root so workspace dependencies
  // resolve from the root node_modules.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;

// `next dev` reaches the Worker's bindings (the R2 cache bucket, the cache
// Durable Objects) through a local miniflare built from wrangler.jsonc.
initOpenNextCloudflareForDev();
