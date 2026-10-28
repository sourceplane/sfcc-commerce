// Whether this build has a Salesforce B2C Commerce instance to talk to.
//
// The store is the owner's to connect after the build: its SLAS client id,
// organization id, short code and site id are Orun secrets the build reads
// (next.config.ts `env`, so all four are fixed per deploy). A fresh product
// has none: then no request leaves the Worker for Salesforce — every reader
// in lib/sfcc answers empty, and every cart or checkout call refuses with
// SFCCNotConnected, which the cart actions already turn into a message — and
// the storefront says how to connect one (components/connect-store.tsx),
// never a 500.
export class SFCCNotConnected extends Error {
  constructor() {
    super(
      "No Salesforce Commerce Cloud instance is connected (SFCC_CLIENT_ID, SFCC_ORGANIZATIONID, SFCC_SHORTCODE, SFCC_SITEID)",
    );
    this.name = "SFCCNotConnected";
  }
}

export function isSFCCConfigured(): boolean {
  return [
    process.env.SFCC_CLIENT_ID,
    process.env.SFCC_ORGANIZATIONID,
    process.env.SFCC_SHORTCODE,
    process.env.SFCC_SITEID,
  ].every((v) => (v ?? "").trim() !== "");
}
