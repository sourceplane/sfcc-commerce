import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_NAME, SOURCE_URL } from "app/site";

// The identity seam a product's bootstrap rewrites (app/site.ts): one literal
// line each, read by the titles, the footer and the Open Graph image.
describe("site identity (apps/web/app/site.ts)", () => {
  it("names the site and links its source repository", () => {
    expect(SITE_NAME.trim()).not.toBe("");
    expect(SOURCE_URL).toMatch(/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[a-z0-9-]+$/);
  });

  it("keeps both on a literal line of their own", () => {
    const src = readFileSync(resolve(__dirname, "../../../apps/web/app/site.ts"), "utf8");
    expect(src).toMatch(/^export const SITE_NAME = "[^"\n]+";$/m);
    expect(src).toMatch(/^export const SOURCE_URL = "https:\/\/github\.com\/[^"\n]+";$/m);
  });

  it("is what the layout, the footer and the Open Graph image read (not process.env)", () => {
    const app = resolve(__dirname, "../../../apps/web");
    for (const f of ["app/layout.tsx", "components/layout/footer.tsx", "components/opengraph-image.tsx"]) {
      const src = readFileSync(resolve(app, f), "utf8");
      expect(src, f).toContain("SITE_NAME");
      expect(src, f).not.toContain("process.env.SITE_NAME");
      expect(src, f).not.toMatch(/\{\s*SITE_NAME[^}]*\}\s*=\s*process\.env/);
    }
  });
});
