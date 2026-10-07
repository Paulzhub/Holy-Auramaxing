import sharp from "sharp";

import { readServerEnv } from "@/lib/env";
import { devLog } from "@/lib/server/dev-log";

/**
 * Nudity screening for uploaded images (CLAUDE.md §7.3, §7.11). See D-026.
 *
 * One small interface, so the provider can be swapped in one place.
 *   google  Google Cloud Vision SafeSearch (production)
 *   stub    local development and CI only: approves everything except a
 *           solid magenta image, so tests can exercise a rejection
 *   none    nothing configured: photos wait unpublished ("fail closed")
 */

export type ScreeningVerdict = "approved" | "rejected" | "unavailable";

export interface ImageScreener {
  readonly name: "google" | "stub" | "none";
  screen(image: Uint8Array): Promise<ScreeningVerdict>;
}

const likelihoods = ["UNKNOWN", "VERY_UNLIKELY", "UNLIKELY", "POSSIBLE", "LIKELY", "VERY_LIKELY"] as const;
type Likelihood = (typeof likelihoods)[number];

export interface SafeSearchAnnotation {
  adult?: Likelihood;
  racy?: Likelihood;
  violence?: Likelihood;
  medical?: Likelihood;
  spoof?: Likelihood;
}

function rank(value: Likelihood | undefined): number {
  return likelihoods.indexOf(value ?? "UNKNOWN");
}

/**
 * Zero tolerance for sexual content (§7.11): anything Google rates even
 * "possible" for adult content is refused, and so is anything "likely" racy
 * or violent. A profile photo has no reason to be borderline.
 */
export function verdictFor(annotation: SafeSearchAnnotation): Exclude<ScreeningVerdict, "unavailable"> {
  if (rank(annotation.adult) >= rank("POSSIBLE")) return "rejected";
  if (rank(annotation.racy) >= rank("LIKELY")) return "rejected";
  if (rank(annotation.violence) >= rank("LIKELY")) return "rejected";
  return "approved";
}

const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

export function googleVisionScreener(apiKey: string, fetchImpl: typeof fetch = fetch): ImageScreener {
  return {
    name: "google",
    async screen(image) {
      try {
        const res = await fetchImpl(VISION_ENDPOINT, {
          method: "POST",
          // The key goes in a header, never in the URL, so it stays out of logs.
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            requests: [
              {
                image: { content: Buffer.from(image).toString("base64") },
                features: [{ type: "SAFE_SEARCH_DETECTION" }],
              },
            ],
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          // Google's message, e.g. "API key not valid" or "Cloud Vision API has not been used in project …".
          const detail = await res.text().catch(() => "");
          devLog("avatar", `Google Cloud Vision answered ${res.status}: ${detail.slice(0, 300)}`);
          return "unavailable";
        }
        const body = (await res.json()) as {
          responses?: { safeSearchAnnotation?: SafeSearchAnnotation; error?: { message?: string } }[];
        };
        const first = body.responses?.[0];
        if (!first || first.error || !first.safeSearchAnnotation) {
          devLog("avatar", `Google Cloud Vision gave no verdict: ${first?.error?.message ?? "empty response"}`);
          return "unavailable";
        }
        return verdictFor(first.safeSearchAnnotation);
      } catch (error) {
        devLog("avatar", error);
        return "unavailable";
      }
    },
  };
}

/** The test signal for the stub: an image whose dominant colour is pure magenta. */
export const STUB_REJECT_COLOUR = { r: 255, g: 0, b: 255 } as const;

const stubScreener: ImageScreener = {
  name: "stub",
  async screen(image) {
    try {
      const { dominant } = await sharp(image).stats();
      const near = (a: number, b: number) => Math.abs(a - b) <= 16;
      const magenta =
        near(dominant.r, STUB_REJECT_COLOUR.r) &&
        near(dominant.g, STUB_REJECT_COLOUR.g) &&
        near(dominant.b, STUB_REJECT_COLOUR.b);
      return magenta ? "rejected" : "approved";
    } catch {
      return "unavailable";
    }
  },
};
const noScreener: ImageScreener = { name: "none", screen: async () => "unavailable" };

/**
 * Picks the screener from the environment:
 *   IMAGE_SCREENING_PROVIDER=google|stub|none wins when set;
 *   otherwise Google when GOOGLE_CLOUD_VISION_API_KEY is set,
 *   the stub under `next dev`, and none in any other build.
 */
export function getImageScreener(): ImageScreener {
  const env = readServerEnv();
  if (env.GOOGLE_CLOUD_VISION_API_KEY && !env.GOOGLE_CLOUD_VISION_API_KEY.startsWith("AIza")) {
    // Google API keys start with "AIza". An OAuth client secret ("GOCSPX-…") is a common mix-up.
    devLog("avatar", "GOOGLE_CLOUD_VISION_API_KEY doesn't look like a Google API key (they start with AIza)");
  }
  const provider =
    env.IMAGE_SCREENING_PROVIDER ??
    (env.GOOGLE_CLOUD_VISION_API_KEY ? "google" : process.env.NODE_ENV === "development" ? "stub" : "none");
  if (provider === "google") {
    return env.GOOGLE_CLOUD_VISION_API_KEY ? googleVisionScreener(env.GOOGLE_CLOUD_VISION_API_KEY) : noScreener;
  }
  return provider === "stub" ? stubScreener : noScreener;
}
