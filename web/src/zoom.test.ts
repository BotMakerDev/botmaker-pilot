import { describe, expect, it } from "vitest";
import { MAX_ZOOM, NO_ZOOM, clampPan, pan, pinch, zoomed } from "./zoom";

const W = 1000, H = 600;

describe("zoomed", () => {
  it("is the fit itself at no zoom", () => {
    const t = { ox: 10, oy: 20, s: 0.5, sx: 100, sy: 50 };
    expect(zoomed(t, NO_ZOOM)).toEqual(t);
  });

  it("keeps a tap on the pixel under the finger", () => {
    const t = { ox: 0, oy: 0, s: 0.5, sx: 0, sy: 0 };
    const z = { k: 2, tx: -300, ty: -100 };
    const v = zoomed(t, z);
    // Canvas point 500,300 is drawn from surface pixel ((500 - ox') / s', …).
    const surfaceX = (500 - v.ox) / v.s;
    const surfaceY = (300 - v.oy) / v.s;
    // …which is the pixel that sat at canvas ((500 - tx) / k, (300 - ty) / k) before zooming.
    expect(surfaceX).toBeCloseTo(((500 + 300) / 2) / 0.5);
    expect(surfaceY).toBeCloseTo(((300 + 100) / 2) / 0.5);
  });
});

describe("pinch", () => {
  it("scales with the fingers and holds the point between them still", () => {
    const m = { x: 400, y: 300 };
    const z = pinch(NO_ZOOM, m, 100, m, 200, W, H);
    expect(z.k).toBe(2);
    // The canvas point under the fingers before (400,300) is still under them after.
    expect((m.x - z.tx) / z.k).toBeCloseTo(400);
    expect((m.y - z.ty) / z.k).toBeCloseTo(300);
  });

  it("never zooms out past the fit or in past the maximum", () => {
    expect(pinch(NO_ZOOM, { x: 0, y: 0 }, 200, { x: 0, y: 0 }, 50, W, H)).toEqual(NO_ZOOM);
    expect(pinch(NO_ZOOM, { x: 0, y: 0 }, 10, { x: 0, y: 0 }, 1000, W, H).k).toBe(MAX_ZOOM);
  });
});

describe("pan", () => {
  it("stops at the picture's edges", () => {
    const z = { k: 2, tx: -500, ty: -300 };
    expect(pan(z, 10_000, 10_000, W, H)).toEqual({ k: 2, tx: 0, ty: 0 });
    expect(pan(z, -10_000, -10_000, W, H)).toEqual({ k: 2, tx: -W, ty: -H });
  });

  it("does nothing at no zoom", () => {
    expect(pan(NO_ZOOM, 50, 50, W, H)).toEqual(NO_ZOOM);
    expect(clampPan({ k: 1, tx: -40, ty: 12 }, W, H)).toEqual(NO_ZOOM);
  });
});
