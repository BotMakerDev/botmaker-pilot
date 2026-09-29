import type { Endpoint } from "./types";

/**
 * What to try when Studio's pilot cannot be reached, decided by how the phone was paired.
 *
 * Studio offers four ways in (Tailscale, Funnel, a Cloudflare quick tunnel, the local network), and each
 * fails for its own reason: Tailscale disconnected on the phone, a tunnel address that changed when the pilot
 * restarted, a phone on another Wi-Fi. The address alone says which one this is.
 */
export type Route = "tailnet" | "funnel" | "tunnel" | "lan" | "other";

export function routeOf(ep: Pick<Endpoint, "host">): Route {
  const host = ep.host.toLowerCase();
  if (host.endsWith(".trycloudflare.com")) return "tunnel";
  if (host.endsWith(".ts.net")) return "funnel";
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return "other";
  const [a, b] = parts;
  if (a === 100 && b >= 64 && b <= 127) return "tailnet";
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "lan";
  return "other";
}

/** The steps to try, in order. The last one is always Studio's side. */
export function reachSteps(ep: Pick<Endpoint, "host">): string[] {
  const studio = "In Studio, open 🎮 Remote Pilot: it shows the address in use and which ways work.";
  switch (routeOf(ep)) {
    case "tailnet":
      return [
        "Open the Tailscale app and make sure it says Connected, on the same account as the computer.",
        "Keep it connected: Android Settings ▸ Network ▸ VPN ▸ Tailscale ⚙ ▸ Always-on VPN.",
        "Stop Android from pausing it: Settings ▸ Apps ▸ Tailscale ▸ Battery ▸ Unrestricted.",
        studio,
      ];
    case "funnel":
      return ["Check the phone has internet.", "Studio may have closed the pilot or turned Funnel off. " + studio];
    case "tunnel":
      return [
        "A Cloudflare quick tunnel gets a new address each time the pilot starts, so this one may be gone.",
        "Scan the new QR in Studio's Remote Pilot dialog.",
      ];
    case "lan":
      return [
        "Connect the phone to the same Wi-Fi as the computer (mobile data cannot reach a local address).",
        studio,
      ];
    default:
      return ["Check the phone has a network connection.", studio];
  }
}
