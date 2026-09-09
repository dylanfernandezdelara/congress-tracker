import { ImageResponse, loadGoogleFont } from "workers-og";
import { OG_CARD_HEIGHT, OG_CARD_WIDTH } from "../../../../shared/og-card";

export type OgRenderer = (html: string) => Promise<Response>;

type FontSet = { sans600: ArrayBuffer; sans700: ArrayBuffer; serif500: ArrayBuffer };

/**
 * Fonts are fetched on first render and memoized for the isolate's lifetime.
 * Workers forbid I/O at module scope, so this must stay lazy; a failed load is
 * dropped so the next request retries instead of pinning a rejected promise.
 */
let fontsPromise: Promise<FontSet> | null = null;

function loadFonts(): Promise<FontSet> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      loadGoogleFont({ family: "Inter", weight: 600 }),
      loadGoogleFont({ family: "Inter", weight: 700 }),
      loadGoogleFont({ family: "Source Serif 4", weight: 500 }).catch(() =>
        loadGoogleFont({ family: "Bitter", weight: 500 })
      ),
    ])
      .then(([sans600, sans700, serif500]) => ({ sans600, sans700, serif500 }))
      .catch((err: unknown) => {
        fontsPromise = null;
        throw err;
      });
  }
  return fontsPromise;
}

/** Render share-card HTML to a PNG Response via workers-og (satori + resvg). */
export async function renderOgCardPng(html: string): Promise<Response> {
  const fonts = await loadFonts();
  return new ImageResponse(html, {
    width: OG_CARD_WIDTH,
    height: OG_CARD_HEIGHT,
    fonts: [
      { name: "Inter", data: fonts.sans600, weight: 600, style: "normal" },
      { name: "Inter", data: fonts.sans700, weight: 700, style: "normal" },
      { name: "Source Serif 4", data: fonts.serif500, weight: 500, style: "normal" },
    ],
  });
}
