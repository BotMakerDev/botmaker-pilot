import { useEffect } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

/** The native half, `KeepAwake.java`: the WebView of an APK has no wake lock of its own to rely on. */
const KeepAwake = registerPlugin<{ set(options: { on: boolean }): Promise<void> }>("KeepAwake");

/**
 * Keeps the screen on while `on`. A browser's wake lock exists only on a secure origin and is dropped when the
 * page is hidden, so it is asked for again on return; where there is none the screen sleeps as usual.
 */
export function useKeepAwake(on: boolean) {
  useEffect(() => {
    if (!on) return;
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("KeepAwake")) {
      KeepAwake.set({ on: true }).catch(() => {});
      return () => void KeepAwake.set({ on: false }).catch(() => {});
    }
    let lock: WakeLockSentinel | null = null;
    let done = false;
    const ask = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        ?.request("screen")
        .then((granted) => {
          if (done) void granted.release();
          else lock = granted;
        })
        .catch(() => {});
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", ask);
      void lock?.release();
    };
  }, [on]);
}
