import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConnStatus, ControlCmd, Endpoint, Frame, RunEntry, RunState, TelemetryEvent, TraceLine, VideoStreamInfo,
} from "./types";
import { wsUrl } from "./config";

const OVERLAY_TTL_MS = 1200;

/** How long a host notice stays on screen. */
export const NOTICE_MS = 4000;

/** How many trace lines the log drawer keeps; Studio replays its last 200 on connect. */
export const TRACE_KEEP = 500;

/** Silence after which a host that sends heartbeats is taken to be gone. It sends one every 5 s. */
export const PING_TIMEOUT_MS = 15_000;

/** The close code of a token the host does not accept: retrying with it can never work. */
const BAD_TOKEN = 1008;

const FIRST_BACKOFF_MS = 500;

/** Binary tag bytes of an H.264 message. A JPEG frame carries no tag — see `handleBinary`. */
const TAG_H264 = 2;
const TAG_H264_KEY = 3;

/**
 * Whether this runtime has the WebCodecs decoder at all. It is a capability check, not a guarantee: a WebView
 * can expose `VideoDecoder` and still fail to configure one (no hardware decoder for the profile, a locked-down
 * embedder), which is why `startVideo` also has to survive the attempt failing.
 */
function canDecodeH264(): boolean {
  return typeof VideoDecoder !== "undefined";
}

/**
 * Owns the WebSocket to a PilotServer: connects (with reconnect backoff), decodes the video — as JPEG frames or
 * as an H.264 stream, whichever the server is sending — and text (telemetry/state) messages, and sends control
 * commands. Frame + overlay state are exposed via refs the canvas renderer reads each rAF, so a 24 FPS stream
 * doesn't trigger 24 React renders/sec.
 *
 * ## The two frame paths
 *
 * JPEG is the floor and needs no negotiation: a binary message is a 16-byte rect header and a JPEG, decoded
 * with `createImageBitmap`. H.264 is offered only if this client asks for it in its `hello` and the server has
 * a session it can encode; the server then announces the stream with a `video` message — carrying the surface
 * rect *once*, since it no longer changes per frame — and every binary message after that is one tagged access
 * unit for the decoder.
 *
 * Both paths end in the same `frameRef`, holding a thing `drawImage` accepts and `.close()` releases, so the
 * renderer, the fit maths and the Interact coordinate mapping are identical either way. **Every** failure of
 * the video path — no `VideoDecoder`, a `configure` that throws, a decoder that errors mid-stream — hands back
 * to JPEG by telling the server this client no longer accepts H.264.
 *
 * ## When it gives up, and when it lets go
 *
 * A refused token (`rejected`) and an address no socket can be opened to (`invalid`) are final. A hidden app
 * and a phone with no network close the socket and open a new one when they are back. The host does not resend
 * an unchanged picture, so a quiet socket is not a dead one: only a missed heartbeat is.
 */
