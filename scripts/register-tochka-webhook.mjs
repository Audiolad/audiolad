#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env.local");
const API_BASE_URL = "https://enter.tochka.com/uapi";
const WEBHOOK_URL = "https://audiolad.ru/api/webhooks/tochka";
const WEBHOOK_EVENT = "acquiringInternetPayment";

function loadEnvFile(path) {
  const env = {};

  try {
    const content = readFileSync(path, "utf8");

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

      env[key] = value;
    }
  } catch {
    return env;
  }

  return env;
}

async function fetchJson(path, jwtToken, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwtToken}`,
      ...(options.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

function normalizeWebhookList(payload) {
  const data = payload?.Data;

  if (!data || typeof data !== "object") {
    return [];
  }

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.webhooksList)) {
    return [data];
  }

  return [];
}

function hasTargetSubscription(webhooks) {
  return webhooks.some((entry) => {
    const url = typeof entry.url === "string" ? entry.url : "";
    const events = Array.isArray(entry.webhooksList) ? entry.webhooksList : [];
    return url === WEBHOOK_URL && events.includes(WEBHOOK_EVENT);
  });
}

function countTargetSubscriptions(webhooks) {
  return webhooks.filter((entry) => {
    const url = typeof entry.url === "string" ? entry.url : "";
    const events = Array.isArray(entry.webhooksList) ? entry.webhooksList : [];
    return url === WEBHOOK_URL && events.includes(WEBHOOK_EVENT);
  }).length;
}

async function main() {
  const env = loadEnvFile(ENV_PATH);
  const jwtToken = env.TOCHKA_JWT_TOKEN?.trim();
  const clientId = env.TOCHKA_CLIENT_ID?.trim();

  if (!jwtToken || !clientId) {
    console.error("error: TOCHKA_JWT_TOKEN or TOCHKA_CLIENT_ID missing");
    process.exit(1);
  }

  const listBefore = await fetchJson(
    `/webhook/v1.0/${encodeURIComponent(clientId)}`,
    jwtToken,
    { method: "GET" },
  );

  if (!listBefore.ok && listBefore.status !== 404) {
    console.error(`error: Get Webhooks failed with HTTP ${listBefore.status}`);
    process.exit(1);
  }

  const webhooksBefore =
    listBefore.status === 404 ? [] : normalizeWebhookList(listBefore.payload);
  const duplicatesBefore = countTargetSubscriptions(webhooksBefore);

  if (hasTargetSubscription(webhooksBefore)) {
    console.log("status: already_registered");
    console.log(`webhook_url: ${WEBHOOK_URL}`);
    console.log(`webhook_event: ${WEBHOOK_EVENT}`);
    console.log(`duplicates: ${duplicatesBefore}`);
    return;
  }

  const createResponse = await fetchJson(
    `/webhook/v1.0/${encodeURIComponent(clientId)}`,
    jwtToken,
    {
      method: "PUT",
      body: JSON.stringify({
        url: WEBHOOK_URL,
        webhooksList: [WEBHOOK_EVENT],
      }),
    },
  );

  if (!createResponse.ok) {
    console.error(
      `error: Create Webhook failed with HTTP ${createResponse.status}`,
    );
    process.exit(1);
  }

  const listAfter = await fetchJson(
    `/webhook/v1.0/${encodeURIComponent(clientId)}`,
    jwtToken,
    { method: "GET" },
  );

  if (!listAfter.ok && listAfter.status !== 404) {
    console.error(
      `error: Get Webhooks after create failed with HTTP ${listAfter.status}`,
    );
    process.exit(1);
  }

  const webhooksAfter =
    listAfter.status === 404 ? [] : normalizeWebhookList(listAfter.payload);
  const duplicatesAfter = countTargetSubscriptions(webhooksAfter);

  if (!hasTargetSubscription(webhooksAfter)) {
    console.error("error: webhook not visible after registration");
    process.exit(1);
  }

  console.log("status: registered");
  console.log(`webhook_url: ${WEBHOOK_URL}`);
  console.log(`webhook_event: ${WEBHOOK_EVENT}`);
  console.log(`duplicates: ${duplicatesAfter}`);
}

main().catch(() => {
  console.error("error: unexpected failure");
  process.exit(1);
});
