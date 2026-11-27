import { useRef } from "react";
import type { ConnStatus, RunEntry, RunState } from "./types";
import { choosable, neighbour, runName } from "./runs";

/** Sideways movement (CSS px) that makes a touch on the status line a swipe to the next run. */
export const SWIPE_RUN_PX = 48;

const STATE_WORDS: Record<RunState, string> = { running: "Running", paused: "Paused", stopped: "Stopped" };

const CONN_WORDS: Record<ConnStatus, string> = {
  connected: "Connected",
  connecting: "Connecting",
  reconnecting: "Reconnecting",
  rejected: "Refused",
  invalid: "Bad address",
  closed: "Offline",
};

export interface MenuItem {
  label: string;
  on?: boolean;
  run: () => void;
}

interface Props {
  status: ConnStatus;
  runState: RunState;
  reason: string | null;
  runs: RunEntry[];
  shownRun: string | null;
  onPick: (run: string) => void;
  onOverview: () => void;
  menu: MenuItem[];
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
}

/**
 * The line that is always there: the run's state and why, its name, and the way to everything that is not one of
 * the three buttons. Swiping it sideways moves between the runs of one bot. In landscape its parts move into the
 * side rail (see styles.css), which is why the state and the actions are elements of their own.
 */
export function StatusLine(props: Props) {
  const { status, runState, reason, runs, shownRun, onPick, onOverview, menu, menuOpen, onMenu } = props;
  const connected = status === "connected";
  const from = useRef<{ x: number; y: number } | null>(null);

  const swiped = (x: number, y: number) => {
    const start = from.current;
    from.current = null;
    if (!start || !connected) return;
    const dx = x - start.x;
    // Mostly sideways, or it is a scroll or a pull on the notification shade.
    if (Math.abs(dx) < SWIPE_RUN_PX || Math.abs(dx) < 2 * Math.abs(y - start.y)) return;
    const next = neighbour(runs, shownRun, dx < 0 ? 1 : -1);
    if (next) onPick(next);
  };

  return (
    <header
      className="status-line"
      onPointerDown={(e) => {
        // The menu and what closes it are inside the header too: a drag on them is no swipe.
        const onControl = (e.target as Element).closest("button, .menu, .menu-away");
        from.current = onControl ? null : { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => swiped(e.clientX, e.clientY)}
      onPointerCancel={() => (from.current = null)}
    >
      <div className="state">
        <span className={`dot ${connected ? runState : "offline"}`} />
        <span className="word">{connected ? STATE_WORDS[runState] : CONN_WORDS[status]}</span>
      </div>
      <div className="name">
        <b>{runName(runs, shownRun)}</b>
        {connected && reason && <span className="why">{reason}</span>}
      </div>
      <div className="actions">
        {connected && choosable(runs, shownRun) && (
          <button className="pill" onClick={onOverview}>
            ▦ {runs.length}
            <span className="pill-word">{runs.length === 1 ? " run" : " runs"}</span>
          </button>
        )}
        <button className="menu-toggle" aria-label="Menu" aria-expanded={menuOpen} onClick={() => onMenu(!menuOpen)}>
          ⋯
        </button>
      </div>
      {menuOpen && (
        <>
          <div className="menu-away" onClick={() => onMenu(false)} />
          <div className="menu" role="menu">
            {menu.map((item) => (
              <button
                key={item.label}
                role="menuitem"
                className={item.on ? "on" : ""}
                onClick={() => {
                  onMenu(false);
                  item.run();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </header>
  );
}
