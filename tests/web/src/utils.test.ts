import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// lib/utils.ts: the URL helpers the search pages and the cart use, and the
// environment's public origin the sitemap, robots.txt and metadata read.

const saved = process.env.NEXT_PUBLIC_SITE_URL;
beforeEach(() => {
  vi.resetModules();
  delete process.env.NEXT_PUBLIC_SITE_URL;
});
afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = saved;
});

describe("createUrl", () => {
  it("appends the query string only when there are params", async () => {
    const { createUrl } = await import("lib/utils");
    expect(createUrl("/search", new URLSearchParams({ q: "shirt", sort: "price-asc" }))).toBe(
      "/search?q=shirt&sort=price-asc",
    );
    expect(createUrl("/search", new URLSearchParams())).toBe("/search");
  });
});

describe("ensureStartsWith", () => {
  it("prefixes once", async () => {
    const { ensureStartsWith } = await import("lib/utils");
    expect(ensureStartsWith("search", "/")).toBe("/search");
    expect(ensureStartsWith("/search", "/")).toBe("/search");
  });
});

describe("baseUrl", () => {
  it("is the environment's NEXT_PUBLIC_SITE_URL, without a trailing slash", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://sfcc-commerce-web-stage.example.workers.dev/";
    const { baseUrl } = await import("lib/utils");
    expect(baseUrl).toBe("https://sfcc-commerce-web-stage.example.workers.dev");
  });

  it("is localhost when none is set (local development), never Vercel's URL", async () => {
    const { baseUrl } = await import("lib/utils");
    expect(baseUrl).toBe("http://localhost:3000");
  });
});
