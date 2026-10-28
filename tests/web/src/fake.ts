import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";

// ../fake-sfcc.mjs — a stand-in SCAPI + SLAS, offline — as a child process,
// for the cases that need a connected store.
export const STORE = {
  client: "unit0c11-0000-4000-8000-00000000c11e",
  org: "f_ecom_unit_001",
  shortCode: "unit0001",
  site: "UnitSite",
  secret: "unit-slas-private-client-secret",
};

async function freePort(): Promise<number> {
  return await new Promise((ok, fail) => {
    const s = createServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => ok(port));
    });
  });
}

export async function startFake(): Promise<{ origin: string; stop: () => void }> {
  const port = await freePort();
  const script = resolve(__dirname, "../fake-sfcc.mjs");
  const child: ChildProcess = spawn(
    process.execPath,
    [script, "--port", String(port), "--client", STORE.client, "--org", STORE.org, "--site", STORE.site,
     "--secret", STORE.secret],
    { stdio: "ignore" },
  );
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${origin}/__calls`)).ok) return { origin, stop: () => child.kill() };
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  child.kill();
  throw new Error("the stand-in SCAPI never answered");
}

export async function calls(origin: string): Promise<Record<string, number>> {
  return (await (await fetch(`${origin}/__calls`)).json()) as Record<string, number>;
}

export async function reset(origin: string): Promise<void> {
  await fetch(`${origin}/__reset`, { method: "POST" });
}
