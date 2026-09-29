import { describe, expect, it } from "vitest";
import { reachSteps, routeOf } from "./reach";

describe("routeOf", () => {
  it("tells the four ways Studio offers apart by address", () => {
    expect(routeOf({ host: "100.68.8.73" })).toBe("tailnet");
    expect(routeOf({ host: "box.tail1234.ts.net" })).toBe("funnel");
    expect(routeOf({ host: "calm-river-fox.trycloudflare.com" })).toBe("tunnel");
    expect(routeOf({ host: "192.168.0.107" })).toBe("lan");
    expect(routeOf({ host: "172.20.0.1" })).toBe("lan");
    expect(routeOf({ host: "example.com" })).toBe("other");
    expect(routeOf({ host: "100.128.0.1" })).toBe("other");
  });
});

describe("reachSteps", () => {
  it("sends a tailnet phone to Always-on VPN and the battery setting", () => {
    const steps = reachSteps({ host: "100.68.8.73" }).join(" ");
    expect(steps).toContain("Always-on VPN");
    expect(steps).toContain("Unrestricted");
  });

  it("tells a quick-tunnel phone to scan again", () => {
    expect(reachSteps({ host: "a-b.trycloudflare.com" }).join(" ")).toContain("new QR");
  });

  it("ends every list with Studio's side", () => {
    for (const host of ["100.68.8.73", "box.ts.net", "192.168.0.2", "example.com"]) {
      const steps = reachSteps({ host });
      expect(steps[steps.length - 1]).toContain("Studio");
    }
  });
});
