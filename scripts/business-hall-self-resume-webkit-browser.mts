// t1390u (Sergey 12.11.2026): WebKit check of the in-page recovery of the hall player.
// Not part of CI (needs Playwright WebKit). Run: npx tsx scripts/business-hall-self-resume-webkit-browser.mts
//
// The REAL SpaOnlinePlayer + FadingAudio are bundled with esbuild and driven by a real <audio> in
// WebKit with an iPhone user agent, wired like BusinessCabinetPlayer for a hall device
// (element() dep, "pause" → onElementPause, a 2 s watchdog tick).
//  1. Something other than the user/owner pauses the element (what iOS does to a page's audio):
//     the same element is started again by itself, the status never leaves "playing", no gesture asked.
//  2. A deliberate pause (ctl.toggle, i.e. the owner's/user's command) is respected: it stays paused.
//  3. The position freezes while the element claims to be playing (play() made a no-op and the clock
//     frozen): the watchdog sees it after ~10 s and calls play() again / reconnects.
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { build } from "esbuild";
import { devices, webkit } from "playwright";

const RATE = 8_000;
function wav(seconds: number, hz: number): Buffer {
  const n = RATE * seconds;
  const b = Buffer.alloc(44 + n);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write("data", 36); b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(20 * Math.sin((2 * Math.PI * hz * i) / RATE));
  return b;
}
const SECONDS = 40;
const tracks: Record<string, Buffer> = { "track-1": wav(SECONDS, 440), "track-2": wav(SECONDS, 550) };

const bundle = await build({
  stdin: {
    contents: `
      import { SpaOnlinePlayer } from "./src/lib/business-app/spa-online-player";
      import { FadingAudio } from "./src/lib/business-app/player-fade";
      export function start() {
        const el = document.querySelector("audio");
        const fader = new FadingAudio(el);
        const events = [];
        const ctl = new SpaOnlinePlayer({
          audio: fader,
          sign: async (id) => { const r = await fetch("/sign?id=" + id, { method: "POST" }); return await r.json(); },
          element: () => el,
          onEvent: (kind) => events.push(kind),
          onChange() {},
        }, ["track-1", "track-2"].map((id, i) => ({ audioItemId: id, title: "T" + i, playableUntil: null, durationSeconds: ${SECONDS} })));
        el.addEventListener("ended", () => void ctl.onEnded());
        el.addEventListener("timeupdate", () => ctl.onProgress(el.currentTime, el.duration));
        el.addEventListener("pause", () => ctl.onElementPause());
        setInterval(() => ctl.watchdog(), 2000);
        document.querySelector("button").addEventListener("click", () => void ctl.toggle());
        window.__p = { ctl, el, events };
      }
    `,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true, format: "iife", globalName: "Hall", write: false, platform: "browser", target: "es2020",
});
const js = bundle.outputFiles[0].text;
const html = `<!doctype html><meta charset="utf-8"><title>hall</title><audio preload="auto" playsinline></audio>
<button type="button">Включить музыку</button><script src="/bundle.js"></script><script>Hall.start();</script>`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/") { res.setHeader("content-type", "text/html; charset=utf-8"); return res.end(html); }
  if (url.pathname === "/bundle.js") { res.setHeader("content-type", "text/javascript"); return res.end(js); }
  if (url.pathname === "/sign") {
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ ok: true, data: { url: `/audio/${url.searchParams.get("id")}.wav` } }));
  }
  const m = /^\/audio\/(track-\d)\.wav$/.exec(url.pathname);
  if (m && tracks[m[1]]) {
    const body = tracks[m[1]];
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
    res.setHeader("content-type", "audio/wav");
    res.setHeader("accept-ranges", "bytes");
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Number(range[2]) : body.length - 1;
      res.statusCode = 206;
      res.setHeader("content-range", `bytes ${start}-${end}/${body.length}`);
      return res.end(body.subarray(start, end + 1));
    }
    return res.end(body);
  }
  res.statusCode = 404; res.end();
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const browser = await webkit.launch();
try {
  const ctx = await browser.newContext({ ...devices["iPhone 15"] });
  const page = await ctx.newPage();
  await page.goto(base + "/");
  await page.click("button");
  await page.waitForFunction("!window.__p.el.paused && window.__p.el.currentTime > 1", null, { timeout: 15_000 });

  // 1. Pause from outside (not via the controller).
  await page.evaluate("window.__p.el.pause()");
  const t0 = Date.now();
  await page.waitForFunction("!window.__p.el.paused && window.__p.events.includes('self_resume_ok')", null, { timeout: 10_000 });
  const s1 = await page.evaluate("({ status: window.__p.ctl.status, needs: window.__p.ctl.needsGesture, ev: window.__p.events.slice() })") as { status: string; needs: boolean; ev: string[] };
  console.log(`1. outside pause → resumed by itself in ${Date.now() - t0} ms; events ${s1.ev.join(" ")}`);
  assert.equal(s1.status, "playing");
  assert.ok(!s1.needs, "no press-to-continue");

  // 2. Deliberate pause through the controller is respected.
  await page.click("button");
  await page.waitForTimeout(4_000);
  const s2 = await page.evaluate("({ status: window.__p.ctl.status, paused: window.__p.el.paused })") as { status: string; paused: boolean };
  console.log(`2. deliberate pause → status ${s2.status}, element paused ${s2.paused}`);
  assert.equal(s2.status, "paused");
  assert.equal(s2.paused, true);

  // 3. Frozen position while "playing": watchdog.
  await page.click("button");
  await page.waitForFunction("!window.__p.el.paused && window.__p.ctl.status === 'playing'", null, { timeout: 10_000 });
  await page.evaluate(`(() => {
    const el = window.__p.el;
    const frozen = el.currentTime;
    Object.defineProperty(el, "currentTime", { configurable: true, get: () => frozen, set: () => {} });
    el.muted = true;
  })()`);
  await page.waitForFunction("window.__p.events.includes('watchdog_stuck')", null, { timeout: 20_000 });
  const s3 = await page.evaluate("({ status: window.__p.ctl.status, needs: window.__p.ctl.needsGesture, ev: window.__p.events.slice() })") as { status: string; needs: boolean; ev: string[] };
  console.log(`3. frozen position → ${s3.ev.join(" ")}; status ${s3.status}`);
  assert.ok(!s3.needs, "no press-to-continue");
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
console.log("business-hall-self-resume-webkit-browser: OK");
