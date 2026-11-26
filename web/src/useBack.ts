import { useEffect, useRef } from "react";

/** Everything that is open, the innermost last. */
const open: Array<{ close: () => void }> = [];
/** Whether the one history entry that stands for all of it is there. */
let entered = false;
/** Set while this code takes that entry back, so the step is not read as the user's. */
let unwinding = false;

/**
 * One entry while anything is open, none otherwise. Run late, so that one thing closing as another opens (the
 * scanner, as the stream takes its place) leaves history alone.
 */
function sync() {
  if (unwinding) return;
  if (open.length > 0 && !entered) {
    window.history.pushState({ botpilot: true }, "");
    entered = true;
  } else if (open.length === 0 && entered) {
    entered = false;
    unwinding = true;
    window.history.back();
  }
}

const syncSoon = () => void window.setTimeout(sync, 0);

window.addEventListener("popstate", () => {
  if (unwinding) {
    unwinding = false;
  } else if (entered) {
    entered = false;
    open[open.length - 1]?.close();
  }
  // After React has applied what close() did.
  syncSoon();
});

/**
 * Makes the system back action (Android's gesture or button, a browser's Back) close what is open instead of
 * leaving the app. `onBack` closes one thing; while `isOpen` stays true, the next Back calls it again.
 */
export function useBack(isOpen: boolean, onBack: () => void) {
  const latest = useRef(onBack);
  latest.current = onBack;

  useEffect(() => {
    if (!isOpen) return;
    const entry = { close: () => latest.current() };
    open.push(entry);
    syncSoon();
    return () => {
      open.splice(open.indexOf(entry), 1);
      syncSoon();
    };
  }, [isOpen]);
}
