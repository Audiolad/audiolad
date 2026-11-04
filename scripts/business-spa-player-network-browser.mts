// AudioLad Business Stage 1B P0-3: headless browser check of hall network recovery.
// Not part of CI (needs a local Chromium). Run: npx tsx scripts/business-spa-player-network-browser.mts
//
// The REAL SpaOnlinePlayer + FadingAudio classes are bundled with esbuild and driven by a real
// <audio> element, wired like BusinessCabinetPlayer (error / waiting / stalled / timeupdate /
// ended / online). A local 127.0.0.1 server serves generated WAV tracks (throttled, so the
// element cannot buffer the whole track) and a fake track-url sign endpoint.
//  1. Offline mid-track (browser offline + server drops the stream) -> back online ->
//     the SAME track resumes near the same position, without any click.
//  2. Autoplay refused (no user gesture) -> needsGesture state, no retry loop; one click ->
//     plays.
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { build } from "esbuild";
import { chromium } from "playwright";

const RATE = 48_000; // high enough byte rate that the demuxer probe is a fraction of a second
const SECONDS = 120;
function wav(seconds: number, hz: number): Buffer {
  const n = RATE * seconds;
  const b = Buffer.alloc(44 + n);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write("data", 36); b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(20 * Math.sin((2 * Math.PI * hz * i) / RATE));
  return b;
}
const tracks: Record<string, Buffer> = { "track-1": wav(SECONDS, 440), "track-2": wav(SECONDS, 660) };

const bundle = await build({
  stdin: {
    contents: `
      import { SpaOnlinePlayer } from "./src/lib/business-app/spa-online-player";
      import { FadingAudio } from "./src/lib/business-app/player-fade";
      export function start() {
        const el = document.querySelector("audio");
        const fader = new FadingAudio(el);
        const signs = [];
        const ctl = new SpaOnlinePlayer({
          audio: fader,
          sign: async (id) => {
            signs.push(id);
            try {
              const r = await fetch("/sign?id=" + id, { method: "POST" });
              return await r.json();
            } catch { return { ok: false, reason: "network" }; }
          },
          onChange() {},
        }, [
          { audioItemId: "track-1", title: "T1", playableUntil: null },
          { audioItemId: "track-2", title: "T2", playableUntil: null },
        ]);
        el.addEventListener("error", () => void ctl.onError());
        el.addEventListener("waiting", () => ctl.onWaiting());
        el.addEventListener("stalled", () => ctl.onWaiting());
        el.addEventListener("ended", () => void ctl.onEnded());
        el.addEventListener("timeupdate", () => ctl.onProgress(el.currentTime, el.duration));
        window.addEventListener("online", () => void ctl.onOnline());
        document.querySelector("button").addEventListener("click", () => void ctl.toggle());
        window.__p = { ctl, el, signs };
      }
    `,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  format: "iife",
  globalName: "Hall",
  write: false,
  platform: "browser",
  target: "es2020",
});
const js = bundle.outputFiles[0].text;
const html = `<!doctype html><meta charset="utf-8"><title>hall</title><audio preload="auto"></audio>
<button type="button">Включить музыку</button><script src="/bundle.js"></script><script>Hall.start(); if (location.search === "?auto") window.__p.ctl.toggle();</script>`;

let signCount = 0;
let dropAudio = false;
let sentBytes = 0;
const T0 = Date.now();
const live = new Set<http.ServerResponse>();
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/") { res.setHeader("content-type", "text/html; charset=utf-8"); return res.end(html); }
  if (url.pathname === "/bundle.js") { res.setHeader("content-type", "text/javascript"); return res.end(js); }
  if (url.pathname === "/sign") {
    signCount++;
    const id = url.searchParams.get("id") ?? "";
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify(tracks[id] ? { ok: true, data: { url: `/audio/${id}.wav?sig=${signCount}` } } : { ok: false, reason: "not_found" }));
  }
  const m = /^\/audio\/(track-\d)\.wav$/.exec(url.pathname);
  if (process.env.DEBUG_NET) console.log("req", url.pathname, req.headers.range ?? "", dropAudio ? "DROP" : "");
  if (m && tracks[m[1]]) {
    if (dropAudio) { req.socket.destroy(); return; }
    const body = tracks[m[1]];
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
    res.writeHead(range ? 206 : 200, {
      "content-type": "audio/wav",
      "accept-ranges": "bytes",
      "content-length": String(end - start + 1),
      ...(range ? { "content-range": `bytes ${start}-${end}/${body.length}` } : {}),
    });
    // Throttle to ~1.1x real time after a 3 s head start, so the element never holds
    // more than a few seconds ahead and an outage really drains the buffer.
    let pos = Math.min(end + 1, start + RATE * 3);
    res.write(body.subarray(start, pos));
    live.add(res);
    const timer = setInterval(() => {
      if (dropAudio) { clearInterval(timer); live.delete(res); req.socket.destroy(); return; }
      const next = Math.min(end + 1, pos + Math.round(RATE * 0.11));
      res.write(body.subarray(pos, next));
      sentBytes += next - pos;
      pos = next;
      if (pos > end) { clearInterval(timer); live.delete(res); res.end(); }
    }, 100);
    res.on("close", () => { clearInterval(timer); live.delete(res); });
    return;
  }
  res.statusCode = 404; res.end();
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

