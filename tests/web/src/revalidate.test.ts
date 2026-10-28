import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// app/api/revalidate → lib/sfcc's `revalidate`, upstream's door: the caller
// names the change in `x-sfcc-topic` and proves itself with `?secret=`.
// Upstream answered 200 to a wrong or missing secret; here it is refused
// (401), compared in constant time, and the door is off (503) while no
// SFCC_REVALIDATION_SECRET is set. A topic that is not a catalogue change
// drops nothing.

const { revalidateTag, topic } = vi.hoisted(() => ({ revalidateTag: vi.fn(), topic: { value: "" } }));
vi.mock("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag,
}));
// next/headers' headers() reads the request in flight; here it is the one
// each case builds.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(topic.value ? { "x-sfcc-topic": topic.value } : {}),
}));

const SECRET = "the-revalidation-secret";
const saved = process.env.SFCC_REVALIDATION_SECRET;

function call(opts: { secret?: string; topic?: string } = {}) {
  const url = new URL("https://sfcc-commerce-web-stage.example.workers.dev/api/revalidate");
  if (opts.secret !== undefined) url.searchParams.set("secret", opts.secret);
  topic.value = opts.topic ?? "";
  const headers = new Headers(opts.topic ? { "x-sfcc-topic": opts.topic } : {});
  return new NextRequest(url, { method: "POST", headers });
}

async function post(req: NextRequest) {
  const { POST } = await import("app/api/revalidate/route");
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  vi.resetModules();
  revalidateTag.mockReset();
  process.env.SFCC_REVALIDATION_SECRET = SECRET;
});
afterEach(() => {
  if (saved === undefined) delete process.env.SFCC_REVALIDATION_SECRET;
  else process.env.SFCC_REVALIDATION_SECRET = saved;
});

describe("POST /api/revalidate", () => {
  it("is off (503) while no secret is configured, whatever is sent", async () => {
    delete process.env.SFCC_REVALIDATION_SECRET;
    for (const req of [
      call(),
      call({ secret: "", topic: "products/update" }),
      call({ secret: "anything", topic: "products/update" }),
    ]) {
      const { status, body } = await post(req);
      expect(status).toBe(503);
      expect(body.revalidated).toBe(false);
    }
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("refuses a missing, empty or wrong secret (401) — upstream answered 200", async () => {
    for (const req of [
      call({ topic: "products/update" }),
      call({ secret: "", topic: "products/update" }),
      call({ secret: "wrong", topic: "products/update" }),
      call({ secret: `${SECRET}-and-more`, topic: "products/update" }),
      call({ secret: SECRET.slice(0, -1), topic: "products/update" }),
    ]) {
      const { status, body } = await post(req);
      expect(status).toBe(401);
      expect(body.revalidated).toBe(false);
    }
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("drops nothing for a topic that is not a catalogue change", async () => {
    for (const t of [undefined, "orders/create", "cart/update"]) {
      const { status, body } = await post(call({ secret: SECRET, topic: t }));
      expect(status).toBe(200);
      expect(body.revalidated).toBe(false);
    }
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("a product change drops the products tag alone, stale-while-revalidate", async () => {
    for (const t of ["products/create", "products/update", "products/delete"]) {
      revalidateTag.mockReset();
      const { status, body } = await post(call({ secret: SECRET, topic: t }));
      expect(status).toBe(200);
      expect(body.revalidated).toBe(true);
      expect(revalidateTag.mock.calls).toEqual([["products", "max"]]);
    }
  });

  it("a category change drops the collections tag alone", async () => {
    const { body } = await post(call({ secret: SECRET, topic: "collections/update" }));
    expect(body.revalidated).toBe(true);
    expect(revalidateTag.mock.calls).toEqual([["collections", "max"]]);
  });

  it("never drops the cart", async () => {
    await post(call({ secret: SECRET, topic: "products/update" }));
    await post(call({ secret: SECRET, topic: "collections/update" }));
    expect(revalidateTag.mock.calls.map((c) => c[0])).not.toContain("cart");
  });
});
