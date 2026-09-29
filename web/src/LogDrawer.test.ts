import { describe, expect, test } from "vitest";
import { atLeast } from "./LogDrawer";
import type { TraceLine } from "./types";

const line = (level: string): TraceLine => ({ ts: 0, level, source: "Bot", text: "x", count: 1 });

describe("the log drawer's level floor", () => {
  test("keeps a line at or above the floor and drops one below it", () => {
    expect(atLeast(line("debug"), "debug")).toBe(true);
    expect(atLeast(line("debug"), "info")).toBe(false);
    expect(atLeast(line("warn"), "info")).toBe(true);
    expect(atLeast(line("warn"), "error")).toBe(false);
    expect(atLeast(line("error"), "error")).toBe(true);
  });

  test("always keeps a level it does not know", () => {
    expect(atLeast(line(""), "error")).toBe(true);
    expect(atLeast(line("trace"), "error")).toBe(true);
  });
});
