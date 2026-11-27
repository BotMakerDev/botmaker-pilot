import { useCallback, useEffect, useRef, useState } from "react";
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
import { StatusLine, type MenuItem } from "./StatusLine";
import { RunControls } from "./RunControls";
import { Overview } from "./Overview";
import { choosable, siblings } from "./runs";

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
    notice, runs, shownRun, pick, thumbs, clearThumbs,
  } = usePilot(endpoint);
  const connected = status === "connected";
  useKeepAwake(connected);
  const [keyboard, setKeyboard] = useState(false);
  // Only a host that announced it takes keys gets a keyboard item; an older SDK never says so.
  const takesKeys = inputKinds.includes("key");
  const [logOpen, setLogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [overview, setOverview] = useState(false);
  // With the connection gone, or nothing to switch to, there is no grid to show.
  const overviewShown = overview && connected && choosable(runs, shownRun);
  const shownRunRef = useRef(shownRun);
  shownRunRef.current = shownRun;

  // Interact ("Touch"): off until asked for, and disarmed when the connection drops — an armed session must not
  // silently survive a reconnect.
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
  // Arming names the run on screen, so a host already showing another refuses it. The run is read through a ref:
  // a change of run must not send the old arming again for the new one.
  useEffect(() => {
    if (status !== "connected") return;
    const run = shownRunRef.current;
    send({ cmd: "interact", on: interact, ...(interact && run !== null ? { run } : {}) });
  }, [status, interact, send]);

  useEffect(() => {
    if (status !== "connected") setInteract(false);
  }, [status]);

  // Armed for one game, never for whichever run takes its place on the screen.
  useEffect(() => {
    setInteract(false);
  }, [shownRun]);

  useEffect(() => {
    if (!overviewShown) {
      setOverview(false);
      clearThumbs();
    }
  }, [overviewShown, clearThumbs]);

  useEffect(() => {
    if (!endpoint) {
      setLogOpen(false);
      setMenuOpen(false);
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

  const pickRun = useCallback(
    (run: string) => {
      setInteract(false);
      zoomRef.current = NO_ZOOM;
      pick(run);
    },
    [pick],
  );

  // Back closes the innermost thing: the menu, the overview, the keyboard, the log, then the connection.
  useBack(endpoint !== null, () => {
    if (menuOpen) setMenuOpen(false);
    else if (overviewShown) setOverview(false);
    else if (keyboard) setKeyboard(false);
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

  const menu: MenuItem[] = [
    {
      label: overlays ? "◎ Overlays on" : "◎ Overlays off",
      on: overlays,
      run: () => {
        saveOverlaysEnabled(!overlays);
        setOverlays(!overlays);
      },
    },
    ...(interact && takesKeys
      ? [{ label: "⌨ Keys", on: keyboard, run: () => setKeyboard(!keyboard) }]
      : []),
    {
      label: `📜 Log${trace.length > 0 ? ` (${trace.length})` : ""}`,
      on: logOpen,
      run: () => setLogOpen(!logOpen),
    },
    { label: "⤢ Fit", run: () => (zoomRef.current = NO_ZOOM) },
    { label: "⏏ Disconnect", run: disconnect },
  ];
  const places = siblings(runs, shownRun);

  return (
    <div className="app">
      {updateBanner}
      <div className="screen">
        <StatusLine
          status={status}
          runState={runState}
          reason={reason}
          runs={runs}
          shownRun={shownRun}
          onPick={pickRun}
          onOverview={() => setOverview(true)}
          menu={menu}
          menuOpen={menuOpen}
          onMenu={setMenuOpen}
        />

        <div className="stage">
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
          {interact && (
            <div className="touch-badge">
              ✋ Touch controls the PC
              {!backgroundInput && <small>moves the computer’s real cursor</small>}
            </div>
          )}
          {places.length > 1 && (
            <div className="run-dots" aria-hidden="true">
              {places.map((run) => (
                <span key={run.id} className={run.id === shownRun ? "here" : ""} />
              ))}
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

        <RunControls
          connected={connected}
          runState={runState}
          shownRun={shownRun}
          send={send}
          touch={interact}
          onTouch={() => setInteract((v) => !v)}
        />
      </div>
      {overviewShown && (
        <Overview
          runs={runs}
          shownRun={shownRun}
          thumbs={thumbs}
          frameRef={frameRef}
          send={send}
          onPick={(run) => {
            setOverview(false);
            if (run !== shownRun) pickRun(run);
          }}
          onClose={() => setOverview(false)}
        />
      )}
    </div>
  );
}