type Snap = { status: string; id: string | null; t: number; paused: boolean; needsGesture: boolean; recovering: boolean; signs: number };
const snap = (page: import("playwright").Page) => page.evaluate((): Snap => {
  const p = (window as unknown as { __p: { ctl: { status: string; current: { audioItemId: string } | null; needsGesture: boolean; recovering: boolean }; el: HTMLAudioElement; signs: string[] } }).__p;
  return { status: p.ctl.status, id: p.ctl.current?.audioItemId ?? null, t: p.el.currentTime, paused: p.el.paused, needsGesture: p.ctl.needsGesture, recovering: p.ctl.recovering, signs: p.signs.length };
});
async function waitFor(page: import("playwright").Page, pred: (s: Snap) => boolean, ms: number, what: string): Promise<Snap> {
  const until = Date.now() + ms;
  let s = await snap(page);
  while (!pred(s)) {
    if (Date.now() > until) throw new Error(`timeout: ${what} – last ${JSON.stringify(s)}`);
    await page.waitForTimeout(250);
    s = await snap(page);
  }
  return s;
}

// Optional: point at a locally installed Chromium when the bundled one is not downloaded.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const results: string[] = [];
let failed = false;
const browser = await chromium.launch({ headless: true, executablePath, args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  // ---------------------------------------------------------------- 1. offline -> online
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(origin + "/");
    await page.evaluate(() => (window as unknown as { __p: { ctl: { toggle(): Promise<void> } } }).__p.ctl.toggle());
    await waitFor(page, (s) => s.status === "playing" && s.t > 4, 20_000, "playing past 4 s");
    const before = await snap(page);
    if (process.env.DEBUG_NET) console.log("wall", (Date.now() - T0) / 1000, "sent s", sentBytes / RATE, "before", JSON.stringify(before), await page.evaluate("(() => { const e = window.__p.el; const b = e.buffered; return b.length ? b.end(b.length - 1) : -1; })()"));
    dropAudio = true;
    await context.setOffline(true);
    for (const r of live) r.socket?.destroy();
    // The element keeps playing what it already buffered; the reconnect state must
    // follow once that runs out (stall watchdog / error), well before the wait ends.
    const ahead = await page.evaluate("(() => { const e = window.__p.el; const b = e.buffered; return b.length ? b.end(b.length - 1) - e.currentTime : 0; })()") as number;
    const down = await waitFor(page, (s) => s.recovering && s.status === "loading", Math.ceil(ahead * 1000) + 25_000, `reconnect state while offline (buffer ${ahead.toFixed(1)} s ahead)`);
    await page.waitForTimeout(3_000);
    const still = await snap(page);
    assert.equal(still.status, "loading", "offline: keeps reconnecting, no dead stop");
    dropAudio = false;
    await context.setOffline(false); // fires window "online"
    const back = await waitFor(page, (s) => s.status === "playing" && !s.paused, 15_000, "auto resume after online");
    const later = await waitFor(page, (s) => s.t > back.t + 1, 10_000, "playhead advances after resume");
    assert.equal(later.id, before.id, "same track after the outage");
    assert.ok(later.t >= before.t - 1, `resumed near the position (before ${before.t.toFixed(1)}, now ${later.t.toFixed(1)})`);
    assert.equal(later.needsGesture, false);
    results.push(`PASS offline→online: ${before.id} at ${before.t.toFixed(1)} s → reconnecting (${down.status}) → resumed ${later.id} at ${later.t.toFixed(1)} s without a click`);
    await context.close();
  } catch (error) {
    failed = true;
    results.push(`FAIL offline→online: ${(error as Error).message}`);
  } finally {
    dropAudio = false;
  }
} finally {
  await browser.close();
}

// ---------------------------------------------------------------- 2. autoplay refused -> one tap
const strict = await chromium.launch({ headless: true, executablePath, args: ["--autoplay-policy=document-user-activation-required"] });
try {
  const context = await strict.newContext();
  // Headless Chromium does not enforce the autoplay policy for media (and Playwright's
  // evaluate() carries a user gesture), so enforce the real browser contract in the page:
  // play() before a trusted click rejects with the same DOMException("NotAllowedError")
  // a café tablet's browser throws when the cabinet auto-starts after a reboot.
  await context.addInitScript(`(() => {
    const orig = HTMLMediaElement.prototype.play;
    window.__refusals = 0;
    window.__activated = false;
    document.addEventListener("click", (e) => { if (e.isTrusted) window.__activated = true; }, true);
    HTMLMediaElement.prototype.play = function () {
      if (!window.__activated) {
        window.__refusals++;
        return Promise.reject(new DOMException("play() failed because the user didn't interact with the document first.", "NotAllowedError"));
      }
      return orig.call(this);
    };
  })()`);
  const page = await context.newPage();
  await page.goto(origin + "/?auto"); // the page starts playback itself, no gesture
  const refused = await waitFor(page, (s) => s.needsGesture, 15_000, "needsGesture after autoplay refusal");
  assert.equal(refused.status, "paused");
  await page.waitForTimeout(3_000);
  const idle = await snap(page);
  assert.equal(idle.signs, refused.signs, "no retry loop while waiting for the tap");
  assert.equal(idle.recovering, false);
  assert.equal(await page.evaluate("window.__refusals"), 1, "exactly one refused play(), no retry loop");
  await page.click("button");
  const playing = await waitFor(page, (s) => s.status === "playing" && !s.paused && s.t > 0.5, 15_000, "plays after one click");
  assert.equal(playing.needsGesture, false);
  results.push(`PASS autoplay refused → needsGesture (no retries, ${idle.signs} sign) → one click → playing`);
  await context.close();
} catch (error) {
  failed = true;
  results.push(`FAIL autoplay: ${(error as Error).message}`);
} finally {
  await strict.close();
  server.closeAllConnections();
  server.close();
}

for (const line of results) console.log(line);
console.log(failed ? "business-spa-player-network-browser: FAIL" : "business-spa-player-network-browser: PASS");
process.exit(failed ? 1 : 0);
