import { isSFCCConfigured } from "lib/sfcc/connection";

// Shown while this build has no Salesforce store (lib/sfcc/connection.ts): a
// one-line note on every page, and on the home page the steps to connect
// one. Every page still renders — the readers answer empty — so a fresh
// deploy is a working, empty storefront that says why it is empty.
export function ConnectStoreBanner() {
  if (isSFCCConfigured()) return null;
  return (
    <div
      role="note"
      data-connect-store
      className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
    >
      No Salesforce Commerce Cloud store is connected yet: the catalogue is
      empty until one is.
    </div>
  );
}

export function ConnectStore() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-16 text-neutral-700 dark:text-neutral-300">
      <h1 className="mb-4 text-3xl font-bold text-black dark:text-white">
        Connect your Salesforce Commerce Cloud store
      </h1>
      <p className="mb-4">
        This storefront reads its catalogue, its cart and its checkout from a
        B2C Commerce instance&apos;s Shopper APIs. None is connected to this
        deploy yet.
      </p>
      <ol className="mb-4 list-decimal space-y-2 pl-6">
        <li>
          In Account Manager and SLAS Admin, find your instance&apos;s
          organization id and short code, and create (or pick) a SLAS client for
          your site.
        </li>
        <li>
          Store them for this environment as the Orun secrets{" "}
          <code>SFCC_CLIENT_ID</code>, <code>SFCC_ORGANIZATIONID</code>,{" "}
          <code>SFCC_SHORTCODE</code> and <code>SFCC_SITEID</code> (and{" "}
          <code>SFCC_SECRET</code> for a private client).
        </li>
        <li>
          Redeploy the storefront. The next build reads them and the catalogue
          appears.
        </li>
      </ol>
      <p>
        The repository&apos;s README, &ldquo;Connecting Salesforce Commerce
        Cloud&rdquo;, has the details.
      </p>
    </section>
  );
}
