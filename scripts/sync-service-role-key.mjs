#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SUPABASE_ENV_PATH = "/opt/supabase/docker/.env";
const APP_ENV_PATH = resolve(process.cwd(), ".env.local");
const TARGET_KEY = "SUPABASE_SERVICE_ROLE_KEY";
const SOURCE_KEY = "SERVICE_ROLE_KEY";

function parseEnv(content) {
  const env = new Map();

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env.set(key, value);
  }

  return env;
}

function upsertEnvVar(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const suffix = content.endsWith("\n") || content.length === 0 ? "" : "\n";
  return `${content}${suffix}${line}\n`;
}

function main() {
  let supabaseEnvContent;

  try {
    supabaseEnvContent = readFileSync(SUPABASE_ENV_PATH, "utf8");
  } catch {
    console.log("source: missing");
    console.log(`${TARGET_KEY}=missing`);
    process.exit(1);
  }

  const supabaseEnv = parseEnv(supabaseEnvContent);
  const serviceRoleKey = supabaseEnv.get(SOURCE_KEY)?.trim();

  if (!serviceRoleKey) {
    console.log("source: /opt/supabase/docker/.env");
    console.log(`${SOURCE_KEY}: missing`);
    console.log(`${TARGET_KEY}=missing`);
    process.exit(1);
  }

  let appEnvContent = "";

  try {
    appEnvContent = readFileSync(APP_ENV_PATH, "utf8");
  } catch {
    appEnvContent = "";
  }

  const updated = upsertEnvVar(appEnvContent, TARGET_KEY, serviceRoleKey);
  writeFileSync(APP_ENV_PATH, updated, "utf8");

  console.log("source: /opt/supabase/docker/.env");
  console.log(`${SOURCE_KEY}: found`);
  console.log(`${TARGET_KEY}=configured`);
}

main();
