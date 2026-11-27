import { useEffect, useRef, useState } from "react";
import type { ControlCmd, Frame, RunEntry } from "./types";
import { byBot, counts, tileName } from "./runs";

/** How often the shown run's tile is redrawn from this phone's own picture. */
const OWN_TILE_MS = 500;
const TILE_EDGE = 160;

interface Props {
  runs: RunEntry[];
  shownRun: string | null;
  /** The host's small pictures, by run id, as image URLs. */
  thumbs: Record<string, string>;
  frameRef: React.MutableRefObject<Frame | null>;
  send: (cmd: ControlCmd) => void;
  onPick: (run: string) => void;
  onClose: () => void;
}

/**
 * Every run at once, grouped by bot. The host sends the small pictures only between `overview` on and off, which is
 * exactly while this is mounted. A tap selects the run for this phone.
 */
export function Overview({ runs, shownRun, thumbs, frameRef, send, onPick, onClose }: Props) {
  useEffect(() => {
    send({ cmd: "overview", on: true });
    return () => send({ cmd: "overview", on: false });
  }, [send]);

  return (
    <div className="overview" role="dialog" aria-label="All runs">
      <div className="overview-bar">
        <b>All runs</b>
        <button className="overview-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {byBot(runs).map((group) => (
        <section key={group.bot}>
          <h2>
            {group.bot} <span>{counts(group.runs)}</span>
          </h2>
          <div className="tiles">
            {group.runs.map((run) => {
              const selected = run.id === shownRun;
              const thumb = run.state === "stopped" ? undefined : thumbs[run.id];
              return (
                <button
                  key={run.id}
                  className={`tile${selected ? " selected" : ""}`}
                  aria-current={selected || undefined}
                  onClick={() => onPick(run.id)}
                >
                  <span className="picture">
                    {selected && run.state !== "stopped"
                      ? <OwnPicture frameRef={frameRef} fallback={thumb} />
                      : thumb && <img src={thumb} alt="" />}
                  </span>
                  <span className="label">
                    <span className={`dot ${run.state}`} />
                    {tileName(run)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * The shown run's picture, taken from what this phone is already receiving: the host sends no thumbnail of a run
 * whose picture goes out as video.
 */
function OwnPicture({ frameRef, fallback }: { frameRef: Props["frameRef"]; fallback: string | undefined }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const draw = () => {
      const frame = frameRef.current;
      const canvas = canvasRef.current;
      setDrawn(frame !== null);
      if (!frame || !canvas) return;
      canvas.width = TILE_EDGE;
      canvas.height = Math.max(1, Math.round((TILE_EDGE * frame.sh) / frame.sw));
      canvas.getContext("2d")?.drawImage(frame.bitmap, 0, 0, canvas.width, canvas.height);
    };
    draw();
    const timer = window.setInterval(draw, OWN_TILE_MS);
    return () => window.clearInterval(timer);
  }, [frameRef]);

  return (
    <>
      <canvas ref={canvasRef} hidden={!drawn} />
      {!drawn && fallback && <img src={fallback} alt="" />}
    </>
  );
}
