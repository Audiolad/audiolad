/**
 * Deterministic SEO packaging prompt for Aurafon closed-beta authors.
 * No AI API / Wordstat / network — pure string assembly for copy-paste into any LLM.
 */

import {
  AUDIO_POST_PRESET_FORMATS,
  MUSIC_PRESET_FORMATS,
  PRODUCT_PRESET_FORMATS,
} from "@/lib/author-products/format";
import { AUTHOR_PUBLICATION_CLASS_LABELS } from "@/lib/author-products/publication-class";
import {
  rankAnalyzedQueriesForSeed,
  tokenizeSeoPhrase,
  type RankableSeoQuery,
} from "@/lib/seo-queries/discovery-ranking";

/** Max secondary candidates shown for author multi-select (not auto-injected into prompt). */
export const SEO_PROMPT_SECONDARY_CANDIDATE_LIMIT = 5;

/** Max secondary queries an author may select for one product page. */
export const SEO_PROMPT_SECONDARY_SELECT_LIMIT = 2;

/** @deprecated Use SEO_PROMPT_SECONDARY_CANDIDATE_LIMIT — kept only if any import remains. */
export const SEO_PROMPT_RELATED_LIMIT = SEO_PROMPT_SECONDARY_CANDIDATE_LIMIT;

export const SEO_PROMPT_EMPTY_RELATED = "не указаны";

/** Feature/commerce claims excluded from automatic secondary suggestions in beta. */
const UNSAFE_SECONDARY_MODIFIERS = [
  "скачать",
  "бесплатно",
  "без рекламы",
  "офлайн",
  "offline",
  "download",
] as const;

export const SEO_PROMPT_EMPTY_PRODUCT_FACTS =
  "Дополнительные сведения не указаны. Не придумывай конкретную длительность, количество треков, инструменты, голос, структуру или свойства продукта, которых нет в исходных данных.";

