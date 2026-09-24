#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const overridePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../deploy/supabase/docker-compose.override.yml",
);

const EXPECTED_SERVICES = [
  "studio",
  "kong",
  "auth",
  "rest",
  "realtime",
  "storage",
  "imgproxy",
  "meta",
  "functions",
  "db",
  "supavisor",
  "templates-server",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseOverride(text) {
  const services = {};
  let current = null;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\s+#.*$/, "");
    if (!line.trim() || line.trim().startsWith("#") || line.trim() === "services:") {
      continue;
    }
    const service = line.match(/^  ([a-z0-9-]+):\s*$/);
    if (service) {
      current = service[1];
      services[current] = { keys: [], logging: null };
      continue;
    }
    if (!current) {
      throw new Error(`Unexpected line outside service: ${rawLine}`);
    }
    const topKey = line.match(/^    ([a-z0-9_-]+):/);
    if (topKey) {
      services[current].keys.push(topKey[1]);
    }
    if (line.includes("max-size:")) {
      services[current].logging = {
        ...(services[current].logging ?? {}),
        maxSize: line.match(/"([^"]+)"/)?.[1] ?? "",
      };
    }
    if (line.includes("max-file:")) {
      services[current].logging = {
        ...(services[current].logging ?? {}),
        maxFile: line.match(/"([^"]+)"/)?.[1] ?? "",
      };
    }
    if (line.includes("driver:")) {
      services[current].logging = {
        ...(services[current].logging ?? {}),
        driver: line.split(":").slice(1).join(":").trim(),
      };
    }
  }
  return services;
}

const text = readFileSync(overridePath, "utf8");
assert(!/^\s+volumes:/m.test(text), "override must not declare volumes");
assert(!/^\s+ports:/m.test(text), "override must not declare ports");
assert(!/environment:/m.test(text), "override must not declare environment");
assert(!/restart:/m.test(text), "override must not declare restart");
assert(!/depends_on:/m.test(text), "override must not declare depends_on");

const services = parseOverride(text);
assert(
  Object.keys(services).join(",") === EXPECTED_SERVICES.join(","),
  `service keys ${Object.keys(services).join(",")}`,
);

for (const name of EXPECTED_SERVICES) {
  const service = services[name];
  assert(service.keys.join(",") === "logging", `${name} keys ${service.keys}`);
  assert(service.logging?.driver === "json-file", `${name} driver`);
  assert(service.logging?.maxSize === "20m", `${name} max-size`);
  assert(service.logging?.maxFile === "5", `${name} max-file`);
}

const fixture = `
services:
${EXPECTED_SERVICES.map(
  (name) => `  ${name}:
    image: example/${name}:test
    restart: unless-stopped
    environment:
      EXAMPLE: keep
    ports:
      - "127.0.0.1:1:1"
    volumes:
      - example-data:/data
${name === "db" ? "" : `    depends_on:\n      - db\n`}
`,
).join("")}
volumes:
  example-data:
`;

const merged = spawnSync(
  "docker",
  ["compose", "-f", "-", "-f", overridePath, "config", "--format", "json"],
  { input: fixture, encoding: "utf8" },
);

if (merged.error || merged.status !== 0) {
  console.error("docker compose config failed");
  if (merged.error) {
    console.error(merged.error.message);
  }
  if (merged.stderr) {
    console.error(merged.stderr);
  }
  if (merged.stdout) {
    console.error(merged.stdout);
  }
  process.exit(merged.status && merged.status !== 0 ? merged.status : 1);
}

const config = JSON.parse(merged.stdout);
for (const name of EXPECTED_SERVICES) {
  const service = config.services[name];
  assert(service.image === `example/${name}:test`, `${name} image changed`);
  assert(service.restart === "unless-stopped", `${name} restart changed`);
  assert(service.environment?.EXAMPLE === "keep", `${name} env changed`);
  assert(JSON.stringify(service.ports ?? "").includes("127.0.0.1"), `${name} ports changed`);
  assert(service.logging?.driver === "json-file", `${name} logging driver`);
  assert(service.logging?.options?.["max-size"] === "20m", `${name} max-size`);
  assert(service.logging?.options?.["max-file"] === "5", `${name} max-file`);
}

console.log("supabase-log-rotation-override-unit: ok");
