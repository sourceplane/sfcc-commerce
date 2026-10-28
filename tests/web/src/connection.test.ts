import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, reset, startFake, STORE } from "./fake";

// lib/sfcc/connection.ts and the guards in lib/sfcc: a build with no store
// (every fresh product) answers every reader empty without a single request
// leaving the Worker; a connected one logs in as a SLAS guest — public client
// (PKCE) or private client (SFCC_SECRET) — and reads the Shopper APIs; and a
// visitor without a cart costs no login at all.

vi.mock("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: vi.fn(),
}));
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers(),
}));

const KEYS = [
  "SFCC_CLIENT_ID",
  "SFCC_ORGANIZATIONID",
  "SFCC_SHORTCODE",
  "SFCC_SITEID",
  "SFCC_SECRET",
  "SFCC_API_ORIGIN",
] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function connect(origin: string) {
  process.env.SFCC_CLIENT_ID = STORE.client;
  process.env.SFCC_ORGANIZATIONID = STORE.org;
  process.env.SFCC_SHORTCODE = STORE.shortCode;
  process.env.SFCC_SITEID = STORE.site;
  process.env.SFCC_API_ORIGIN = origin;
}

beforeEach(() => {
  vi.resetModules();
  jar.clear();
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("isSFCCConfigured", () => {
  it("needs all four of the client id, organization, short code and site", async () => {
    const { isSFCCConfigured } = await import("lib/sfcc/connection");
    expect(isSFCCConfigured()).toBe(false);
    process.env.SFCC_CLIENT_ID = STORE.client;
    process.env.SFCC_ORGANIZATIONID = STORE.org;
    process.env.SFCC_SHORTCODE = STORE.shortCode;
    expect(isSFCCConfigured()).toBe(false);
    process.env.SFCC_SITEID = "  ";
    expect(isSFCCConfigured()).toBe(false);
    process.env.SFCC_SITEID = STORE.site;
    expect(isSFCCConfigured()).toBe(true);
  });

  it("does not count SFCC_SECRET: a public client has none", async () => {
    const { isSFCCConfigured } = await import("lib/sfcc/connection");
    process.env.SFCC_SECRET = "a-secret";
    expect(isSFCCConfigured()).toBe(false);
  });
});

describe("with no store connected", () => {
  it("every reader answers empty, fetches nothing and logs nothing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    jar.set("cartId", "a-basket");
    jar.set("orderId", "an-order");
    const sfcc = await import("lib/sfcc");

    expect(await sfcc.getCollections()).toEqual([]);
    expect(await sfcc.getCollection("mens")).toBeUndefined();
    expect(await sfcc.getProduct("sample-shirt")).toBeUndefined();
    expect(await sfcc.getCollectionProducts({ collection: "hidden-homepage-carousel" })).toEqual([]);
    expect(await sfcc.getProducts({ query: "shirt" })).toEqual([]);
    expect(await sfcc.getCart()).toBeUndefined();
    expect(await sfcc.getCheckoutOrder()).toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    expect(logs).not.toHaveBeenCalled();
  });

  it("a cart write refuses with SFCCNotConnected before any request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const sfcc = await import("lib/sfcc");
    const { SFCCNotConnected } = await import("lib/sfcc/connection");
    await expect(sfcc.createCart()).rejects.toBeInstanceOf(SFCCNotConnected);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("with a store connected", () => {
  let fake: Awaited<ReturnType<typeof startFake>>;
  beforeAll(async () => {
    fake = await startFake();
  });
  afterAll(() => fake.stop());
  beforeEach(async () => {
    await reset(fake.origin);
  });

  it("logs in as a guest through the public client's PKCE flow, then reads the product", async () => {
    connect(fake.origin);
    const sfcc = await import("lib/sfcc");
    const product = await sfcc.getProduct("sample-shirt");
    expect(product?.title).toBe("Sample Shirt v1");
    expect(await calls(fake.origin)).toEqual({
      "slas.authorize": 1,
      "slas.token": 1,
      "products.getProduct": 1,
    });
  });

  it("logs in with SFCC_SECRET as a private client, without the authorize step", async () => {
    connect(fake.origin);
    process.env.SFCC_SECRET = STORE.secret;
    const sfcc = await import("lib/sfcc");
    const collections = await sfcc.getCollections();
    expect(collections.map((c) => c.handle)).toContain("mens");
    expect(await calls(fake.origin)).toEqual({ "slas.token": 1, "products.getCategories": 1 });
  });

  it("a visitor without a cart costs no guest login", async () => {
    connect(fake.origin);
    const sfcc = await import("lib/sfcc");
    expect(await sfcc.getCart()).toBeUndefined();
    expect(await calls(fake.origin)).toEqual({});
  });

  it("search reads the product search with the query", async () => {
    connect(fake.origin);
    const sfcc = await import("lib/sfcc");
    const found = await sfcc.getProducts({ query: "dress" });
    expect(found.map((p) => p.title)).toEqual(["Sample Dress v1"]);
    expect((await calls(fake.origin))["search.productSearch"]).toBe(1);
  });
});
