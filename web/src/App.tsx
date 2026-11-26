import { useEffect, useRef, useState } from "react";
import type { ConnStatus, Endpoint, ViewTransform } from "./types";
import { useBack } from "./useBack";
import { useKeepAwake } from "./useKeepAwake";
import {
  initialEndpoint,
  upsertConnection,
  touchConnection,
  loadOverlaysEnabled,
  saveOverlaysEnabled,
} from "./config";
import { usePilot } from "./usePilot";
import { Renderer } from "./Renderer";
import { ConnectScreen } from "./ConnectScreen";
import { LogDrawer } from "./LogDrawer";
import { reachSteps } from "./reach";
import { useInteract } from "./useInteract";
import { useStageGestures } from "./useStageGestures";
import { KeyboardBar } from "./KeyboardBar";
import { NO_ZOOM, type Zoom } from "./zoom";
import { useAppUpdate } from "./useAppUpdate";
import { UpdateLink } from "./UpdateLink";

/** What the overlay says while the socket is not live. */
function connectionMessage(status: ConnStatus): string {
  switch (status) {
    case "connecting":
      return "Connecting…";
    case "rejected":
      return "This PC no longer accepts this pairing code. Scan the QR again.";
    case "invalid":
      return "This address cannot be used. Enter it again.";
    default:
      return "Can’t reach this connection — retrying…";
  }
}

