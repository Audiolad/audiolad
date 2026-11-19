import "server-only";

import { parseRegistryRows, type BusinessRegistryLookup } from "./egrul";

/**
 * Запрос к публичному поиску ФНС по ИНН (egrul.nalog.ru): POST с ИНН → токен → результат.
 * Только чтение, без ключей. Ответ ФНС не попадает к клиенту как есть – только разобранные поля.
 */
const REGISTRY = "https://egrul.nalog.ru";
const STEP_TIMEOUT_MS = 8000;

async function withTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function lookupBusinessRegistry(inn: string): Promise<BusinessRegistryLookup> {
  try {
    const start = await withTimeout(`${REGISTRY}/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Accept: "application/json" },
      body: new URLSearchParams({ query: inn, region: "", page: "" }).toString(),
    });
    if (!start.ok) return { ok: false, error: "registry_unavailable" };
    const token = (await start.json().catch(() => null)) as { t?: unknown; captchaRequired?: unknown } | null;
    if (!token || typeof token.t !== "string" || token.captchaRequired === true) return { ok: false, error: "registry_unavailable" };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await sleep(attempt === 0 ? 400 : 800);
      const res = await withTimeout(`${REGISTRY}/search-result/${encodeURIComponent(token.t)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const payload = (await res.json().catch(() => null)) as { status?: unknown; rows?: unknown } | null;
      if (!payload || payload.status === "wait") continue;
      return parseRegistryRows(inn, payload);
    }
    return { ok: false, error: "registry_unavailable" };
  } catch {
    return { ok: false, error: "registry_unavailable" };
  }
}
