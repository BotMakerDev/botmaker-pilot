import { useCallback, useRef } from "react";
import type { useInteract } from "./useInteract";
import { NO_ZOOM, type Pt, type Zoom, distance, midpoint, pan, pinch } from "./zoom";

/** Two taps closer than this (ms) with no movement reset the zoom — when Interact is off. */
const DOUBLE_TAP_MS = 300;

/** Movement (CSS px) below which a press-release is a tap. */
const TAP_SLOP_PX = 8;

type Gestures = ReturnType<typeof useInteract>;
type CanvasPointer = React.PointerEvent<HTMLCanvasElement>;

/**
 * Every finger on the stage, sorted into who gets it.
 *
 * - **Two fingers** zoom and pan the picture (pinch), whatever else is on. A one-finger Interact gesture that
 *   was already under way is cancelled first, so a pinch never leaves a button held on the host.
 * - **One finger with Interact on** is Interact's, exactly as before: the zoom is already folded into the
 *   transform it maps through, so a tap lands on the pixel under the finger at any zoom.
 * - **One finger with Interact off** pans a zoomed picture, and a double tap goes back to the plain fit.
 *
 * The zoom lives in a ref the renderer reads every frame, like the frame itself, so a pinch re-renders nothing.
 */
export function useStageGestures(zoomRef: React.MutableRefObject<Zoom>, interact: Gestures, interacting: boolean) {
  const pointers = useRef(new Map<number, Pt>());
  const pinchStart = useRef<{ zoom: Zoom; m0: Pt; d0: number } | null>(null);
  /** Set once a pinch ends while a finger is still down: that finger starts nothing until all are lifted. */
  const settling = useRef(false);
  const lastTap = useRef(0);
  const downAt = useRef<Pt | null>(null);

  /** A pointer in canvas device px, the space the zoom is kept in. */
  const toCanvas = (e: CanvasPointer): Pt => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
  };
  const size = (e: CanvasPointer) => ({ w: e.currentTarget.width, h: e.currentTarget.height });

  const beginPinch = () => {
    const [a, b] = [...pointers.current.values()];
    pinchStart.current = { zoom: zoomRef.current, m0: midpoint(a, b), d0: distance(a, b) };
  };

  const onPointerDown = useCallback(
    (e: CanvasPointer) => {
      pointers.current.set(e.pointerId, toCanvas(e));
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if (pointers.current.size === 2) {
        if (interacting) interact.cancel();
        beginPinch();
        return;
      }
      if (pointers.current.size > 2 || settling.current) return;
      downAt.current = { x: e.clientX, y: e.clientY };
      if (interacting) interact.onPointerDown(e);
    },
    // toCanvas/beginPinch read refs only.
    [interact, interacting],
  );

  const onPointerMove = useCallback(
    (e: CanvasPointer) => {
      const previous = pointers.current.get(e.pointerId);
      if (!previous) return;
      const now = toCanvas(e);
      pointers.current.set(e.pointerId, now);
      const { w, h } = size(e);
      const start = pinchStart.current;
      if (start && pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
        zoomRef.current = pinch(start.zoom, start.m0, start.d0, midpoint(a, b), distance(a, b), w, h);
        return;
      }
      if (settling.current) return;
      if (interacting) {
        interact.onPointerMove(e);
      } else if (zoomRef.current.k > 1) {
        zoomRef.current = pan(zoomRef.current, now.x - previous.x, now.y - previous.y, w, h);
      }
    },
    [interact, interacting, zoomRef],
  );

  const onPointerUp = useCallback(
    (e: CanvasPointer) => {
      if (!pointers.current.delete(e.pointerId)) return;
      if (pinchStart.current) {
        pinchStart.current = null;
        settling.current = pointers.current.size > 0;
        return;
      }
      if (settling.current) {
        settling.current = pointers.current.size > 0;
        return;
      }
      if (interacting) {
        interact.onPointerUp(e);
        return;
      }
      const at = downAt.current;
      const still = at !== null && Math.hypot(e.clientX - at.x, e.clientY - at.y) < TAP_SLOP_PX;
      const now = Date.now();
      if (still && now - lastTap.current < DOUBLE_TAP_MS) {
        zoomRef.current = NO_ZOOM;
        lastTap.current = 0;
      } else if (still) {
        lastTap.current = now;
      }
    },
    [interact, interacting, zoomRef],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (interacting) interact.onWheel(e);
    },
    [interact, interacting],
  );

  return { onPointerDown, onPointerMove, onPointerUp, onWheel };
}