/** Single source of truth for the packaging prompt body (placeholders filled by buildAuthorSeoProductPrompt). */
export const AUTHOR_SEO_PRODUCT_PROMPT_TEMPLATE = `Ты – SEO-редактор русскоязычной аудиоплатформы АудиоЛад.

Нужно полностью подготовить SEO-упаковку аудиопродукта на основе выбранного поискового запроса.

ОСНОВНОЙ SEO-ЗАПРОС:
{{SEO_QUERY}}

ТИП ПРОДУКТА:
{{PRODUCT_TYPE}}

ДОПОЛНИТЕЛЬНЫЕ SEO-ЗАПРОСЫ:
{{RELATED_QUERIES}}

ДОПОЛНИТЕЛЬНЫЕ СВЕДЕНИЯ О ПРОДУКТЕ:
{{PRODUCT_FACTS}}

Если дополнительные запросы указаны, используй наиболее подходящие из них естественно и по смыслу. Не пытайся вставить каждый запрос любой ценой.

Главный принцип: основной SEO-запрос должен быть центральной темой всей страницы и естественно присутствовать в названии, основном описании, SEO-заголовке, SEO-описании и других подходящих блоках.

Подготовь следующие материалы.

1. НАЗВАНИЕ ПРОДУКТА

Основной SEO-запрос желательно использовать максимально близко к точному вхождению.

Название должно одновременно:

– соответствовать поисковому запросу;

– звучать естественно по-русски;

– быть понятным человеку;

– соответствовать содержанию продукта.

Если точное вхождение звучит нормально, используй его как название.

Не добавляй лишние красивые слова, если они ослабляют соответствие поисковому запросу.

2. ПОДНАЗВАНИЕ

Длина – примерно 90–110 символов.

Не повторяй название дословно.

Используй 1–3 дополнительных SEO-запроса или смысловых слова из поискового кластера.

Подназвание должно объяснять, для чего предназначен продукт, когда его слушать или что находится внутри.

3. ОСНОВНОЕ SEO-ОПИСАНИЕ

Длина – примерно 900–1000 символов, оптимально около 950 символов.

Напиши цельный, естественный и полезный текст.

Основной SEO-запрос используй в первой части описания.

Дополнительные ключевые запросы распределяй по тексту естественно.

Можно использовать близкие формулировки и словоформы, чтобы текст не выглядел как SEO-переспам.

В описании желательно раскрыть:

– что это за продукт;

– для чего его слушают;

– когда его можно включать;

– кому он может подойти;

– как его использовать;

– что человек услышит или получит в процессе прослушивания.

Если это музыка, используй подходящие формулировки: слушать, музыка, композиции, мелодии, без слов, фон, отдых, сон, расслабление, медитация и другие – только если они действительно относятся к продукту.

Если это медитация, аудиопрактика, сеанс или другая практика, описывай именно способ прохождения этой практики.

Не придумывай свойства продукта, которых нет в исходных данных.

Не обещай лечение, исцеление заболеваний или гарантированный медицинский результат.

4. SEO-ЗАГОЛОВОК

Создай отдельный заголовок для поисковой оптимизации страницы.

Основной SEO-запрос должен присутствовать максимально близко к точному вхождению.

После него можно добавить важное уточнение: слушать онлайн, бесплатно, для сна, для медитации, практика, музыка и т. п. – только если это соответствует продукту.

Заголовок должен быть читаемым, а не набором ключевых слов.

5. SEO-ОПИСАНИЕ

Длина – примерно 250–320 символов, желательно около 300 символов.

Это отдельное короткое SEO-описание страницы.

В начале или первой половине текста используй основной SEO-запрос.

Добавь несколько наиболее важных дополнительных запросов.

Текст должен коротко объяснять содержание продукта и мотивировать открыть страницу и начать прослушивание.

6. КАК СЛУШАТЬ / КАК ПРОХОДИТЬ

Создай ровно 3 пункта.

Если продукт – музыка, раздел называется «Как слушать».

Если это медитация, энергопрактика, аудиопрактика, программа, сеанс или подобный продукт – используй подходящую формулировку «Как проходить практику», «Как слушать медитацию» или аналогичную.

Каждый пункт:

– имеет короткий заголовок;

– содержит 1–3 предложения;

– даёт практическую рекомендацию;

– при возможности естественно использует основной или дополнительный SEO-запрос.

Не повторяй одинаковые рекомендации разными словами.

7. ВОПРОСЫ И ОТВЕТЫ

Создай ровно 3 вопроса и 3 ответа.

Вопросы должны соответствовать реальным поисковым интентам пользователя.

Основной SEO-запрос или его естественные части желательно использовать в вопросах и ответах.

Вопросы могут раскрывать:

– что это такое;

– для чего это слушают;

– как правильно слушать;

– когда лучше включать;

– кому подходит;

– где слушать онлайн;

– можно ли слушать перед сном;

– сколько времени слушать.

Выбирай только те вопросы, которые действительно подходят конкретному продукту.

Ответ на каждый вопрос – 2–4 предложения.

ВАЖНЫЕ ПРАВИЛА

– Пиши естественным современным русским языком.

– SEO важен, но текст в первую очередь должен быть удобным человеку.

– Не превращай текст в перечень ключевых запросов.

– Не повторяй один и тот же ключ в каждом предложении.

– Не придумывай медицинские, психологические или терапевтические обещания.

– Не используй формулировки о гарантированном результате.

– Не используй слова «пациент», «лечение», «терапия» и другие медицинские формулировки, если продукт не является медицинским.

– Для практик используй нейтральные формулировки: практика, медитация, аудиопрактика, программа, прослушивание.

– Используй среднее тире «–», а не длинное тире «—».

– Не ставь кавычки вокруг SEO-запроса в готовых текстах без необходимости.

– Не объясняй SEO-стратегию и не комментируй свою работу.

– Не пиши количество символов после каждого блока.

– Сразу выдай готовые тексты для копирования в карточку продукта.

ФОРМАТ ОТВЕТА

Название

[текст]

Подназвание

[текст]

Описание

[текст]

SEO-заголовок

[текст]

SEO-описание

[текст]

Как слушать / Как проходить

1. [заголовок] – [текст]

2. [заголовок] – [текст]

3. [заголовок] – [текст]

Вопросы и ответы

1. [вопрос]

[ответ]

2. [вопрос]

[ответ]

3. [вопрос]

[ответ]`;

export type AuthorSeoPromptRelatedCandidate = {
  id: string;
  queryText: string;
  frequency?: number | null;
  intent?: string | null;
  recommendedFormat?: string | null;
  audioFit?: string | null;
  clusterName?: string | null;
};

function normalizeSeoPhrase(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
}

/**
 * Canonical product-type labels for the prompt select.
 * Reuses existing format presets + publication-class labels — no second independent catalog.
 */
