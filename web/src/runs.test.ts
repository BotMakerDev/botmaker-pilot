import { describe, expect, test } from "vitest";
import { byBot, choosable, counts, neighbour, runName, tileName } from "./runs";
import type { RunEntry, RunState } from "./types";

const run = (id: string, bot: string, instance = "", state: RunState = "running"): RunEntry =>
  ({ id, bot, instance, state, startedMillis: new Date(2026, 10, 27, 9, 5).getTime() });

const RUNS = [run("a", "Farm", "emu-1"), run("b", "Login", "Pixel 5"), run("c", "Farm", "emu-2", "stopped")];

describe("the runs of the list", () => {
  test("are grouped by bot, in the order the host names the bots", () => {
    expect(byBot(RUNS).map((group) => [group.bot, group.runs.map((one) => one.id)]))
      .toEqual([["Farm", ["a", "c"]], ["Login", ["b"]]]);
  });

  test("are counted by state, saying nothing of a state none is in", () => {
    expect(counts(byBot(RUNS)[0].runs)).toBe("1 running · 1 stopped");
  });

  test("are told apart by instance, or by when they started", () => {
    expect(tileName(RUNS[0])).toBe("emu-1");
    expect(tileName(run("d", "Farm"))).toBe("09:05");
  });

  test("are named by bot and instance, and by the bot alone when there is one", () => {
    expect(runName(RUNS, "b")).toBe("Login · Pixel 5");
    expect(runName([RUNS[0]], "a")).toBe("Farm");
    expect(runName([], null)).toBe("BotPilot");
    expect(runName([RUNS[0]], null)).toBe("BotPilot");
  });

  test("offer a choice when there is a second one, or one that is not shown", () => {
    expect(choosable(RUNS, "a")).toBe(true);
    expect(choosable([RUNS[0]], null)).toBe(true);
    expect(choosable([RUNS[0]], "a")).toBe(false);
    expect(choosable([], null)).toBe(false);
  });

  test("are swiped through within one bot, stopping at each end", () => {
    expect(neighbour(RUNS, "a", 1)).toBe("c");
    expect(neighbour(RUNS, "c", -1)).toBe("a");
    expect(neighbour(RUNS, "c", 1)).toBeNull();
    expect(neighbour(RUNS, "b", 1)).toBeNull();
    expect(neighbour(RUNS, null, 1)).toBeNull();
  });
});
