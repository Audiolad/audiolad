# Product SEO Autofill

Author-facing helper that prepares a local Product SEO draft after the
author chooses a primary query. It is **not a publish gate**: empty SEO
does not block save or publish. The UI does not call the section optional;
it recommends filling it for search discovery.

Do **not** paste `OPENAI_API_KEY` or `YANDEX_AI_API_KEY` into GitHub
issues, PRs, or chat.

## Flow

1. Author fills the ordinary product card (title, format, subtitle,
   description, other product fields).
2. Author chooses a **primary query** — typed by hand, picked from the
   existing Wordstat helper, or started from a seed taken from the product
   card and then checked in Wordstat.
3. Wordstat returns real demand candidates (GetTop results + associations).
4. Autofill **selects secondaries only from those candidates**.
   If Wordstat has 3+ eligible phrases, the draft includes 3–5. If it
   has 1–2, generation still succeeds with those phrases. If it has none,
   secondaries stay empty and the other SEO fields are still prepared.
5. Autofill writes a local SEO draft: title, description, about, usage,
   and exactly 3 FAQ pairs. Ordinary `description` stays the public short
   product copy. `seoAbout` is «Подробнее о продукте»: a continuation, not
   a rewrite. The model may use the short description only as a fact
   source. If context is thin, a shorter about text is better than
   repeating or padding. An optional style profile changes tone, not
   facts or Wordstat phrases. The search title stays SEO-first.
6. Author reviews and edits everything.
7. The usual product save writes the form. There is no auto-save, no
   PATCH during generation, no IndexNow, and no Webmaster recrawl.
   Style selection is local to the current form. Author-default style
   persistence needs a follow-up (no existing settings JSON is safe).

Wordstat = real demand and frequency. AI = semantic selection + writing.
AI does not invent frequency. The author decides. Generated chips and
texts stay editable. No ranking, indexing, TOP-5, or traffic promise.

For **Yandex only**, after generate and after the one repair, the server
rewrites `secondaryQueries` onto exact unique Wordstat candidate phrases
and fills or trims to the existing expected range before the validator.
This is not a third model call. OpenAI is unchanged. The JSON Schema
enum/`uniqueItems` layer and the strict validator stay as they are.

## AI provider

Autofill can call **OpenAI Responses API** or **Yandex AI Studio**
(YandexGPT Text Generation API). Orchestration, prompts, validation,
one repair attempt, rate limit, style profile, duplication guard,
Wordstat candidate secondaries, exactly-3 FAQ, and fail-open UX stay
the same. Only the provider layer changes.

For the current Audiolad production infrastructure (RU egress), use
**Yandex AI Studio**. OpenAI remains available for supported-region
deploys. Set `PRODUCT_SEO_AI_PROVIDER` explicitly on the server; this
document does not write production env.

The UI never names the provider. The browser never receives keys or
chooses the model.

### Yandex AI Studio

Official REST only:

```http
POST https://llm.api.cloud.yandex.net/foundationModels/v1/completion
Authorization: Api-Key <YANDEX_AI_API_KEY>
Content-Type: application/json
```

`modelUri` is built as `gpt://<YANDEX_AI_FOLDER_ID>/<YANDEX_AI_MODEL>/latest`.
`YANDEX_AI_MODEL` is a model id, not a full URI. Default id is
`yandexgpt-lite` (current cheap Russian generation model for high-volume
SEO copy). Operators may set another current model id via env.

Production prerequisite — two separate facts, do not mix them:

- IAM ROLE on `YANDEX_AI_FOLDER_ID`: `ai.languageModels.user`
- API KEY SCOPE on that service account key: `yc.ai.languageModels.execute`

Recommend a separate service account for Product SEO AI, for example
`audiolad-seo-ai`, and a separate API key.
Do **not** reuse `YANDEX_SEARCH_API_KEY` (Wordstat scope is
`yc.search-api.execute`).
The folder id may later match the Search API folder, but the AI
account and key are separate. Do not hardcode the folder id. This
document does not create any account, key, or env.

## Server-only env (names only)

Add later on the server if Autofill should be available. Never use
`NEXT_PUBLIC_` for these names.

```text
PRODUCT_SEO_AI_ENABLED=true
PRODUCT_SEO_AI_PROVIDER=openai
OPENAI_API_KEY=<secret, enter only on the server>
PRODUCT_SEO_AI_MODEL=<server-configurable OpenAI model name>
YANDEX_AI_API_KEY=<secret, enter only on the server>
YANDEX_AI_FOLDER_ID=<Yandex Cloud folder id>
YANDEX_AI_MODEL=<model id, not a full URI>
```

`PRODUCT_SEO_AI_PROVIDER` is `openai` or `yandex`. When unset, the
default is `openai` (backward compatible). Audiolad production should
later set `yandex` explicitly.

OpenAI default model is `gpt-5.4-mini` when `PRODUCT_SEO_AI_MODEL` is
omitted. Responses requests use Structured Outputs, `store=false`,
`max_output_tokens=3000`, and no tools.

Yandex default model is `yandexgpt-lite` when `YANDEX_AI_MODEL` is
omitted. Completion requests use `stream=false` and official
`jsonSchema` (mutually exclusive with `jsonObject`).

Autofill is available only when all of these are true:

- `PRODUCT_SEO_AI_ENABLED=true`
- selected provider credentials are present
  - `openai`: `OPENAI_API_KEY`
  - `yandex`: `YANDEX_AI_API_KEY` and `YANDEX_AI_FOLDER_ID`

Unknown `PRODUCT_SEO_AI_PROVIDER` and missing or disabled env are
graceful: the author can still fill SEO manually, use the Wordstat
picker, save, and publish. Message:

«Не удалось подготовить SEO. Вы можете заполнить поля вручную или попробовать ещё раз позже.»

## What this is not

- Not a rewrite of Wordstat, IndexNow, or Yandex Webmaster
- Not a publication requirement
- Not a SERP analyzer, difficulty score, or ranking guarantee
- Not a generator of related products or listen URLs
