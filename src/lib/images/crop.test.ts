import { describe, expect, it } from "vitest";

import { cropRect } from "./crop";

describe("cropRect", () => {
  it("fits the short side and centres a landscape photo", () => {
    expect(cropRect(1600, 1200, 600, 1, 0, 0)).toEqual({ x: -100, y: 0, width: 800, height: 600 });
  });

  it("pans to either edge without uncovering the square", () => {
    const left = cropRect(1600, 1200, 600, 1, -100, 0);
    const right = cropRect(1600, 1200, 600, 1, 100, 0);
    expect(left.x).toBe(0);
    expect(right.x + right.width).toBe(600);
  });

  it("zooms around the centre and clamps out-of-range values", () => {
    const r = cropRect(1000, 1000, 500, 2, 0, 0);
    expect(r).toEqual({ x: -250, y: -250, width: 1000, height: 1000 });
    expect(cropRect(1000, 1000, 500, 10, 500, -500)).toEqual(cropRect(1000, 1000, 500, 3, 100, -100));
  });
});
