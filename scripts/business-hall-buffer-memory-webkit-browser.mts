// t1390u (Sergey 12.11.2026): memory check of the hall buffer in real WebKit.
// Not part of CI (needs Playwright WebKit). Run: npx tsx scripts/business-hall-buffer-memory-webkit-browser.mts
//
// The REAL HallOfflineBuffer + Cache Storage store are bundled with esbuild and run in WebKit with
// an iPhone user agent. A local server hands out 8 MB "tracks". Two runs in fresh browsers:
//   before – the pre-t1390u settings: 10 tracks, fetch → Blob → Cache Storage, 1 warm copy;
//   after  – the iPhone settings: 3 tracks, response body streamed into Cache Storage, lazy copies.
// For each run 30 «track changes» are simulated (pin + plan shift + refill) and the resident
// memory (RSS) of the WebKit web content process is sampled; the page also reports what the buffer
// holds in memory. Linux WebKit is not iOS, but the web content process is the same kind of process
// iOS kills when the page uses too much memory.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { build } from "esbuild";
import { chromium, devices, webkit } from "playwright";

const TRACK = Buffer.alloc(8 * 1024 * 1024, 7);

const bundle = await build({
  stdin: {
    contents: `
      import { HallOfflineBuffer, hallBufferPlan } from "./src/lib/business-app/hall-offline-buffer";
      import { createHallBufferStore } from "./src/lib/business-app/hall-offline-buffer-store";
      export async function run(mode) {
        const store = await createHallBufferStore();
        if (!store) return { error: "no_store" };
        await store.clear();
        const ios = mode === "after";
        const ids = Array.from({ length: 60 }, (_, i) => "t" + i);
        let fetchedBlobs = 0;
        const buffer = new HallOfflineBuffer({
          store,
          sign: async (id) => ({ ok: true, data: { url: "/track/" + id + ".mp3" } }),
          fetchBlob: async (url, signal) => { fetchedBlobs++; const r = await fetch(url, { signal }); return await r.blob(); },
          fetchResponse: (url, signal) => fetch(url, { signal }),
          createUrl: (b) => URL.createObjectURL(b),
          revokeUrl: (u) => URL.revokeObjectURL(u),
          window: () => ({ until: null }),
          isOnline: () => true,
          ...(ios ? { maxTracks: 3, streamToStore: true, lazyCopies: true }
            : mode === "android" ? { streamToStore: true } : mode === "android-before" ? {} : { warmTracks: 1 }),
        });
        const states = [];
        for (let i = 0; i < 30; i++) {
          const plan = hallBufferPlan(ids.map((audioItemId) => ({ audioItemId })), i, (c, l) => (c + 1) % l);
          buffer.setPlan(plan, ids[i]);
          const local = ios ? null : buffer.localSource(ids[i], 180);
          buffer.pin(ids[i]);
          for (let k = 0; k < 12; k++) { await buffer.refill(true); await new Promise((r) => setTimeout(r, 30)); }
          states.push({ i, local: !!local, ...buffer.stats() });
        }
        const keys = await store.keys();
        return { states, stored: keys.length, fetchedBlobs };
      }
    `,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true, format: "iife", globalName: "Mem", write: false, platform: "browser", target: "es2020",
});
const js = bundle.outputFiles[0].text;
const html = `<!doctype html><meta charset="utf-8"><title>mem</title><script src="/bundle.js"></script>`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/") { res.setHeader("content-type", "text/html; charset=utf-8"); return res.end(html); }
  if (url.pathname === "/bundle.js") { res.setHeader("content-type", "text/javascript"); return res.end(js); }
  if (url.pathname.startsWith("/track/")) {
    res.setHeader("content-type", "audio/mpeg");
    res.setHeader("content-length", String(TRACK.length));
    return res.end(TRACK);
  }
  res.statusCode = 404; res.end();
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

function rssMb(re: RegExp): number {
  try {
    const out = execFileSync("ps", ["-eo", "rss,args"], { encoding: "utf8" });
    let sum = 0;
    for (const line of out.split("\n")) if (re.test(line)) sum += Number(line.trim().split(/\s+/)[0]) || 0;
    return Math.round(sum / 1024);
  } catch {
    return -1;
  }
}

async function measure(mode: "before" | "after" | "android-before" | "android") {
  const android = mode.startsWith("android");
  const browser = android ? await chromium.launch() : await webkit.launch();
  const ctx = await browser.newContext({ ...(android ? devices["Pixel 7"] : devices["iPhone 15"]) });
  const page = await ctx.newPage();
  await page.goto(base + "/");
  const WEB = android ? /--type=renderer/ : /(WPE|WebKit)WebProcess/;
  const NET = android ? /--utility-sub-type=network/ : /(WPE|WebKit)NetworkProce/;
  const idle = rssMb(WEB);
  let peak = idle;
  let netPeak = rssMb(NET);
  const sampler = setInterval(() => { peak = Math.max(peak, rssMb(WEB)); netPeak = Math.max(netPeak, rssMb(NET)); }, 150);
  const result = await page.evaluate((m) => (window as unknown as { Mem: { run(m: string): Promise<unknown> } }).Mem.run(m), mode) as {
    states: { i: number; tracks: number; bytes: number; inMemory: number }[]; stored: number; fetchedBlobs: number; error?: string;
  };
  clearInterval(sampler);
  const end = rssMb(WEB);
  await browser.close();
  return { mode, idle, peak, end, netPeak, result };
}

const before = await measure("before");
const after = await measure("after");
// t1390u (Samsung hall stop): Android Chrome – 10 tracks + 2 warm copies, Blob download vs stream.
const androidBefore = await measure("android-before");
const androidAfter = await measure("android");
server.close();
for (const r of [before, after, androidBefore, androidAfter]) {
  const last = r.result.states?.[r.result.states.length - 1];
  console.log(`${r.mode}: web process RSS idle ${r.idle} MB, peak ${r.peak} MB, end ${r.end} MB; network process peak ${r.netPeak} MB; ` +
    `stored ${r.result.stored} tracks, last stats ${JSON.stringify(last)}, blob downloads ${r.result.fetchedBlobs}`);
}
assert.ok(before.peak > 0 && after.peak > 0, "RSS sampled");
assert.ok(after.peak + after.netPeak < before.peak + before.netPeak, "the iPhone settings use less WebKit memory");
assert.equal(after.result.error, undefined, "Cache Storage works in WebKit");
assert.equal(after.result.fetchedBlobs, 0, "iPhone path never downloads a Blob");
assert.ok(after.result.stored <= 4, "3 tracks (+ the sounding one) on the iPhone");
assert.ok(after.result.states.every((s) => s.inMemory === 0), "no copy in page memory");
assert.ok(after.result.states[after.result.states.length - 1].tracks >= 3, "the buffer still fills (streamed put works in WebKit)");
// Finding (12.11.2026): in Chromium the streamed put raises the renderer peak (≈ 850 vs 460 MB),
// so the player keeps the Blob download on Android. Printed above for the record, not asserted.
assert.equal(androidBefore.result.error, undefined);
console.log("business-hall-buffer-memory-webkit-browser: OK");
