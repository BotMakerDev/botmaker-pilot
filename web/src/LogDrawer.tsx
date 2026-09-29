import { useEffect, useMemo, useRef, useState } from "react";
import type { TraceLine } from "./types";

/**
 * How much to show, lowest first. "" is a level Studio did not know; it passes every filter, because hiding
 * what nobody asked to hide is the worse failure — the rule Studio's own Trace tab keeps.
 */
export const LEVELS = ["debug", "info", "warn", "error"] as const;
export type MinLevel = (typeof LEVELS)[number];

const LABELS: Record<MinLevel, string> = { debug: "All", info: "Info+", warn: "Warnings+", error: "Errors" };

/** Whether `line` is at least `min`. */
export function atLeast(line: TraceLine, min: MinLevel): boolean {
  const rank = LEVELS.indexOf(line.level as MinLevel);
  return rank < 0 || rank >= LEVELS.indexOf(min);
}

/** "12:03:04", in the phone's own time zone. */
function clock(ts: number): string {
  const d = new Date(ts);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

interface Props {
  lines: TraceLine[];
  onClear: () => void;
  onClose: () => void;
}

/**
 * The run's trace on the phone: a bottom sheet over the stage, newest line at the bottom, following the run
 * until the user scrolls up to read — the same as a terminal. The fine filter (by class and method) is Studio's;
 * a phone gets a level floor and a search, which is what fits a thumb.
 */
export function LogDrawer({ lines, onClear, onClose }: Props) {
  const [min, setMin] = useState<MinLevel>("debug");
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter((l) => atLeast(l, min)
      && (!q || l.text.toLowerCase().includes(q) || l.source.toLowerCase().includes(q)));
  }, [lines, min, query]);

  useEffect(() => {
    const list = listRef.current;
    if (list && follow.current) list.scrollTop = list.scrollHeight;
  }, [shown]);

  return (
    <div className="log-drawer" role="dialog" aria-label="Bot log">
      <div className="log-bar">
        {LEVELS.map((level) => (
          <button key={level} className={`log-level${min === level ? " on" : ""}`} onClick={() => setMin(level)}>
            {LABELS[level]}
          </button>
        ))}
        <input
          className="log-search"
          type="search"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="log-clear" onClick={onClear}>Clear</button>
        <button className="log-close" onClick={onClose} aria-label="Close log">✕</button>
      </div>
      <div
        className="log-lines"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {shown.length === 0 ? (
          <p className="log-empty">
            {lines.length === 0 ? "No lines yet. Studio’s 🐞 Debug decides whether the bot writes them." : "No line matches."}
          </p>
        ) : (
          shown.map((l, i) => (
            <div key={i} className={`log-line ${l.level || "other"}`}>
              <span className="log-time">{clock(l.ts)}</span>
              {l.source && <span className="log-source">[{l.source}]</span>}
              <span className="log-text">{l.text}</span>
              {l.count > 1 && <span className="log-count">×{l.count}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
