#!/usr/bin/env node
/**
 * Real HTTP requests against a production build (`next build` must already have run).
 * Starts `next start` on 127.0.0.1 and sends the headers nginx sends
 * (deploy/nginx/coffee.audiolad.ru.conf.example: Host = X-Forwarded-Host = $host).
 * Regression for the 02.11.2026 incident: coffee pages rewritten to /business-app/* returned 404.
 *
 * Env: SMOKE_PORT (default 3999), SMOKE_START_TIMEOUT_MS (default 90000).
 * Expects NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED=1 at build and run time.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COFFEE = "coffee.audiolad.ru";
const BUSINESS = "business.audiolad.ru";
const APEX = "audiolad.ru";

/** [host, path, expected statuses]. */
const EXPECTATIONS = [
  [COFFEE, "/", [200]],
  [COFFEE, "/help", [200]],
  [COFFEE, "/documents", [200]],
  [COFFEE, "/cabinet", [200]],
  [COFFEE, "/guest/coffee", [200]],
  [COFFEE, "/auth/sign-in", [200]],
  [COFFEE, "/auth/sign-up", [200]],
  [BUSINESS, "/", [200]],
  [BUSINESS, "/cabinet", [200]],
  [BUSINESS, "/guest/coffee", [200]],
  [BUSINESS, "/documents", [200]],
  [APEX, "/", [200]],
  [APEX, "/auth/sign-in", [200]],
  [APEX, "/auth/sign-up", [200]],
];

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.SMOKE_PORT || 3999);
const startTimeoutMs = Number(process.env.SMOKE_START_TIMEOUT_MS || 90000);
const nextBin = join(repoRoot, "node_modules", ".bin", "next");

if (!existsSync(join(repoRoot, ".next", "BUILD_ID"))) {
  console.error("coffee-host-production-smoke: .next/BUILD_ID missing – run `next build` first");
  process.exit(1);
}
if (process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED !== "1") {
  console.error("coffee-host-production-smoke: NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED=1 is required");
  process.exit(1);
}

function nginxHeaders(host) {
  return {
    Host: host,
    "X-Forwarded-Host": host,
    "X-Forwarded-Proto": "https",
    "X-Forwarded-For": "203.0.113.10",
    "X-Real-IP": "203.0.113.10",
    "User-Agent": "audiolad-coffee-host-production-smoke",
  };
}

// node:http, not fetch: undici silently drops a custom Host header.
function request(path, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "GET", headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: String(res.headers.location ?? ""),
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.setTimeout(60000, () => req.destroy(new Error(`timeout ${path}`)));
    req.on("error", reject);
    req.end();
  });
}

async function waitForServer(server) {
  const deadline = Date.now() + startTimeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next start exited with ${server.exitCode}`);
    try {
      await request("/api/health/build", { Host: "audiolad.ru" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`next start not ready after ${startTimeoutMs} ms`);
}

const server = spawn(nextBin, ["start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: repoRoot,
  env: { ...process.env, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d; });
server.stderr.on("data", (d) => { serverLog += d; });

const failures = [];
const rows = [];
try {
  await waitForServer(server);

  for (const [host, path, expected] of EXPECTATIONS) {
    const { status, location, body } = await request(path, nginxHeaders(host));
    const ok = expected.includes(status);
    rows.push([ok ? "ok" : "FAIL", host, path, status, location]);
    if (!ok) failures.push(`${host}${path}: ${status} (expected ${expected.join("/")})`);

    if (host === COFFEE && path === "/" && ok) {
      if (body.includes(`https://${APEX}/auth/sign-up`)) {
        failures.push(`${host}/: sign-up link points to https://${APEX}/auth/sign-up`);
      }
      if (!/href="(?:\/auth\/sign-up|https:\/\/coffee\.audiolad\.ru\/auth\/sign-up)[^"]*"/.test(body)) {
        failures.push(`${host}/: no coffee sign-up link found`);
      }
    }
    if (host === COFFEE && path.startsWith("/auth/") && location) {
      const target = new URL(location, `https://${COFFEE}`);
      if (target.hostname !== COFFEE) failures.push(`${host}${path}: redirects off-host to ${target.hostname}`);
    }
  }

  // The incident itself: Next.js re-requests a rewrite with Host: localhost:<PORT>.
  const internal = await request("/business-app/documents", {
    Host: `localhost:${port}`,
    "X-Forwarded-Host": COFFEE,
    "X-Forwarded-Proto": "https",
  });
  const internalOk = internal.status === 200;
  rows.push([internalOk ? "ok" : "FAIL", `localhost:${port} + XFH ${COFFEE}`, "/business-app/documents", internal.status, internal.location]);
  if (!internalOk) failures.push(`internal rewrite request /business-app/documents: ${internal.status}`);
} catch (error) {
  failures.push(String(error?.message ?? error));
} finally {
  server.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 1000));
  if (server.exitCode === null) server.kill("SIGKILL");
}

for (const row of rows) console.log(row.join("\t"));
if (failures.length) {
  console.error("coffee-host-production-smoke: FAIL");
  for (const f of failures) console.error(` - ${f}`);
  console.error(serverLog.split("\n").slice(-40).join("\n"));
  process.exit(1);
}
console.log(`coffee-host-production-smoke: ok (${rows.length} requests)`);
