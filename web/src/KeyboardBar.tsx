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
 * What to send for the text field going from `before` to `after`: a Backspace for every character that went,
 * then the text that came. A composing keyboard rewrites the word it is on at each keystroke, so the whole
 * field is never new.
 */
export function edits(before: string, after: string): ControlCmd[] {
  const old = Array.from(before);
  const now = Array.from(after);
  let same = 0;
  while (same < old.length && same < now.length && old[same] === now[same]) same++;
  const commands: ControlCmd[] = old.slice(same).map(() => ({ cmd: "input", kind: "key", key: "BACKSPACE" }));
  if (now.length > same) commands.push({ cmd: "input", kind: "text", text: now.slice(same).join("") });
  return commands;
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
  /** What of the field the host already has. */
  const sent = useRef("");

  useEffect(() => {
    field.current?.focus();
  }, []);

  // Emptying a field in the middle of a composition makes the keyboard commit the word again.
  const empty = (input: HTMLInputElement) => {
    input.value = "";
    sent.current = "";
  };

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
            const value = e.currentTarget.value;
            edits(sent.current, value).forEach(send);
            sent.current = value;
            if (!(e.nativeEvent as InputEvent).isComposing) empty(e.currentTarget);
          }}
          onCompositionEnd={(e) => empty(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
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
          <button
            key={key}
            // Taking focus from the field would put the phone's keyboard away.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              // The key changes the text under a word still being composed: end it, and start afresh.
              const input = field.current;
              if (input && input.value !== "") {
                input.blur();
                empty(input);
                input.focus();
              }
              send({ cmd: "input", kind: "key", key });
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