export function listAuthorSeoPromptProductTypeOptions(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };
  for (const label of Object.values(AUTHOR_PUBLICATION_CLASS_LABELS)) {
    push(label);
  }
  for (const label of PRODUCT_PRESET_FORMATS) {
    push(label);
  }
  for (const label of MUSIC_PRESET_FORMATS) {
    push(label);
  }
  for (const label of AUDIO_POST_PRESET_FORMATS) {
    push(label);
  }
  return out;
}

/**
 * Strict secondary SEO suggestions for product packaging.
 * Reuses rankAnalyzedQueriesForSeed() for ordering, then applies a tighter
 * lexical/cluster gate so loose one-token overlaps (e.g. only «джаз») do not appear.
 * Selected secondaries are NOT reservations and do not touch the 5-slot limit.
 */
export type AuthorSeoSecondarySuggestion = {
  id: string;
  queryText: string;
  frequency: number | null;
  score: number;
};

export function hasUnsafeSecondarySeoModifier(queryText: string): boolean {
  const normalized = normalizeSeoPhrase(queryText);
  return UNSAFE_SECONDARY_MODIFIERS.some((mod) => normalized.includes(mod));
}

/**
 * Intent/format are NOT a hard inequality gate.
 * There is no canonical compatibility matrix in SEO Core, and pairs like
 * music ↔ listen_audio on the same lexical backbone are valid for one product page.
 * Keep these helpers for a future proven incompatibility signal only; today they
 * never reject on mere primary !== candidate (lexical backbone is the strict gate).
 */
export function intentsIncompatible(
  primary: string | null | undefined,
  candidate: string | null | undefined,
): boolean {
  // Reserved for a future proven matrix; unused today by design.
  void primary;
  void candidate;
  return false;
}

export function formatsIncompatible(
  primary: string | null | undefined,
  candidate: string | null | undefined,
): boolean {
  void primary;
  void candidate;
  return false;
}

export function isStrictSecondarySeoCandidate(input: {
  primaryTokens: string[];
  primaryIntent?: string | null;
  primaryFormat?: string | null;
  primaryClusterName?: string | null;
  candidateTokens: string[];
  candidateIntent?: string | null;
  candidateFormat?: string | null;
  candidateClusterName?: string | null;
  score: number;
  queryText: string;
}): boolean {
  if (input.score <= 0) return false;
  if (hasUnsafeSecondarySeoModifier(input.queryText)) return false;

  const seedTokens = input.primaryTokens.filter(Boolean);
  if (seedTokens.length === 0) return false;

  const candSet = new Set(input.candidateTokens);
  let hit = 0;
  for (const token of seedTokens) {
    if (candSet.has(token)) hit += 1;
  }
  const containment = hit / seedTokens.length;

  const sameCluster = Boolean(
    input.primaryClusterName?.trim()
      && input.candidateClusterName?.trim()
      && input.primaryClusterName.trim() === input.candidateClusterName.trim(),
  );

  let lexicalOk = false;
  if (sameCluster) {
    // Same analyzed cluster is a strong signal, but still require real lexical overlap.
    lexicalOk = hit >= 1 && containment >= (seedTokens.length <= 2 ? 1 : 0.5);
  } else if (seedTokens.length <= 2) {
    lexicalOk = hit === seedTokens.length;
  } else {
    lexicalOk = containment >= 0.8;
  }
  if (!lexicalOk) return false;

  // Soft secondary signal only — never treat music≠listen_audio as automatic reject.
  if (intentsIncompatible(input.primaryIntent, input.candidateIntent)) return false;
  if (formatsIncompatible(input.primaryFormat, input.candidateFormat)) return false;
  return true;
}

