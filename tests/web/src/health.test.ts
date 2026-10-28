import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// app/api/health: the deploy's smoke check. It answers ok without touching
// Salesforce, and says whether this build has a store.

const KEYS = ["SFCC_CLIENT_ID", "SFCC_ORGANIZATIONID", "SFCC_SHORTCODE", "SFCC_SITEID"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  vi.resetModules();
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("GET /api/health", () => {
  it("is ok and not connected on a fresh build", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, connected: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("says connected once all four coordinates are there, still without a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    process.env.SFCC_CLIENT_ID = "a-client";
    process.env.SFCC_ORGANIZATIONID = "f_ecom_test_001";
    process.env.SFCC_SHORTCODE = "test0001";
    process.env.SFCC_SITEID = "TestSite";
    const { GET } = await import("app/api/health/route");
    expect(await (await GET()).json()).toEqual({ ok: true, connected: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
