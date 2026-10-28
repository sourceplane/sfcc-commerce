import { isSFCCConfigured } from "lib/sfcc/connection";
import { NextResponse } from "next/server";

// The deploy's smoke check, and a quick way to tell whether this build has a
// store: the Worker answers it (no static file can), and it reads nothing
// from Salesforce.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: true, connected: isSFCCConfigured() },
    { headers: { "cache-control": "no-store" } },
  );
}
