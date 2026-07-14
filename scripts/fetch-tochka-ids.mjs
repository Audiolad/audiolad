#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env.local");
const API_BASE_URL = "https://enter.tochka.com/uapi";

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

function upsertEnvVar(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const suffix = content.endsWith("\n") || content.length === 0 ? "" : "\n";
  return `${content}${suffix}${line}\n`;
}

async function fetchJson(path, jwtToken) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${jwtToken}`,
    },
  });

  const payload = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

function pickCustomer(customers) {
  if (!Array.isArray(customers) || customers.length === 0) {
    return null;
  }

  const audioladMatch = customers.find((customer) => {
    const haystack = `${customer.fullName ?? ""} ${customer.shortName ?? ""} ${customer.url ?? ""}`.toLowerCase();
    return haystack.includes("аудиолад") || haystack.includes("audiolad");
  });

  if (audioladMatch) {
    return audioladMatch;
  }

  const businessCustomers = customers.filter(
    (customer) => customer.customerType === "Business",
  );

  return businessCustomers[0] ?? customers[0] ?? null;
}

function pickRetailer(retailers) {
  if (!Array.isArray(retailers) || retailers.length === 0) {
    return null;
  }

  const audioladMatch = retailers.find((retailer) => {
    const url = typeof retailer.url === "string" ? retailer.url.toLowerCase() : "";
    return url.includes("audiolad.ru");
  });

  if (audioladMatch?.merchantId) {
    return audioladMatch;
  }

  const activeRegistered = retailers.find(
    (retailer) =>
      retailer.isActive === true &&
      retailer.status === "REG" &&
      typeof retailer.merchantId === "string" &&
      retailer.merchantId.length > 0,
  );

  if (activeRegistered) {
    return activeRegistered;
  }

  return retailers.find((retailer) => typeof retailer.merchantId === "string") ?? null;
}

async function main() {
  const env = loadEnvFile(ENV_PATH);
  const jwtToken = env.TOCHKA_JWT_TOKEN?.trim();

  if (!jwtToken) {
    console.error("error: TOCHKA_JWT_TOKEN is missing in .env.local");
    process.exit(1);
  }

  const customersResponse = await fetchJson(
    "/open-banking/v1.0/customers",
    jwtToken,
  );

  if (!customersResponse.ok || !customersResponse.payload) {
    console.error(
      `error: Get Customers List failed with HTTP ${customersResponse.status}`,
    );
    process.exit(1);
  }

  const customers = customersResponse.payload?.Data?.Customer ?? [];
  const customer = pickCustomer(customers);

  if (!customer?.customerCode) {
    console.error("error: customerCode not found in customers response");
    process.exit(1);
  }

  const retailersResponse = await fetchJson(
    `/acquiring/v1.0/retailers?customerCode=${encodeURIComponent(customer.customerCode)}`,
    jwtToken,
  );

  if (!retailersResponse.ok || !retailersResponse.payload) {
    console.error(
      `error: Get Retailers failed with HTTP ${retailersResponse.status}`,
    );
    process.exit(1);
  }

  const retailers = retailersResponse.payload?.Data?.Retailer ?? [];
  const retailer = pickRetailer(retailers);

  let envContent = readFileSync(ENV_PATH, "utf8");
  envContent = upsertEnvVar(envContent, "TOCHKA_CUSTOMER_CODE", customer.customerCode);

  if (retailer?.merchantId) {
    envContent = upsertEnvVar(envContent, "TOCHKA_MERCHANT_ID", retailer.merchantId);
  }

  writeFileSync(ENV_PATH, envContent, "utf8");

  console.log("status: success");
  console.log(`TOCHKA_CUSTOMER_CODE: configured (${customer.customerCode})`);

  if (customer.fullName) {
    console.log(`customer_name: ${customer.fullName}`);
  }

  if (retailer?.merchantId) {
    console.log(`TOCHKA_MERCHANT_ID: configured (${retailer.merchantId})`);
    console.log(`retailer_status: ${retailer.status ?? "unknown"}`);
    console.log(`retailer_active: ${retailer.isActive === true}`);
    if (retailer.url) {
      console.log(`retailer_url: ${retailer.url}`);
    }
    if (retailer.name) {
      console.log(`retailer_name: ${retailer.name}`);
    }
  } else {
    console.log("TOCHKA_MERCHANT_ID: not returned by API yet");
    console.log(
      "note: merchantId appears after retailer registration reaches TERMINAL_CREATED or REG",
    );
  }

  console.log(`customers_total: ${customers.length}`);
  console.log(`retailers_total: ${retailers.length}`);
}

main().catch((error) => {
  console.error("error: unexpected failure");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
