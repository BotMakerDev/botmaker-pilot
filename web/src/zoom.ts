import type { ViewTransform } from "./types";

/**
 * The user's zoom on the stage: a scale `k` and a pan `(tx, ty)` in canvas device px, applied on top of the
 * letterbox fit. It is folded into the {@link ViewTransform} the renderer publishes, so an Interact tap on a
 * zoomed picture still maps to the screen pixel under the finger with no change to the tap maths.
 */
export interface Zoom {
  k: number;
  tx: number;
  ty: number;
}

export const NO_ZOOM: Zoom = { k: 1, tx: 0, ty: 0 };

/** Past this a pixel of the game is a thumb wide, and nothing is gained. */
export const MAX_ZOOM = 6;

export interface Pt {
  x: number;
  y: number;
}

/** The fit transform with the zoom applied: what the picture is drawn with and what taps are mapped through. */
export function zoomed(t: ViewTransform, z: Zoom): ViewTransform {
  return { ox: t.ox * z.k + z.tx, oy: t.oy * z.k + z.ty, s: t.s * z.k, sx: t.sx, sy: t.sy };
}

/**
 * Keeps the zoomed canvas covering the viewport: no pan past an edge, and none at all at `k = 1`, so zooming
 * back out always lands on the plain fit.
 */
export function clampPan(z: Zoom, width: number, height: number): Zoom {
  const k = Math.min(MAX_ZOOM, Math.max(1, z.k));
  const clamp = (v: number, size: number) => Math.min(0, Math.max(size - size * k, v));
  return { k, tx: clamp(z.tx, width), ty: clamp(z.ty, height) };
}

/**
 * A pinch from `(m0, d0)` to `(m, d)` (midpoint and finger distance, canvas px) starting at zoom `start`: the
 * scale follows the distance, and the point that was under the fingers stays under them.
 */
export function pinch(start: Zoom, m0: Pt, d0: number, m: Pt, d: number, width: number, height: number): Zoom {
  const k = Math.min(MAX_ZOOM, Math.max(1, start.k * (d0 > 0 ? d / d0 : 1)));
  const px = (m0.x - start.tx) / start.k;
  const py = (m0.y - start.ty) / start.k;
  return clampPan({ k, tx: m.x - px * k, ty: m.y - py * k }, width, height);
}

/** One finger dragging a zoomed picture. */
export function pan(z: Zoom, dx: number, dy: number, width: number, height: number): Zoom {
  return clampPan({ k: z.k, tx: z.tx + dx, ty: z.ty + dy }, width, height);
}

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
