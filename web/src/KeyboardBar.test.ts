import { describe, expect, it } from "vitest";
import { SPECIAL_KEYS, typed } from "./KeyboardBar";

describe("the keyboard", () => {
  it("sends what was typed as text, and nothing for an empty field", () => {
    expect(typed("gg")).toEqual({ cmd: "input", kind: "text", text: "gg" });
    expect(typed("")).toBeNull();
  });

  it("names its special keys by the SDK's Key constants", () => {
    // The host resolves these with Key.valueOf, so a spelling the SDK does not have is refused there.
    expect(SPECIAL_KEYS.map(([, key]) => key)).toEqual([
      "ESCAPE", "TAB", "BACKSPACE", "ENTER", "LEFT", "UP", "DOWN", "RIGHT",
    ]);
  });
});
