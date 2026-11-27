# BotPilot

Remote companion client for **BotMaker**. It shows a live preview of the bots running on a computer and can
start / stop / pause / resume them and take over their input, from a browser or an installable Android app. The
**default** path is over your [Tailscale](https://tailscale.com) tailnet — the phone runs Tailscale signed into
the same account (zero computer-side setup, nothing exposed publicly). Reaching the computer from **anywhere with
no VPN on the phone** is an optional choice: Tailscale **Funnel** or a Cloudflare quick tunnel (public HTTPS). A
plain-`ws://` LAN bind is the last-resort fallback.

BotPilot is the client half. The server half is **BotMaker's core** (`botmaker-core`, `pilot/PilotServer`), the
process that owns the open bot and its runs. It serves this UI over HTTP and speaks a WebSocket protocol
carrying:

- **binary** frames — the surface of the run this phone is shown, in one of two formats (loss-tolerant, ~24 FPS)
- **text** messages — the run list, state, telemetry and trace (JSON) server→client, and control commands (JSON)
  client→server

The pilot is started on the computer, from Studio's **🎮 Pilot** window or with
`botmaker core pilot start [--transport tailnet|funnel|quick-tunnel|lan]`. What there is to see of a run (its game
window, emulator, monitor or desktop) is named by the bot's plugin; the SDK does that for its bots. A window or
emulator that is missing is shown as a reason, **never** as the desktop.

### Two frame formats, one negotiated

**JPEG is the floor**: a 16-byte header (`sx,sy,sw,sh`, big-endian int32) then the bytes, decoded with
`createImageBitmap`. It needs no negotiation and is what every client got before there was anything to
negotiate.

**H.264** is offered only if this client asks for it — `{"cmd":"hello","accept":["h264"]}` on connect — and
only when the run has a private session the host can encode. The host then sends
`{"type":"video","codec":…,"sx":…}` and every binary message after it is one tagged H.264 access unit, decoded
with a WebCodecs `VideoDecoder`. The surface rect is on the announcement rather than on each frame, since one
encoder on one display means it changes only when the stream does.

Both end in the same `frameRef` holding something `drawImage` takes and `.close()` releases, so the renderer,
the letterbox fit and the Interact coordinate mapping are identical either way. Every way the video path can
fail — no `VideoDecoder`, a `configure` that throws, a decoder that errors mid-stream — re-sends `hello` with
an empty `accept`, and the host resumes JPEG. A client that never says hello is a JPEG client, which is why no
version number appears anywhere in this.

## The screen

A status line (state, why there is no picture, *Bot · Instance*, a **⋯** menu) sits above the picture, and three
buttons below it: **Start/Stop**, **Pause/Resume** and **Touch**. In landscape the buttons are a rail beside the
picture. The menu holds **Overlays**, **Keys** (with Touch armed), **Log**, **Fit** and **Disconnect**.

With several runs live, **▦ N runs** opens an overview with a small picture of each, grouped by bot, and in
portrait a sideways swipe on the status line moves between the runs of the bot shown. Each phone picks its own
run. Switching clears the picture and the log and disarms Touch, so nothing of the run left behind is shown or
driven.

What a run gives depends on where it runs:

| run | picture and input | telemetry and log | stop / pause |
|---|---|---|---|
| the open project's | yes | yes | yes |
| started by the same core beside it (one per emulator, say) | yes | no | yes |
| any other process on the computer | no (*no view of this run yet*) | no | yes |

For the last two, pause and resume are Unix only, and a run with no process of its own yet cannot be stopped or
paused.

## Layout

```
botmaker-pilot/
├── web/       Vite + React + TypeScript — the single-source-of-truth UI (browser + PWA)
├── android/   Capacitor Android project — wraps web/dist into an installable APK
└── capacitor.config.ts
```

The same `web/` build is served two ways: by the core's server for browsers, and bundled into the APK by
Capacitor for a native mobile app.

### Pairing & updates

- **Pairing by QR scan.** The connect screen has a **📷 Scan QR** button (`web/src/QrScanner.tsx`): it opens
  the rear camera via **ZXing** (`@zxing/browser`, `BrowserQRCodeReader.decodeFromConstraints` with continuous
  autofocus) — a robust continuous-decode loop that stays smooth while the camera moves toward the code — and
  decodes the pairing QR straight into `parseUrl` → connect. No URL typing, no registration. Pasting a URL still
  works as a fallback. The APK declares `CAMERA` (see `AndroidManifest.xml`) and requests it on launch
  (`MainActivity`) so the WebView camera is grantable. The scanner **re-initializes on resume**
  (`visibilitychange`/focus): backgrounding the app (e.g. opening the native camera) suspends the camera track,
  so it re-acquires a fresh one on return instead of showing a frozen/black frame.
- **Connection history & reconnect.** Endpoints are remembered as a list (`web/src/config.ts`,
  `botpilot.connections`, migrated from the old single-endpoint key). The connect screen shows a **Recent
  connections** list — tap to reconnect without rescanning (the computer keeps a **stable pairing token** until
  you reset it, so a saved connection stays valid across restarts). When a socket is stuck reconnecting, a
  **Switch connection** overlay returns to the list without dropping the saved entry.
- **In-app auto-update.** On launch the app best-effort checks the latest GitHub release
  (`web/src/useAppUpdate.ts`, throttled) and, if newer than the built-in `__APP_VERSION__` (the release tag;
  `web/vite.config.ts`), shows an **Update available** banner. The connect-screen footer also shows the current
  version and a **Check for updates** button (force-checks, ignoring the throttle). The app alone checks: a
  browser is served by the computer and shows neither.

The pairing link carries the token. Show it to nobody but the person pairing a phone.

## Building

```bash
# Web UI (browser + PWA)
cd web && npm ci && npm run build      # → web/dist
#   dev loop: npm run dev

# Android APK (from the pilot root)
npm ci                                 # Capacitor CLI + native deps
npm run dist                           # web build → cap sync → assembleDebug, in one step
#   → android/app/build/outputs/apk/debug/app-debug.apk
#   (granular steps: npm run build:web / npx cap sync android / npm run apk)
```

### Tests

```bash
cd web && npm test                     # Vitest, jsdom — a few seconds, no device and no network
#   watch loop: npm run test:watch
```

The suites sit next to the code they cover. CI runs the typecheck and build only, so run them here.

**The wire contract is checked from both ends.** `web/src/wire-golden.json` is a corpus of the messages
the server can send, committed **byte-identically** here and in `botmaker-core`
(`src/test/resources/pilot-wire/`). `wire.test.ts` feeds each one through the real `usePilot` and asserts what
the client decodes; the core's `TelemetryWireContractTest` asserts it emits exactly those messages, the
`telemetry.` ones excepted (below). Neither test
can see the other repo, so both assert the corpus' **SHA-256** — change the protocol on one side and the other
side goes red until it is changed too. **Editing one copy means editing all four things: both files and both
digest constants.**

The `telemetry.` messages are drawn by the plugin that owns the run, so `botmaker-sdk` keeps its own corpus of
them (`src/test/resources/pilot-wire/`) and asserts its serializer against it. Change a `telemetry.` message in
both corpora.

The core serves the web UI to a browser from a build committed in its resources
(`com/botmaker/core/pilot/web`). Each release here attaches `web.zip` (`web/dist`), but the core does not pin it
yet, so a change to this checkout reaches browsers only when that committed build is refreshed.

The APK bundles `web/dist` locally and loads it from the `https://localhost` WebView origin. On the default
(tailnet) path it connects out over plain `ws://` to the Tailscale `100.x` IP (the tailnet itself is
the encryption), which is why `server.cleartext` is enabled in `capacitor.config.ts`. On the Funnel and tunnel
paths it instead connects over `wss://` — real TLS on a public host.

## How the phone reaches the computer

The pilot window's **How it connects** offers four free ways. The choice is remembered:

| way | phone needs | reach | notes |
|---|---|---|---|
| **Tailscale** (default) | Tailscale, same account | your tailnet only | plain `ws://` on the `100.x` address; the tailnet encrypts it |
| **Tailscale Funnel** | nothing | public HTTPS, `*.ts.net` | one-time setup on the account (below) |
| **Cloudflare quick tunnel** | nothing | public HTTPS, `*.trycloudflare.com` | needs `cloudflared` on the computer, no account; the address is new each start, so scan again |
| **Local network** | same Wi-Fi | anyone on that network | plain `ws://` on the computer's LAN address |

If the chosen way cannot start, the core falls back to Tailscale, then the local network, and says why. It never
falls back to a public address.

**When the phone cannot connect**, both ends say why. Over Tailscale, the pilot window lists each phone on the
tailnet and whether Tailscale sees it online. On the phone, the *Can't reach this connection* overlay lists the
steps for the way it was paired (`web/src/reach.ts`): for Tailscale, connect it, turn on Android's *Always-on
VPN* for it and set its battery use to *Unrestricted*; for a quick tunnel, scan the new QR (its address changes
at every start); for the local network, join the same Wi-Fi. Behind Funnel or a tunnel the server listens on
loopback only, and on the two public ways the token in the link is the only lock.

## Remote access over HTTPS (Tailscale Funnel)

To reach the computer from anywhere over **real, browser-trusted HTTPS**, **Tailscale Funnel** asks the local
`tailscale` daemon to expose its loopback pilot port publicly as `https://<machine>.<tailnet>.ts.net`. The phone
then just opens that URL in **any browser — no Tailscale, no VPN** — or installs the APK and pairs with it.

One-time machine/admin setup (the phone needs nothing):

1. Install Tailscale on the computer and log in.
2. Enable **HTTPS certificates** for the tailnet (Tailscale admin ▸ DNS).
3. Grant the **`funnel`** node-attribute in the tailnet ACL policy, e.g.:
   ```jsonc
   "nodeAttrs": [{ "target": ["autogroup:member"], "attr": ["funnel"] }]
   ```
4. Let your user manage Funnel without root (BotMaker runs as you, not root) — once:
   ```bash
   sudo tailscale set --operator=$USER
   ```

If Funnel isn't available or enabled, the pilot window shows the reason (including Tailscale's own "run `sudo
tailscale set --operator=$USER`" hint when that's the cause) under **Tailscale Funnel setup**, and the core falls
back to a direct bind — the Tailscale `100.x` IP if the tunnel is up, else the local network address with a
warning.

## Releasing the APK (fast phone install)

The umbrella release tags it (`sluice release --pilot <version>`, from the umbrella root); the tag builds in CI
(`.github/workflows/ci.yml`, job `apk`) and attaches to a GitHub Release `botpilot.apk`, its `.sha256` and
`web.zip`.

The pilot window's **Get the phone app** shows a QR pointing at the stable permalink
`https://github.com/BotMakerDev/botmaker-pilot/releases/latest/download/botpilot.apk`, which always resolves to
the newest release — scan it on the phone to download and install the latest build.

## Protocol (WebSocket `/ws?token=…`)

A bad token closes the socket with code 1008.

| Direction | Type | Payload |
|-----------|------|---------|
| server → client | binary | `[16-byte header: sx,sy,sw,sh as int32 BE][JPEG bytes]`, or one tagged H.264 access unit after a `video` message |
| server → client | text | `{"type":"runs","selected":id\|null,"runs":[{"id":…,"bot":…,"instance":…,"state":…,"startedMillis":…}]}` — on connect, and when the list or this phone's pick changes |
| server → client | text | `{"type":"state","run":"running\|stopped\|paused","backgroundInput":true,"reason":…,"runId":…}` — `reason` and `runId` are omitted when there is none |
| server → client | text | `{"type":"video","codec":…,"sx":…,"sy":…,"sw":…,"sh":…}` — a null `codec` ends the stream |
| server → client | text | `{"type":"thumb","runId":…,"jpeg":<base64>}` — only while this phone's overview is open, at most once a second per run |
| server → client | text | `{"type":"telemetry", …}` |
| server → client | text | `{"type":"trace","line":{"ts":…,"level":"debug\|info\|warn\|error\|","source":"Vision","text":…,"count":1}}` — the run's last 200 are replayed on connect |
| server → client | text | `{"type":"input","kinds":["tap",…,"key","text"]}` on connect — the keyboard shows only when `key` is listed |
| server → client | text | `{"type":"notice","text":…}` — one sentence, shown for 4 s (why a key was not sent) |
| server → client | text | `{"type":"ping"}` every 5 s — after the first one, 15 s of silence is taken as a dead link and the phone reconnects |
| client → server | text | `{"cmd":"hello","accept":["h264"]}` |
| client → server | text | `{"cmd":"select","run":id}` — this phone's pick; no `run` is the host's default |
| client → server | text | `{"cmd":"overview","on":true}` |
| client → server | text | `{"cmd":"start\|stop\|pause\|resume","run":id}` — a `run` that is not the one the phone is shown is refused |
| client → server | text | `{"cmd":"interact","on":true,"run":id}` — arm/disarm Touch; disarming is never refused |
| client → server | text | `{"cmd":"input","kind":"tap\|down\|move\|up\|scroll","x":…,"y":…,"button":1,"amount":-1}` |
| client → server | text | `{"cmd":"input","kind":"key","key":"ENTER"}` (an SDK `Key` name) / `{"cmd":"input","kind":"text","text":"gg"}` |

`runId` also marks `video` and `trace` messages. `run`, `runId`, `select` and `overview` are optional:
a client that sends and reads none of them is shown the open project.

### Zoom

Pinch to zoom (up to 6×) and move two fingers to pan, with or without Touch. With Touch off, one finger pans a
zoomed picture and a double tap goes back to the fit; **Fit** in the **⋯** menu does the same. The zoom is folded
into the transform Touch maps taps through, so a tap on a zoomed picture lands on the pixel under the finger. A
second finger landing during a drag releases the drag first, so a pinch never leaves a button held on the host.

### Keyboard

With Touch armed, **Keys** in the **⋯** menu opens a text field that raises the phone's keyboard, plus Esc, Tab,
⌫, ⏎ and the arrows. Characters go as `text`, the row as `key`. On a background session or an emulator they
always reach the bot's screen. **On the computer's own desktop a key is sent only while the bot's window has
focus** (the focused window is the streamed frame): anything else could be a terminal, so the host refuses it and
the phone shows *Tap the window first so it has focus*. A host that does not announce `key` gets no keyboard item.

### Overlays

The telemetry the bot sends is drawn over the stream: the search region and the match rect (green found, red
missed), a ring where a click landed, and an arrow along a swipe — each fading out over ~1.2s. **Overlays** in
the **⋯** menu turns the layer off; the choice is remembered in `localStorage` (`botpilot.overlays`) and defaults
to on. Turning it off does not stop the events arriving — they still expire on schedule, so turning it back on
shows what the bot is doing now rather than a backlog.

Overlays only exist for the open project's run **as BotMaker launched it** (the SDK ships them only when
`BM_IPC_PORT` is set), so a bot started by hand streams no overlay.

