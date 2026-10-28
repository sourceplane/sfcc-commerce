import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SITE_NAME } from "app/site";
import { readFile } from "fs/promises";
import { ImageResponse } from "next/og";
import { join } from "path";
import LogoIcon from "./icons/logo";

export type Props = {
  title?: string;
};

// Upstream reads the font from ./fonts next to the app, which a Worker has no
// file for. It is a static asset (public/fonts), read from the filesystem by
// `next build`/`next dev` and through the ASSETS binding on the Worker.
async function loadFont(): Promise<ArrayBuffer> {
  try {
    const file = await readFile(
      join(process.cwd(), "./public/fonts/Inter-Bold.ttf"),
    );
    return Uint8Array.from(file).buffer;
  } catch {
    const { env } = await getCloudflareContext({ async: true });
    const res = await env.ASSETS.fetch(
      "https://assets.local/fonts/Inter-Bold.ttf",
    );
    return res.arrayBuffer();
  }
}

export default async function OpengraphImage(
  props?: Props,
): Promise<ImageResponse> {
  const { title } = {
    ...{
      title: SITE_NAME,
    },
    ...props,
  };

  const font = await loadFont();

  return new ImageResponse(
    (
      <div tw="flex h-full w-full flex-col items-center justify-center bg-black">
        <div tw="flex flex-none items-center justify-center border border-neutral-700 h-[160px] w-[160px] rounded-3xl">
          <LogoIcon width="64" height="58" fill="white" />
        </div>
        <p tw="mt-12 text-6xl font-bold text-white">{title}</p>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Inter",
          data: font,
          style: "normal",
          weight: 700,
        },
      ],
    },
  );
}
