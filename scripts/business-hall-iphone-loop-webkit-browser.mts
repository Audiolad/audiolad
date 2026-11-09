// t1314u (Sergey 09.11.2026): WebKit check of the iPhone loop mode of the hall player.
// Not part of CI (needs Playwright WebKit: npx playwright install webkit).
// Run: npx tsx scripts/business-hall-iphone-loop-webkit-browser.mts
//
// The REAL SpaOnlinePlayer + FadingAudio + prepareLoopAudio are bundled with esbuild and driven by
// a real <audio> in WebKit with an iPhone user agent, wired like BusinessCabinetPlayer
// (timeupdate / seeking / ended / visibilitychange). The page is switched to hidden (what a locked
// screen reports) before the first track ends. Expected: the element never fires "ended" (no
// natural end that would close the iOS audio session), and tracks 2 and 3 start by themselves
// while the page stays hidden.
// Two runs: "handoff" (the next track takes over before the end) and "wrap" (the catalog length
// disagrees, so only the loop's jump back to 0:00 can move on). Finding from this test: WebKit
// loops WITHOUT a "seeking" event, so the wrap is caught in timeupdate (onProgress), not only
// in onSeeking.
//
// Limits: Linux WebKit has no iOS audio session, so this cannot show the iOS refusal itself
// (WebKit bug 261858). It proves the switch happens without a natural end, in the real engine.
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
const SECONDS = 7;
const tracks: Record<string, Buffer> = {
  "track-1": wav(SECONDS, 440), "track-2": wav(SECONDS, 550), "track-3": wav(SECONDS, 660),
};

const bundle = await build({
  stdin: {
    contents: `
      import { SpaOnlinePlayer } from "./src/lib/business-app/spa-online-player";
      import { FadingAudio } from "./src/lib/business-app/player-fade";
      import { prepareLoopAudio } from "./src/lib/business-app/hall-loop-audio";
      import { lockedAppleScreen } from "./src/lib/business-app/hall-media-session";
      export function start(catalogSeconds) {
        const el = document.querySelector("audio");
        const loopMode = prepareLoopAudio(el, navigator, true);
        const fader = new FadingAudio(el);
        const events = [];
        const ctl = new SpaOnlinePlayer({
          audio: fader,
          sign: async (id) => {
            const r = await fetch("/sign?id=" + id, { method: "POST" });
            return await r.json();
          },
          backgroundAdvance: () => lockedAppleScreen(document, navigator),
          loopAdvance: () => loopMode && el.loop === true,
          onChange() {},
        }, ["track-1", "track-2", "track-3"].map((id, i) => ({ audioItemId: id, title: "T" + i, playableUntil: null, durationSeconds: catalogSeconds })));
        el.addEventListener("ended", () => { events.push("ended"); void ctl.onEnded(); });
        el.addEventListener("seeking", () => { events.push("seeking@" + el.currentTime.toFixed(2)); ctl.onSeeking(el.currentTime, el.duration); });
        let last = 0;
        el.addEventListener("timeupdate", () => {
          // Loop wrap seen by timeupdate (WebKit loops without a "seeking" event).
          if (ctl.current && el.currentTime < 1.5 && last > 3) events.push("wrap:" + ctl.current.audioItemId);
          last = el.currentTime;
          ctl.onProgress(el.currentTime, el.duration);
        });
        el.addEventListener("emptied", () => { last = 0; });
        el.addEventListener("playing", () => events.push("playing:" + el.src.split("/").pop()));
        document.querySelector("button").addEventListener("click", () => void ctl.toggle());
        window.__p = { ctl, el, events, loopMode };
      }
    `,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true, format: "iife", globalName: "Hall", write: false, platform: "browser", target: "es2020",
});
const js = bundle.outputFiles[0].text;
const html = `<!doctype html><meta charset="utf-8"><title>hall</title><audio preload="auto" playsinline></audio>
<button type="button">Включить музыку</button><script src="/bundle.js"></script><script>Hall.start(location.search === "?wrap" ? 600 : ${SECONDS});</script>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/") { res.setHeader("content-type", "text/html; charset=utf-8"); return res.end(html); }
  if (url.pathname === "/bundle.js") { res.setHeader("content-type", "text/javascript"); return res.end(js); }
  if (url.pathname === "/sign") {
    const id = url.searchParams.get("id") ?? "";
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ ok: true, data: { url: `/audio/${id}.wav` } }));
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

/**
 * `wrap`: the catalog length disagrees with the element (as with a VBR MP3), so the early handoff
 * is skipped on purpose and only the loop's jump back to 0:00 ("seeking") can move on.
 */
async function run(browser: Awaited<ReturnType<typeof webkit.launch>>, mode: "handoff" | "wrap") {
  const ctx = await browser.newContext({ ...devices["iPhone 15"] });
  const page = await ctx.newPage();
  await page.goto(base + (mode === "wrap" ? "/?wrap" : "/"));
  assert.equal(await page.evaluate("window.__p.loopMode"), true, "iPhone: loop mode on");
  await page.click("button");
  await page.waitForFunction("!window.__p.el.paused && window.__p.el.currentTime > 0.5", null, { timeout: 15_000 });
  // Screen locked: the page reports hidden (what iOS reports for a locked home-screen app).
  await page.evaluate(`(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  })()`);
  await page.waitForFunction("/track-3\\.wav$/.test(window.__p.el.src) && !window.__p.el.paused && window.__p.el.currentTime > 0.3",
    null, { timeout: 30_000 });
  // String form: tsx would inject its __name helper into an arrow function here.
  const state = await page.evaluate(`(() => {
    const p = window.__p;
    return { events: p.events, status: p.ctl.status, current: p.ctl.current?.audioItemId, loop: p.el.loop };
  })()`) as { events: string[]; status: string; current: string; loop: boolean };
  console.log(mode + ": " + state.events.join(" "));
  assert.equal(state.status, "playing");
  assert.equal(state.current, "track-3");
  assert.equal(state.loop, true);
  assert.ok(!state.events.includes("ended"), "no natural end: the iOS audio session is never closed");
  assert.deepEqual(state.events.filter((e) => e.startsWith("playing:")), ["playing:track-1.wav", "playing:track-2.wav", "playing:track-3.wav"]);
  const wraps = state.events.filter((e) => e.startsWith("wrap:"));
  if (mode === "wrap") assert.deepEqual(wraps, ["wrap:track-1", "wrap:track-2"], "moved on at each loop wrap");
  else assert.deepEqual(wraps, [], "handed over before the end, no wrap needed");
  await ctx.close();
}

const browser = await webkit.launch();
try {
  await run(browser, "handoff");
  await run(browser, "wrap");
} finally {
  await browser.close();
  server.close();
}
console.log("business hall iphone loop webkit: ok");
