import type { CapacitorConfig } from "@capacitor/cli";

/**
 * BotPilot Android shell. The web client (web/dist) is bundled into the APK and loaded from the
 * local `https://localhost` WebView origin.
 *
 * `androidScheme: "https"` keeps the bundled app on a secure origin (so localStorage etc. behave).
 * `cleartext: true` / `allowMixedContent` are needed by two of the four ways in: the default one (Tailscale,
 * plain `ws://` to the `100.x` address, which the tailnet encrypts) and the local network (plain `ws://`).
 * The public ways, Funnel and a Cloudflare tunnel, use `wss://`.
 */
const config: CapacitorConfig = {
  appId: "dev.liqiye.botpilot",
  appName: "BotPilot",
  webDir: "web/dist",
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: "https",
    cleartext: true,
  },
};

export default config;
