// t1665u prod smoke harness (not committed). Real TUS to prod practice-audio, throttled, with a 20 s offline window.
(globalThis as any).__realFetch = globalThis.fetch;
import { readFileSync } from "node:fs";
import { StudioTusNetworkError, defaultStudioTusTransport, type StudioTusRequest } from "../src/lib/studio/resumable-upload";
import { setAuthorAudioResumableUploadTestOverrides, uploadAuthorProductAudioDirect } from "../src/lib/author-products/direct-audio-upload-client";
import { formatAuthorAudioUploadLabel } from "../src/lib/author-products/audio-upload-progress-label";

const s = JSON.parse(readFileSync("/workspace/t1665u/smoke/session.json", "utf8"));
const bytes = readFileSync("/workspace/t1665u/smoke/probe.mp3");
const file = new File([bytes], "probe.mp3", { type: "audio/mpeg", lastModified: 1 });
const RATE = 2_000_000 / 8; // 2 Mbit/s
const t0 = Date.now();
const sec = () => ((Date.now() - t0) / 1000).toFixed(1);
const OFF_FROM = 26_000, OFF_TO = 46_000;
const offline = () => { const t = Date.now() - t0; return t >= OFF_FROM && t < OFF_TO; };
const inner = defaultStudioTusTransport();
const transport = async (req: StudioTusRequest) => {
  if (offline()) { await new Promise((r) => setTimeout(r, 500)); throw new StudioTusNetworkError("network"); }
  if (req.method === "PATCH" && req.body) {
    const size = req.body.size;
    let sent = 0;
    // throttle: wait proportional time, reporting progress; drop if the offline window starts.
    while (sent < size) {
      await new Promise((r) => setTimeout(r, 250));
      if (offline()) { console.log(sec(), "сеть выключена посреди чанка"); throw new StudioTusNetworkError("network"); }
      sent = Math.min(size, sent + RATE / 4);
      req.onUploadProgress?.(Math.min(sent, size - 1));
    }
  }
  const res = await inner(req);
  console.log(sec(), req.method, res.status, req.method !== "POST" ? `offset=${res.header("Upload-Offset")}` : "");
  return res;
};
let lastLabel = "";
const api: string[] = [];
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url);
  if (u.startsWith("/api/")) {
    api.push(u.split("/upload/")[1] ?? u);
    const j = (st: number, p: unknown) => new Response(JSON.stringify(p), { status: st });
    if (u.endsWith("/upload/start")) return j(200, { upload_path: s.path, signedUpload: { path: s.path, token: s.token } });
    if (u.endsWith("/upload/finalize")) return j(200, { product: { audio_items: [] } });
    if (u.endsWith("/upload/abandon")) return j(200, { ok: true });
  }
  return (globalThis as any).__realFetch(url, init);
}) as typeof fetch;
setAuthorAudioResumableUploadTestOverrides({ supabaseUrl: s.base, transport, store: null, waitForOnline: async () => {} });
const result = await uploadAuthorProductAudioDirect({
  practiceId: "00000000-0000-4000-8000-000000001665", audioId: "00000000-0000-4000-8000-000000000001", file,
  onProgress: (p) => { const l = formatAuthorAudioUploadLabel(p); if (l !== lastLabel) { lastLabel = l; if (p.phase !== "uploading" || p.percent % 10 === 0) console.log(sec(), "UI:", l); } },
});
console.log(sec(), "result ok=", result.ok, result.ok ? "" : (result as any).error, "api:", api.join(","));
