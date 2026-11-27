import type { ControlCmd, RunState } from "./types";

interface Props {
  connected: boolean;
  runState: RunState;
  /** The run this phone is shown, which a stop, pause or resume names. */
  shownRun: string | null;
  send: (cmd: ControlCmd) => void;
  touch: boolean;
  onTouch: () => void;
}

/** The three buttons: run or stop, pause or resume, and whether touches reach the PC. */
export function RunControls({ connected, runState, shownRun, send, touch, onTouch }: Props) {
  const stopped = runState === "stopped";
  const paused = runState === "paused";
  // Naming the run lets the host refuse a press made on a run it has since moved this phone away from. A start
  // names none: it is the open project's bot that starts, which is not yet a run.
  const on = (cmd: "stop" | "pause" | "resume"): ControlCmd => (shownRun ? { cmd, run: shownRun } : { cmd });

  return (
    <nav className="controls">
      <button
        className={`run-toggle ${stopped ? "go" : "halt"}`}
        disabled={!connected}
        onClick={() => send(stopped ? { cmd: "start" } : on("stop"))}
      >
        <span className="icon">{stopped ? "▶" : "■"}</span> {stopped ? "Start" : "Stop"}
      </button>
      <button
        className="pause-toggle"
        disabled={!connected || stopped}
        onClick={() => send(on(paused ? "resume" : "pause"))}
      >
        <span className="icon">{paused ? "⏵" : "⏸"}</span> {paused ? "Resume" : "Pause"}
      </button>
      <button className={`touch-toggle${touch ? " on" : ""}`} aria-pressed={touch} disabled={!connected} onClick={onTouch}>
        <span className="icon">✋</span> {touch ? "On" : "Touch"}
      </button>
    </nav>
  );
}
