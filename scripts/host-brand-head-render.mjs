#!/usr/bin/env node
/**
 * Render-level check (needs `next build` first): starts `next start`, fetches `/`
 * with Host audiolad.ru and business.audiolad.ru and compares the icon/manifest
 * head tags. Classic must equal main (fixture captured from main 7561582b /
 * production); business must carry only /business/brand/* icons.
 * Usage: node scripts/host-brand-head-render.mjs  (or HEAD_RENDER_BASE_URL=http://host:port)
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = readFileSync(
  join(root, "scripts/fixtures/classic-head-icons.main-7561582b.txt"),
  "utf8",
).trim();

let server;
let base = process.env.HEAD_RENDER_BASE_URL;
if (!base) {
  const port = 40000 + Math.floor(Math.random() * 20000);
  base = `http://127.0.0.1:${port}`;
  server = spawn("npx", ["next", "start", "-p", String(port)], {
    cwd: root,
    stdio: "ignore",
    detached: true,
  });
}

// fetch() overrides the Host header, so use node:http.
function get(path, host) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${base}${path}`, { headers: { host } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
  });
}

function headTags(html) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? "";
  return (head.match(/<(?:link|meta)[^>]*>/g) ?? [])
    .filter((t) => /icon|manifest|apple|application/i.test(t))
    .join("\n");
}

async function fetchHead(host) {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await get("/", host);
      assert.equal(res.status, 200, `${host} / status ${res.status}`);
      return headTags(res.body);
    } catch (error) {
      if (i === 59 || error instanceof assert.AssertionError) throw error;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("unreachable");
}

try {
  const classic = await fetchHead("audiolad.ru");
  assert.equal(classic, fixture, "audiolad.ru head icons differ from main");

  const business = await fetchHead("business.audiolad.ru");
  assert.match(business, /rel="manifest" href="\/business\/brand\/manifest\.webmanifest\?v=[^"]+"/);
  assert.match(business, /rel="apple-touch-icon" href="\/business\/brand\/apple-touch-icon\.png\?v=[^"]+"/);
  assert.match(business, /content="АудиоЛад Бизнес"/);
  for (const href of business.matchAll(/href="([^"]+)"/g)) {
    assert.ok(href[1].startsWith("/business/brand/"), `business head leaks ${href[1]}`);
  }
  assert.doesNotMatch(business, /href="\/(favicon\.ico|icon\.svg|apple-icon\.svg|manifest\.webmanifest|apple-touch-icon\.png)/);

  for (const p of ["/business/brand/manifest.webmanifest", "/business/brand/favicon.ico"]) {
    const res = await get(p, "business.audiolad.ru");
    assert.equal(res.status, 200, `${p} on business: ${res.status}`);
  }
  console.log("host-brand-head-render: ok");
} finally {
  if (server) process.kill(-server.pid, "SIGTERM");
}