/** Suggest up to 5 strict secondary candidates (author picks at most 2 for the prompt). */
export function suggestSecondarySeoQueriesForPrompt(input: {
  primaryQueryText: string;
  primaryQueryId?: string | null;
  primaryIntent?: string | null;
  primaryFormat?: string | null;
  primaryClusterName?: string | null;
  candidates: AuthorSeoPromptRelatedCandidate[];
  limit?: number;
}): AuthorSeoSecondarySuggestion[] {
  const limit = input.limit ?? SEO_PROMPT_SECONDARY_CANDIDATE_LIMIT;
  const primaryNormalized = normalizeSeoPhrase(input.primaryQueryText);
  const primaryId = input.primaryQueryId?.trim() || null;
  const primaryTokens = tokenizeSeoPhrase(primaryNormalized || input.primaryQueryText);

  const primaryMeta = input.candidates.find(
    (row) =>
      (primaryId && row.id === primaryId)
      || normalizeSeoPhrase(row.queryText) === primaryNormalized,
  );
  const primaryIntent = input.primaryIntent ?? primaryMeta?.intent ?? null;
  const primaryFormat = input.primaryFormat ?? primaryMeta?.recommendedFormat ?? null;
  const primaryClusterName =
    input.primaryClusterName ?? primaryMeta?.clusterName ?? null;

  const queries: RankableSeoQuery[] = [];
  for (const row of input.candidates) {
    if (primaryId && row.id === primaryId) continue;
    const normalized = normalizeSeoPhrase(row.queryText);
    if (!normalized || normalized === primaryNormalized) continue;
    if (hasUnsafeSecondarySeoModifier(row.queryText)) continue;
    queries.push({
      id: row.id,
      queryText: row.queryText,
      normalizedQuery: normalized,
      frequency: typeof row.frequency === "number" ? row.frequency : null,
      intent: row.intent ?? null,
      recommendedFormat: row.recommendedFormat ?? null,
      audioFit: row.audioFit ?? null,
      clusterName: row.clusterName ?? null,
      analysisStatus: "analyzed",
    });
  }

  // Rank with existing discovery ranking (pool larger than UI limit), then strict-filter.
  const ranked = rankAnalyzedQueriesForSeed({
    seedPhrase: input.primaryQueryText,
    seedNormalized: primaryNormalized,
    queries,
    limit: Math.max(limit * 4, 20),
    seedIntentHint: primaryIntent,
    seedFormatHint: primaryFormat,
  });

  const out: AuthorSeoSecondarySuggestion[] = [];
  for (const item of ranked) {
    const candidateTokens = tokenizeSeoPhrase(item.normalizedQuery || item.queryText);
    if (
      !isStrictSecondarySeoCandidate({
        primaryTokens,
        primaryIntent,
        primaryFormat,
        primaryClusterName,
        candidateTokens,
        candidateIntent: item.intent,
        candidateFormat: item.recommendedFormat,
        candidateClusterName: item.clusterName,
        score: item.score,
        queryText: item.queryText,
      })
    ) {
      continue;
    }
    out.push({
      id: item.id,
      queryText: item.queryText,
      frequency: item.frequency,
      score: item.score,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** @deprecated Prefer suggestSecondarySeoQueriesForPrompt — returns selected texts only. */
export function pickRelatedSeoQueriesForPrompt(input: {
  primaryQueryText: string;
  primaryQueryId?: string | null;
  candidates: AuthorSeoPromptRelatedCandidate[];
  limit?: number;
}): string[] {
  return suggestSecondarySeoQueriesForPrompt(input).map((item) => item.queryText);
}

export function formatRelatedQueriesForPrompt(related: string[]): string {
  const cleaned = related.map((phrase) => phrase.trim()).filter(Boolean);
  if (cleaned.length === 0) return SEO_PROMPT_EMPTY_RELATED;
  return cleaned.join("\n");
}

export function clampSecondarySeoSelection(
  selectedIds: string[],
  limit: number = SEO_PROMPT_SECONDARY_SELECT_LIMIT,
): string[] {
  return selectedIds.slice(0, Math.max(0, limit));
}

export function formatProductFactsForPrompt(productFacts: string): string {
  const trimmed = productFacts.trim();
  return trimmed.length > 0 ? trimmed : SEO_PROMPT_EMPTY_PRODUCT_FACTS;
}

export function buildAuthorSeoProductPrompt(input: {
  seoQuery: string;
  productType: string;
  relatedQueries: string[];
  productFacts?: string;
}): string {
  const seoQuery = input.seoQuery.trim();
  const productType = input.productType.trim();
  if (!seoQuery) {
    throw new Error("seo_prompt_missing_query");
  }
  if (!productType) {
    throw new Error("seo_prompt_missing_product_type");
  }

  return AUTHOR_SEO_PRODUCT_PROMPT_TEMPLATE
    .replaceAll("{{SEO_QUERY}}", seoQuery)
    .replaceAll("{{PRODUCT_TYPE}}", productType)
    .replaceAll("{{RELATED_QUERIES}}", formatRelatedQueriesForPrompt(input.relatedQueries))
    .replaceAll("{{PRODUCT_FACTS}}", formatProductFactsForPrompt(input.productFacts ?? ""));
}
