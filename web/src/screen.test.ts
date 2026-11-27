import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Overview } from "./Overview";
import { RunControls } from "./RunControls";
import { StatusLine } from "./StatusLine";
import type { ControlCmd, RunEntry, RunState } from "./types";

/** The parts of the stream screen: what each shows for a state, and what a touch on it sends. */

const run = (id: string, bot: string, instance: string, state: RunState = "running"): RunEntry =>
  ({ id, bot, instance, state, startedMillis: 0 });

const RUNS = [run("a", "Farm", "emu-1"), run("b", "Farm", "emu-2"), run("c", "Login", "Pixel 5", "stopped")];

let host: HTMLDivElement;
let unmount: () => void = () => {};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => unmount());

function render(element: ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(element));
  unmount = () => {
    unmount = () => {};
    act(() => root.unmount());
    host.remove();
  };
}

const find = <T extends Element>(selector: string) => host.querySelector<T>(selector)!;
const click = (selector: string) => act(() => find<HTMLElement>(selector).click());

describe("the three buttons", () => {
  function controls(runState: RunState, shownRun: string | null = "a") {
    const sent: ControlCmd[] = [];
    render(createElement(RunControls, {
      connected: true, runState, shownRun, send: (cmd) => sent.push(cmd), touch: false, onTouch: () => {},
    }));
    return sent;
  }

  test("a stopped run offers Start, which names no run, and nothing to pause", () => {
    const sent = controls("stopped");
    expect(find(".run-toggle").textContent).toContain("Start");
    expect(find<HTMLButtonElement>(".pause-toggle").disabled).toBe(true);
    click(".run-toggle");
    expect(sent).toEqual([{ cmd: "start" }]);
  });

  test("a running run is stopped or paused by name", () => {
    const sent = controls("running");
    click(".run-toggle");
    click(".pause-toggle");
    expect(sent).toEqual([{ cmd: "stop", run: "a" }, { cmd: "pause", run: "a" }]);
  });

  test("a paused run offers Resume, and a host without a list is named no run", () => {
    const sent = controls("paused", null);
    expect(find(".pause-toggle").textContent).toContain("Resume");
    click(".pause-toggle");
    expect(sent).toEqual([{ cmd: "resume" }]);
  });
});

describe("the status line", () => {
  function line(runs: RunEntry[], shownRun: string | null, menuOpen = false) {
    const picked: string[] = [];
    render(createElement(StatusLine, {
      status: "connected", runState: "paused", reason: "The game window is closed.", runs, shownRun,
      onPick: (id) => picked.push(id), onOverview: () => {}, menu: [{ label: "Fit", run: () => {} }], menuOpen,
      onMenu: () => {},
    }));
    return picked;
  }

  const drag = (selector: string, dx: number, dy: number) => act(() => {
    const target = find(selector);
    target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 200, clientY: 10 }));
    target.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 200 + dx, clientY: 10 + dy }));
  });

  test("shows the state, why, the run's name and how many runs there are", () => {
    line(RUNS, "a");
    expect(find(".word").textContent).toBe("Paused");
    expect(find(".why").textContent).toBe("The game window is closed.");
    expect(find(".name b").textContent).toBe("Farm · emu-1");
    expect(find(".pill").textContent).toBe("▦ 3 runs");
  });

  test("with one run has no pill", () => {
    line([RUNS[0]], "a");
    expect(host.querySelector(".pill")).toBeNull();
  });

  test("offers the one listed run while none is shown, and names none", () => {
    line([RUNS[0]], null);
    expect(find(".name b").textContent).toBe("BotPilot");
    expect(find(".pill").textContent).toBe("▦ 1 run");
  });

  test("takes no swipe from the open menu or from what closes it", () => {
    const picked = line(RUNS, "a", true);
    drag(".menu-away", -80, 0);
    drag(".menu", -80, 0);
    expect(picked).toEqual([]);
  });

  test("moves along the bot's runs on a sideways swipe only", () => {
    const picked = line(RUNS, "a");
    drag(".name", -80, 5);
    drag(".name", -10, 0);
    drag(".name", -80, 60);
    drag(".name", 80, 0);
    expect(picked).toEqual(["b"]);
  });

  test("does not take a drag that began on a button for a swipe", () => {
    const picked = line(RUNS, "a");
    drag(".pill", -80, 0);
    expect(picked).toEqual([]);
  });
});

describe("the overview", () => {
  function overview(thumbs: Record<string, string>) {
    const sent: ControlCmd[] = [];
    const picked: string[] = [];
    render(createElement(Overview, {
      runs: RUNS, shownRun: "a", thumbs, frameRef: { current: null }, send: (cmd) => sent.push(cmd),
      onPick: (id) => picked.push(id), onClose: () => {},
    }));
    return { sent, picked };
  }

  test("asks for thumbnails only while it is open", () => {
    const { sent } = overview({});
    expect(sent).toEqual([{ cmd: "overview", on: true }]);
    unmount();
    expect(sent).toEqual([{ cmd: "overview", on: true }, { cmd: "overview", on: false }]);
  });

  test("groups the runs by bot and draws no picture for a stopped one", () => {
    overview({ b: "data:image/jpeg;base64,Qg==", c: "data:image/jpeg;base64,Qw==" });
    expect([...host.querySelectorAll("h2")].map((h) => h.textContent))
      .toEqual(["Farm 2 running", "Login 1 stopped"]);
    expect(host.querySelectorAll(".tile img")).toHaveLength(1);
    expect(find(".tile.selected .label").textContent).toBe("emu-1");
  });

  test("a tile picks its run", () => {
    const { picked } = overview({});
    click(".tile:not(.selected)");
    expect(picked).toEqual(["b"]);
  });
});
