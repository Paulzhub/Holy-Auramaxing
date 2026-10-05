// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import sharp from "sharp";

import { getImageScreener, googleVisionScreener, STUB_REJECT_COLOUR, verdictFor } from "./screening";

describe("verdictFor", () => {
  it("refuses anything even possibly adult", () => {
    expect(verdictFor({ adult: "POSSIBLE" })).toBe("rejected");
    expect(verdictFor({ adult: "VERY_LIKELY" })).toBe("rejected");
  });

  it("refuses likely racy or violent images", () => {
    expect(verdictFor({ adult: "UNLIKELY", racy: "LIKELY" })).toBe("rejected");
    expect(verdictFor({ adult: "VERY_UNLIKELY", violence: "VERY_LIKELY" })).toBe("rejected");
  });

  it("approves ordinary photos", () => {
    expect(verdictFor({ adult: "VERY_UNLIKELY", racy: "POSSIBLE", violence: "UNLIKELY", medical: "LIKELY" })).toBe(
      "approved",
    );
    expect(verdictFor({})).toBe("approved");
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("googleVisionScreener", () => {
  it("sends the image with the key in a header, not the URL", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ responses: [{ safeSearchAnnotation: { adult: "VERY_UNLIKELY", racy: "UNLIKELY" } }] }),
    );
    const verdict = await googleVisionScreener("test-key", fetchMock).screen(new Uint8Array([1, 2, 3]));
    expect(verdict).toBe("approved");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://vision.googleapis.com/v1/images:annotate");
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(String(init.body));
    expect(body.requests[0].image.content).toBe("AQID");
    expect(body.requests[0].features).toEqual([{ type: "SAFE_SEARCH_DETECTION" }]);
  });

  it("rejects what Google rates as adult", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ responses: [{ safeSearchAnnotation: { adult: "LIKELY" } }] }));
    expect(await googleVisionScreener("k", fetchMock).screen(new Uint8Array([1]))).toBe("rejected");
  });

  it("holds the photo when Google is down, errors or answers oddly", async () => {
    const cases = [
      vi.fn(async () => jsonResponse({}, 500)),
      vi.fn(async () => jsonResponse({ responses: [{ error: { message: "bad image" } }] })),
      vi.fn(async () => jsonResponse({ responses: [] })),
      vi.fn(async () => {
        throw new Error("network");
      }),
    ];
    for (const fetchMock of cases) {
      expect(await googleVisionScreener("k", fetchMock).screen(new Uint8Array([1]))).toBe("unavailable");
    }
  });
});

describe("getImageScreener", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses Google when a key is set", () => {
    vi.stubEnv("GOOGLE_CLOUD_VISION_API_KEY", "k");
    vi.stubEnv("IMAGE_SCREENING_PROVIDER", "");
    expect(getImageScreener().name).toBe("google");
  });

  it("fails closed in a production build without a key", () => {
    vi.stubEnv("GOOGLE_CLOUD_VISION_API_KEY", "");
    vi.stubEnv("IMAGE_SCREENING_PROVIDER", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(getImageScreener().name).toBe("none");
  });

  it("uses the stub under next dev, or when asked to", () => {
    vi.stubEnv("GOOGLE_CLOUD_VISION_API_KEY", "");
    vi.stubEnv("IMAGE_SCREENING_PROVIDER", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(getImageScreener().name).toBe("stub");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("IMAGE_SCREENING_PROVIDER", "stub");
    expect(getImageScreener().name).toBe("stub");
  });

  it("the stub approves ordinary images and rejects the magenta test image", async () => {
    vi.stubEnv("IMAGE_SCREENING_PROVIDER", "stub");
    const solid = (background: { r: number; g: number; b: number }) =>
      sharp({ create: { width: 64, height: 64, channels: 3, background } })
        .webp()
        .toBuffer();
    const stub = getImageScreener();
    expect(await stub.screen(await solid({ r: 214, g: 160, b: 72 }))).toBe("approved");
    expect(await stub.screen(await solid(STUB_REJECT_COLOUR))).toBe("rejected");
  });

  it("never claims Google without a key", () => {
    vi.stubEnv("GOOGLE_CLOUD_VISION_API_KEY", "");
    vi.stubEnv("IMAGE_SCREENING_PROVIDER", "google");
    expect(getImageScreener().name).toBe("none");
  });
});
