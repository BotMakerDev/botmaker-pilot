import { useEffect, useRef } from "react";
import type { ControlCmd } from "./types";

/** The keys a soft keyboard cannot type, by the SDK's `Key` constant names. */
export const SPECIAL_KEYS: Array<[label: string, key: string]> = [
  ["Esc", "ESCAPE"],
  ["Tab", "TAB"],
  ["⌫", "BACKSPACE"],
  ["⏎", "ENTER"],
  ["←", "LEFT"],
  ["↑", "UP"],
  ["↓", "DOWN"],
  ["→", "RIGHT"],
];

/**
 * The typing that goes over the wire for one change of the text field: everything that was added. The field
 * is emptied after each change, so what is in it is always new.
 */
export function typed(value: string): ControlCmd | null {
  return value.length > 0 ? { cmd: "input", kind: "text", text: value } : null;
}

interface Props {
  send: (cmd: ControlCmd) => void;
  onClose: () => void;
}

/**
 * A text field that raises the phone's own keyboard, and a row of the keys it lacks. Characters go as
 * `text`, the row and Enter as `key`. Where they land is the host's call: on its own desktop, only while the
 * bot's window has focus (the server says so with a notice otherwise).
 */
export function KeyboardBar({ send, onClose }: Props) {
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  return (
    <div className="keyboard-bar" onClick={(e) => e.stopPropagation()}>
      <div className="keyboard-row">
        <input
          ref={field}
          className="keyboard-field"
          placeholder="Type to send…"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            const cmd = typed(e.currentTarget.value);
            if (cmd) send(cmd);
            e.currentTarget.value = "";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send({ cmd: "input", kind: "key", key: "ENTER" });
            } else if (e.key === "Backspace" && e.currentTarget.value === "") {
              send({ cmd: "input", kind: "key", key: "BACKSPACE" });
            }
          }}
        />
        <button className="keyboard-close" onClick={onClose} aria-label="Close keyboard">
          ✕
        </button>
      </div>
      <div className="keyboard-row keys">
        {SPECIAL_KEYS.map(([label, key]) => (
          <button key={key} onClick={() => send({ cmd: "input", kind: "key", key })}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
