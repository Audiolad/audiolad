import "server-only";

import { parseRegistryRows, type BusinessRegistryLookup } from "./egrul";

/**
 * Запрос к публичному поиску ФНС по ИНН (egrul.nalog.ru): POST с ИНН → токен → результат.
 * Только чтение, без ключей. Ответ ФНС не попадает к клиенту как есть – только разобранные поля.
 */
const REGISTRY = "https://egrul.nalog.ru";
const STEP_TIMEOUT_MS = 8000;
/** Весь поиск, включая ожидание результата, – не дольше 20 секунд. */
const TOTAL_TIMEOUT_MS = 20000;

/** Запрос и чтение JSON под одним таймером: зависшее тело ответа тоже прерывается. */
async function fetchJson(input: string, init: RequestInit, deadline: number): Promise<{ ok: boolean; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, Math.min(STEP_TIMEOUT_MS, deadline - Date.now())));
  try {
    const res = await fetch(input, { ...init, signal: controller.signal, cache: "no-store", redirect: "error" });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return { ok: false, json: null };
    }
    return { ok: true, json: await res.json().catch(() => null) };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function lookupBusinessRegistry(inn: string): Promise<BusinessRegistryLookup> {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  try {
    const start = await fetchJson(`${REGISTRY}/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Accept: "application/json" },
      body: new URLSearchParams({ query: inn, region: "", page: "" }).toString(),
    }, deadline);
    const token = start.json as { t?: unknown; captchaRequired?: unknown } | null;
    if (!start.ok || !token || typeof token.t !== "string" || token.captchaRequired === true) return { ok: false, error: "registry_unavailable" };
    for (let attempt = 0; attempt < 5 && Date.now() < deadline - 1000; attempt += 1) {
      await sleep(attempt === 0 ? 400 : 800);
      const res = await fetchJson(`${REGISTRY}/search-result/${encodeURIComponent(token.t)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      }, deadline);
      const payload = res.json as { status?: unknown; rows?: unknown } | null;
      if (!res.ok || !payload || payload.status === "wait") continue;
      return parseRegistryRows(inn, payload);
    }
    return { ok: false, error: "registry_unavailable" };
  } catch {
    return { ok: false, error: "registry_unavailable" };
  }
}
