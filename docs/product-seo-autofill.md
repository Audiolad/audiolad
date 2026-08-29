# Product SEO Autofill

Author-facing helper that prepares a local Product SEO draft after the
author chooses a primary query. It is **not a publish gate**: empty SEO
does not block save or publish. The UI does not call the section optional;
it recommends filling it for search discovery.

Do **not** paste `OPENAI_API_KEY` into GitHub issues, PRs, or chat.

## Flow

1. Author fills the ordinary product card (title, format, subtitle,
   description, other product fields).
2. Author chooses a **primary query** — typed by hand, picked from the
   existing Wordstat helper, or started from a seed taken from the product
   card and then checked in Wordstat.
3. Wordstat returns real demand candidates (GetTop results + associations).
4. Autofill **selects secondaries only from those candidates**.
5. Autofill writes a local SEO draft: title, description, about, usage,
   and exactly 3 FAQ pairs.
6. Author reviews and edits everything.
7. The usual product save writes the form. There is no auto-save, no
   PATCH during generation, no IndexNow, and no Webmaster recrawl.

Wordstat = real demand and frequency. AI = semantic selection + writing.
AI does not invent frequency. The author decides. Generated chips and
texts stay editable. No ranking, indexing, TOP-5, or traffic promise.

## Server-only env (names only)

Add later on the server if Autofill should be available. Never use
`NEXT_PUBLIC_` for these names. The browser never receives the key or
chooses the model. The UI never names the provider.

```text
PRODUCT_SEO_AI_ENABLED=true
OPENAI_API_KEY=<secret, enter only on the server>
PRODUCT_SEO_AI_MODEL=<server-configurable model name>
```

Autofill is available only when all of these are true:

- `PRODUCT_SEO_AI_ENABLED=true`
- `OPENAI_API_KEY` is present

Missing or disabled env is graceful: the author can still fill SEO
manually, use the Wordstat picker, save, and publish. Message:

«Не удалось подготовить SEO. Вы можете заполнить поля вручную или попробовать ещё раз позже.»

## What this is not

- Not a rewrite of Wordstat, IndexNow, or Yandex Webmaster
- Not a publication requirement
- Not a SERP analyzer, difficulty score, or ranking guarantee
- Not a generator of related products or listen URLs