export function usePilot(endpoint: Endpoint | null) {
  const [status, setStatus] = useState<ConnStatus>("closed");
  const [runState, setRunState] = useState<RunState>("stopped");
  // Whether the host can synthesize input without hijacking its real cursor (see PilotInputService).
  const [backgroundInput, setBackgroundInput] = useState(true);
  // Why the host has no picture to send, or null while it has one.
  const [reason, setReason] = useState<string | null>(null);
  // The run's trace, for the log drawer. State rather than a ref: a line is read by a person, not drawn at
  // 24 FPS, and the drawer has to re-render when one arrives.
  const [trace, setTrace] = useState<TraceLine[]>([]);
  // The input kinds the host announced on connect. Empty until it does — and forever from an SDK that
  // predates the keyboard, which is how the keyboard button knows to stay hidden.
  const [inputKinds, setInputKinds] = useState<string[]>([]);
  // The host's last one-sentence notice (why a key was not sent), cleared after NOTICE_MS.
  const [notice, setNotice] = useState<string | null>(null);
  // The host's live runs and the one this phone is shown. Empty and null from a host that predates the list, and
  // from one with no run to show; the phone then behaves as it always did.
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [shownRun, setShownRun] = useState<string | null>(null);
  const runRef = useRef<RunState>("stopped");

  const frameRef = useRef<Frame | null>(null);
  const overlaysRef = useRef<TelemetryEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const send = useCallback((cmd: ControlCmd) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(cmd));
  }, []);

  useEffect(() => {
    if (!endpoint) return;
    // Everything below is this endpoint's own, so a late event of the previous one cannot act on it.
    let disposed = false;
    let final = false;
    let socket: WebSocket | null = null;
    let backoff = FIRST_BACKOFF_MS;
    let reconnectTimer: number | undefined;
    let watchdog: number | undefined;
    let heardAt = 0;
    /** JPEG decodes started, and the newest one no later picture may be older than. */
    let decoding = 0;
    let drawn = 0;

    /** The live decoder and the rect its pictures map to, or null while this connection is on JPEG. */
    let video: { decoder: VideoDecoder; rect: Omit<VideoStreamInfo, "codec">; keyed: boolean } | null = null;
    /** A monotonic microsecond stamp. The decoder requires one and passes it through; nothing here reads it. */
    let stamp = 0;

    setStatus("connecting");
    setRunState("stopped");
    setBackgroundInput(true);
    setReason(null);
    setNotice(null);
    setRuns([]);
    setShownRun(null);
    runRef.current = "stopped";

    const publish = (bitmap: Frame["bitmap"], rect: Omit<VideoStreamInfo, "codec">) => {
      const prev = frameRef.current;
      frameRef.current = { bitmap, ...rect };
      // Release the previous picture only once its replacement is in place: a VideoFrame left unclosed
      // stalls the decoder within a few frames, and one closed early is drawn as a blank.
      if (prev) prev.bitmap.close();
    };

    /** Takes the picture off the screen, including one still being decoded. */
    const blank = () => {
      drawn = decoding;
      frameRef.current?.bitmap.close();
      frameRef.current = null;
      overlaysRef.current = [];
    };

    const stopVideo = () => {
      const running = video;
      video = null;
      if (!running) return;
      try {
        running.decoder.close();
      } catch {
        // Already closed by its own error handler; there is nothing to undo.
      }
    };

    /**
     * Give up on H.264 for this connection and say so, so the server resumes JPEG. Called for every way the
     * decoder can fail — the alternative is a canvas that stops updating with nothing to explain it.
     */
    const fallBackToJpeg = (ws: WebSocket) => {
      stopVideo();
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ cmd: "hello", accept: [] }));
    };

    const startVideo = (ws: WebSocket, info: VideoStreamInfo) => {
      stopVideo();
      drawn = decoding;   // a JPEG still being decoded is older than anything this stream will draw
      const rect = { sx: info.sx, sy: info.sy, sw: info.sw, sh: info.sh };
      try {
        const decoder = new VideoDecoder({
          output: (frame) => publish(frame, rect),
          error: () => fallBackToJpeg(ws),
        });
        decoder.configure({ codec: info.codec, optimizeForLatency: true });
        video = { decoder, rect, keyed: false };
      } catch {
        // The runtime has VideoDecoder but cannot decode this profile. Nothing is broken yet — the server
        // has simply been sending a format this phone can't read, and telling it so restores the picture.
        fallBackToJpeg(ws);
      }
    };

    /** Lets go of the socket, if any: nothing it still has to say is heard. */
    const release = () => {
      window.clearTimeout(reconnectTimer);
      window.clearInterval(watchdog);
      watchdog = undefined;
      const old = socket;
      socket = null;
      wsRef.current = null;
      stopVideo();   // a decoder outliving its socket would decode into a frame nothing draws
      setReason(null);
      if (!old) return;
      old.onopen = old.onclose = old.onerror = old.onmessage = null;
      old.close();
    };

    const retry = () => {
      setStatus("reconnecting");
      reconnectTimer = window.setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 8000);
    };

    const connect = () => {
      if (disposed || final || socket || document.visibilityState === "hidden") return;
      window.clearTimeout(reconnectTimer);
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl(endpoint));
      } catch {
        final = true;
        setStatus("invalid");
        return;
      }
      ws.binaryType = "arraybuffer";
      socket = ws;
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        backoff = FIRST_BACKOFF_MS;
        // Studio replays the run's recent trace on every connect, so what was held before would arrive twice.
        setTrace([]);
        // Before anything else on the socket: what this client can decode. A server that predates this
        // ignores the command, and a client that never sends it is served JPEG — so neither end needs a
        // version number.
        ws.send(JSON.stringify({ cmd: "hello", accept: canDecodeH264() ? ["h264"] : [] }));
      };
      ws.onclose = (ev) => {
        release();
        if (ev?.code === BAD_TOKEN) {
          final = true;
          setStatus("rejected");
          return;
        }
        retry();
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev) => {
        heardAt = Date.now();
        if (typeof ev.data === "string") handleText(ws, ev.data);
        else handleBinary(ws, ev.data as ArrayBuffer);
      };
    };

    /** Only a host that has sent one heartbeat is expected to send more; an older SDK sends none. */
    const watchForSilence = () => {
      if (watchdog !== undefined) return;
      watchdog = window.setInterval(() => {
        if (Date.now() - heardAt < PING_TIMEOUT_MS) return;
        release();
        retry();
      }, 1000);
    };

    const handleText = (ws: WebSocket, text: string) => {
      let msg: {
        type?: string;
        run?: RunState;
        backgroundInput?: boolean;
        reason?: string;
        event?: TelemetryEvent;
        line?: TraceLine;
        codec?: string | null;
        sx?: number; sy?: number; sw?: number; sh?: number;
        kinds?: string[];
        text?: string;
        selected?: string | null;
        runs?: RunEntry[];
      };
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      if (msg.type === "state") {
        if (msg.run) {
          // A new run starts on an empty drawer, as Studio's own backlog does; a resume keeps what is there.
          if (msg.run === "running" && runRef.current === "stopped") setTrace([]);
          runRef.current = msg.run;
          setRunState(msg.run);
        }
        if (typeof msg.backgroundInput === "boolean") setBackgroundInput(msg.backgroundInput);
        // Every state carries the reason while there is one, so its absence means the picture is back.
        const why = typeof msg.reason === "string" && msg.reason ? msg.reason : null;
        setReason(why);
        if (why) blank();
      }
      else if (msg.type === "runs" && Array.isArray(msg.runs)) {
        setRuns(msg.runs);
        setShownRun(typeof msg.selected === "string" ? msg.selected : null);
      }
      else if (msg.type === "ping") watchForSilence();
      else if (msg.type === "video") {
        if (!msg.codec) stopVideo();
        else startVideo(ws, { codec: msg.codec, sx: msg.sx ?? 0, sy: msg.sy ?? 0, sw: msg.sw ?? 0, sh: msg.sh ?? 0 });
      }
      else if (msg.type === "telemetry" && msg.event) {
        const e = msg.event;
        e._exp = Date.now() + OVERLAY_TTL_MS;
        const next = [...overlaysRef.current, e];
        overlaysRef.current = next.length > 40 ? next.slice(next.length - 40) : next;
      }
      else if (msg.type === "input" && Array.isArray(msg.kinds)) {
        setInputKinds(msg.kinds.filter((k) => typeof k === "string"));
      }
      else if (msg.type === "notice" && typeof msg.text === "string") {
        setNotice(msg.text);
      }
      else if (msg.type === "trace" && msg.line) {
        const line = msg.line;
        setTrace((held) => {
          const next = [...held, line];
          return next.length > TRACE_KEEP ? next.slice(next.length - TRACE_KEEP) : next;
        });
      }
    };

    /**
     * A binary message is H.264 while a decoder is running, and a JPEG frame otherwise. The decoder's presence
     * is the discriminator rather than the tag byte, because the tag exists only on the newer payload — the
     * JPEG framing is unchanged from builds this server still has to serve. The tag is checked all the same:
     * the `video` message that starts a stream arrives on the same ordered socket as the packets it describes,
     * so a mismatch is not a race, it is a bug.
     */
    const handleBinary = (ws: WebSocket, buf: ArrayBuffer) => {
      if (video) {
        const tag = new Uint8Array(buf, 0, 1)[0];
        if (tag !== TAG_H264 && tag !== TAG_H264_KEY) return;
        // A delta means nothing to a decoder that has not had its keyframe, and would only make it fail.
        if (tag === TAG_H264_KEY) video.keyed = true;
        else if (!video.keyed) return;
        try {
          video.decoder.decode(new EncodedVideoChunk({
            type: tag === TAG_H264_KEY ? "key" : "delta",
            timestamp: (stamp += 1000),
            data: new Uint8Array(buf, 1),
          }));
        } catch {
          fallBackToJpeg(ws);
        }
        return;
      }
      const dv = new DataView(buf);
      const sx = dv.getInt32(0), sy = dv.getInt32(4), sw = dv.getInt32(8), sh = dv.getInt32(12);
      const order = ++decoding;
      // createImageBitmap decodes off the main thread, and need not finish in the order it was asked.
      createImageBitmap(new Blob([buf.slice(16)], { type: "image/jpeg" }))
        .then((bitmap) => {
          if (disposed || order <= drawn) {
            bitmap.close();
            return;
          }
          drawn = order;
          publish(bitmap, { sx, sy, sw, sh });
        })
        .catch(() => {});
    };

    const suspend = () => {
      if (final) return;
      release();
      setStatus("reconnecting");
    };
    const resume = () => {
      backoff = FIRST_BACKOFF_MS;
      connect();
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? suspend() : resume());
    // The network that came back is not the one the old socket was opened on.
    const onOnline = () => {
      suspend();
      resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", suspend);

    connect();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", suspend);
      release();
      blank();
      setStatus("closed");
      setTrace([]);
      setInputKinds([]);
    };
  }, [endpoint]);

  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const clearTrace = useCallback(() => setTrace([]), []);

  return {
    status, runState, backgroundInput, reason, frameRef, overlaysRef, trace, clearTrace, send, inputKinds,
    notice, runs, shownRun,
  };
}
