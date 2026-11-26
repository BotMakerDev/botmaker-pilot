import { describe, expect, it } from "vitest";
import { SPECIAL_KEYS, edits } from "./KeyboardBar";

const text = (t: string) => ({ cmd: "input", kind: "text", text: t });
const backspace = { cmd: "input", kind: "key", key: "BACKSPACE" };

describe("the keyboard", () => {
  it("sends what was typed as text, and nothing for an unchanged field", () => {
    expect(edits("", "gg")).toEqual([text("gg")]);
    expect(edits("gg", "gg")).toEqual([]);
  });

  it("sends only what a composing keyboard added, not the word again", () => {
    expect(edits("hel", "hell")).toEqual([text("l")]);
  });

  it("takes back what the keyboard replaced", () => {
    expect(edits("teh", "the")).toEqual([backspace, backspace, text("he")]);
    expect(edits("ab", "a")).toEqual([backspace]);
  });

  it("counts an emoji as one character", () => {
    expect(edits("a😀", "a")).toEqual([backspace]);
  });

  it("names its special keys by the SDK's Key constants", () => {
    // The host resolves these with Key.valueOf, so a spelling the SDK does not have is refused there.
    expect(SPECIAL_KEYS.map(([, key]) => key)).toEqual([
      "ESCAPE", "TAB", "BACKSPACE", "ENTER", "LEFT", "UP", "DOWN", "RIGHT",
    ]);
  });
});
