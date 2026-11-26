import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, test } from "vitest";
import { useBack } from "./useBack";

/** History traversal is asynchronous, in jsdom too; what it renders is applied when each `act` ends. */
async function settle() {
  for (let i = 0; i < 3; i++) await act(() => new Promise<void>((done) => setTimeout(done, 20)));
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

describe("the back action", () => {
  test("closes what is open, once per step, and leaves no entry behind", async () => {
    let layers = 2;
    const root = createRoot(document.createElement("div"));
    function Probe() {
      useBack(layers > 0, () => {
        layers--;
        root.render(createElement(Probe));
      });
      return null;
    }
    const before = window.history.state;
    act(() => root.render(createElement(Probe)));
    await settle();
    expect(window.history.state).toEqual({ botpilot: true });

    window.history.back();
    await settle();
    expect(layers).toBe(1);
    expect(window.history.state).toEqual({ botpilot: true });

    window.history.back();
    await settle();
    expect(layers).toBe(0);
    expect(window.history.state).toEqual(before);
    act(() => root.unmount());
  });

  test("one thing taking another's place keeps a single entry, and closing it by hand takes it back", async () => {
    function Open() {
      useBack(true, () => {});
      return null;
    }
    const before = window.history.state;
    const root = createRoot(document.createElement("div"));
    act(() => root.render(createElement(Open, { key: "scanner" })));
    await settle();
    const length = window.history.length;
    act(() => root.render(createElement(Open, { key: "stream" })));
    await settle();
    expect(window.history.length).toBe(length);
    expect(window.history.state).toEqual({ botpilot: true });
    act(() => root.unmount());
    await settle();
    expect(window.history.state).toEqual(before);
  });
});