export function App() {
  const [endpoint, setEndpoint] = useState<Endpoint | null>(initialEndpoint);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const { available: updateAvailable, latest } = useAppUpdate();
  const {
    status, runState, backgroundInput, reason, frameRef, overlaysRef, trace, clearTrace, send, inputKinds,
    notice,
  } = usePilot(endpoint);
  const connected = status === "connected";
  useKeepAwake(connected);
  const [keyboard, setKeyboard] = useState(false);
  // Only a host that announced it takes keys gets a keyboard button; an older SDK never says so.
  const takesKeys = inputKinds.includes("key");
  const [logOpen, setLogOpen] = useState(false);

  // Interact: tapping the stage reveals the toggle; the toggle arms it. Both start off, and Interact is
  // disarmed when the connection drops — an armed session must not silently survive a reconnect.
  const [controlsShown, setControlsShown] = useState(false);
  const [interact, setInteract] = useState(false);
  // Unlike Interact, this one is remembered: it is a viewing preference, not a capability that would be
  // dangerous to have silently survive a reconnect.
  const [overlays, setOverlays] = useState(loadOverlaysEnabled);
  const transformRef = useRef<ViewTransform | null>(null);
  const zoomRef = useRef<Zoom>(NO_ZOOM);
  const interactGestures = useInteract(send, transformRef, interact);
  const gestures = useStageGestures(zoomRef, interactGestures, interact);

  // Keys reach the game only through Interact, like taps: disarming closes the keyboard.
  useEffect(() => {
    if (!interact) setKeyboard(false);
  }, [interact]);

  // The server arms per connection, so mirror every local change onto the wire (and re-arm on reconnect).
  useEffect(() => {
    if (status === "connected") send({ cmd: "interact", on: interact });
  }, [status, interact, send]);

  useEffect(() => {
    if (status !== "connected") setInteract(false);
  }, [status]);

  useEffect(() => {
    if (!endpoint) {
      setControlsShown(false);
      setLogOpen(false);
    }
  }, [endpoint]);

  // Once a socket actually opens, bump the connection's recency so it sorts to the top of "Recent".
  useEffect(() => {
    if (status === "connected" && endpoint) touchConnection(endpoint);
  }, [status, endpoint]);

  const connect = (ep: Endpoint) => {
    upsertConnection(ep);
    setEndpoint(ep);
  };
  // Non-destructive: drop the live socket but keep the endpoint in history so it stays in "Recent".
  const disconnect = () => setEndpoint(null);

  // Back closes the innermost thing: the keyboard, then the log, then the connection.
  useBack(endpoint !== null, () => {
    if (keyboard) setKeyboard(false);
    else if (logOpen) setLogOpen(false);
    else disconnect();
  });

  const updateBanner =
    updateAvailable && !updateDismissed ? (
      <div className="update-banner">
        <span>Update available{latest ? ` (${latest})` : ""}</span>
        <UpdateLink tag={latest} className="update-get">
          Get it
        </UpdateLink>
        <button className="update-x" onClick={() => setUpdateDismissed(true)} aria-label="Dismiss">
          ✕
        </button>
      </div>
    ) : null;

  if (!endpoint) {
    return (
      <>
        {updateBanner}
        <ConnectScreen onConnect={connect} />
      </>
    );
  }

  return (
    <div className="app">
      {updateBanner}
      <header>
        <b>BotPilot</b>
        <span className={`conn ${status}`}>{status}</span>
        <span className={`run ${connected ? runState : ""}`}>{connected ? runState : "—"}</span>
        <button className="link" onClick={disconnect}>disconnect</button>
      </header>

      <div className="stage" onClick={() => setControlsShown(true)}>
        <Renderer
          frameRef={frameRef}
          overlaysRef={overlaysRef}
          transformRef={transformRef}
          zoomRef={zoomRef}
          interactive={interact}
          overlays={overlays}
          {...gestures}
        />
        {connected && reason && <div className="no-picture">{reason}</div>}
        {controlsShown && (
          <div className="stage-tools" onClick={(e) => e.stopPropagation()}>
            <button
              className={`interact${interact ? " on" : ""}`}
              onClick={() => setInteract((v) => !v)}
              disabled={status !== "connected"}
            >
              {interact ? "✋ Interacting" : "✋ Interact"}
            </button>
            <button
              className={`overlays${overlays ? " on" : ""}`}
              onClick={() => {
                const next = !overlays;
                setOverlays(next);
                saveOverlaysEnabled(next);
              }}
            >
              {overlays ? "◎ Overlays" : "◎ Overlays off"}
            </button>
            {interact && takesKeys && (
              <button className={`keys${keyboard ? " on" : ""}`} onClick={() => setKeyboard((v) => !v)}>
                ⌨ Keys
              </button>
            )}
            <button className="zoom-reset" onClick={() => (zoomRef.current = NO_ZOOM)}>
              ⤢ Fit
            </button>
            {interact && !backgroundInput && (
              <span className="interact-warn">moves the computer’s real cursor</span>
            )}
          </div>
        )}
        {keyboard && interact && <KeyboardBar send={send} onClose={() => setKeyboard(false)} />}
        {notice && <div className="notice">{notice}</div>}
        {status !== "connected" && (
          <div className="reconnect-overlay">
            <p>{connectionMessage(status)}</p>
            {status === "reconnecting" && (
              <ol className="reach-steps">
                {reachSteps(endpoint).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
            <button className="switch" onClick={disconnect}>Switch connection</button>
          </div>
        )}
        {logOpen && <LogDrawer lines={trace} onClear={clearTrace} onClose={() => setLogOpen(false)} />}
      </div>

      <nav className="controls">
        <button className="go" onClick={() => send({ cmd: "start" })} disabled={!connected || runState === "running"}>▶ Start</button>
        <button onClick={() => send({ cmd: "stop" })} disabled={!connected || runState === "stopped"}>■ Stop</button>
        <button onClick={() => send({ cmd: "pause" })} disabled={!connected || runState !== "running"}>⏸ Pause</button>
        <button onClick={() => send({ cmd: "resume" })} disabled={!connected || runState !== "paused"}>⏵ Resume</button>
        <button className={`log${logOpen ? " on" : ""}`} onClick={() => setLogOpen((v) => !v)}>
          📜 Log{trace.length > 0 ? ` (${trace.length})` : ""}
        </button>
      </nav>
    </div>
  );
}
