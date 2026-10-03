import "server-only";

import {
  CLASSICA_PACKAGING_FACT_POLICY,
  classicaPackagingJsonSchema,
  guardClassicaPackagingDraft,
  parseClassicaPackagingDraft,
  type ClassicaPackagingDraft,
  type ClassicaPackagingFacts,
} from "@/lib/classica/production/packaging";

const DEFAULT_MODEL = "gpt-5.4-mini";
const RESPONSES_URL = "https://api.openai.com/v1/responses";
const TIMEOUT_MS = 45_000;

export type ClassicaOpenAiResult =
  | {
      ok: true;
      draft: ClassicaPackagingDraft;
      flags: ReturnType<typeof guardClassicaPackagingDraft>["flags"];
    }
  | { ok: false; error: string };

function readModel(env: NodeJS.ProcessEnv): string {
  const model = env.CLASSICA_OPENAI_MODEL?.trim();
  return model || DEFAULT_MODEL;
}

function extractOutputText(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text;
  }
  if (!Array.isArray(record.output)) {
    return null;
  }
  for (const item of record.output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) {
        return text;
      }
    }
  }
  return null;
}

export async function prepareClassicaPackaging(input: {
  masterPrompt: string;
  facts: ClassicaPackagingFacts;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<ClassicaOpenAiResult> {
  const env = input.env ?? process.env;
  const apiKey = env.OPENAI_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return { ok: false, error: "Не задан OPENAI_API_KEY. Поля карточки не изменены." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await (input.fetchImpl ?? fetch)(RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: readModel(env),
        store: false,
        max_output_tokens: 4000,
        input: [
          { role: "system", content: input.masterPrompt },
          { role: "system", content: CLASSICA_PACKAGING_FACT_POLICY },
          {
            role: "user",
            content: JSON.stringify({
              composer: input.facts.composer,
              title: input.facts.title,
              alternative_title: input.facts.alternativeTitle,
              catalogue_system: input.facts.catalogueSystem,
              catalogue_number: input.facts.catalogueNumber,
              musical_key: input.facts.musicalKey,
              movement: input.facts.movement,
              year: input.facts.year,
              primary_query: input.facts.primaryQuery,
              extra_queries: input.facts.extraQueries,
              score_source: input.facts.scoreSource,
              source_type: input.facts.sourceType,
              rights_checked: input.facts.rightsChecked,
              duration_seconds: input.facts.durationSeconds,
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "classica_packaging",
            strict: true,
            schema: classicaPackagingJsonSchema(),
          },
        },
      }),
    });

    if (!response.ok) {
      console.info("[classica-packaging] responses_failed", { status: response.status });
      return { ok: false, error: "Сервис оформления не ответил. Поля карточки не изменены." };
    }

    const body: unknown = await response.json();
    const text = extractOutputText(body);
    if (!text || text.includes(apiKey)) {
      return { ok: false, error: "Сервис оформления вернул неразборный ответ. Поля не изменены." };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: "Сервис оформления вернул неразборный ответ. Поля не изменены." };
    }
    const draft = parseClassicaPackagingDraft(parsed);
    if (!draft) {
      return { ok: false, error: "Сервис оформления вернул неполные поля. Карточка не изменена." };
    }
    const guarded = guardClassicaPackagingDraft(draft, input.facts);
    return { ok: true, draft: guarded.draft, flags: guarded.flags };
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
    console.info("[classica-packaging] request_failed", {
      timeout: name === "AbortError",
    });
    return {
      ok: false,
      error:
        name === "AbortError"
          ? "Сервис оформления не успел ответить. Поля карточки не изменены."
          : "Сервис оформления недоступен. Поля карточки не изменены.",
    };
  } finally {
    clearTimeout(timer);
  }
}