### Log

**Log** in the **⋯** menu opens a drawer over the stage with the run's debug lines, as Studio's Trace tab reads
them: the time, what wrote the line (`[Vision]`), the text, and `×N` for a line repeated in a loop. Pick a level
floor (All, Info+, Warnings+, Errors) or search. The drawer follows the newest line until you scroll up. A phone
that connects mid-run gets the run's last 200 lines first, and a new run starts it empty. Whether the bot writes
debug lines at all is Studio's 🐞 Debug button. Hiding lines by class or method is Studio's Trace tab only.

### Touch

With Touch armed, touches on the video are replayed on the computer as real mouse input. The server enforces
these, not the client:

- **Armed per connection and per run, disarmed by default.** A viewer that never asked can't poke the game, and a
  leaked public URL isn't a remote desktop until it arms.
- **Coordinates are absolute screen px**, derived client-side by inverting the canvas letterbox transform —
  and clamped server-side to the rect of the frame the client was actually last shown.
- **A tap is a `tap`**, not `down`+`up`. Only that path has a direct-to-window form (`PostMessage` on
  Windows); drags need pointer state and fall back to `move`/`button`, which drives the real pointer.
- **A tap carries the coordinate of the `pointerdown`, not the `pointerup`.** Within-slop drift (up to
  `DRAG_SLOP_PX` = 6 CSS px) still counts as a tap by design, but sending the lift position turned all of that
  drift into aim error — and the slop is in *phone* CSS px, so a 1280 px frame shown ~400 px wide multiplied it
  by ~3: ~19 px off target on a game that shows hover feedback for a near-miss. Drags still release where the
  finger lifted, which is the whole point of a drag.
- **On Linux the host escalates its input backend the first time Touch is used.** The cursor-preserving
  default (`XSendEvent`) flags its events `send_event=True`, and every Wine/Proton game ignores those — taps
  landed nowhere. The host now asks for uinput (else XTest) on first use, so the click actually lands at the
  cost of moving the computer's real cursor. `backgroundInput` in the state message says which you're getting,
  and the client's "moves the computer's real cursor" warning is what surfaces it.

## Status

Web client (browser + PWA) and Android APK build end-to-end against the core's `PilotServer`
(`botmaker-core`, `pilot/`).
