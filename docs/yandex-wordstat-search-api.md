# Yandex Wordstat Search API — author demand discovery

In-product helper for authors who want to pick real Yandex search phrases
with last-30-day demand. It is **optional**, **fail-open**, and never a
publish gate. Manual Product SEO still works with Wordstat disabled.

This is **Yandex Cloud Search API Wordstat GetTop**, not Yandex Webmaster
Recrawl and not a browser scrape of wordstat.yandex.ru.

Do **not** paste the API key into GitHub issues, PRs, or chat. Enter the
secret only on the server.

## Official contract

```http
POST https://searchapi.api.cloud.yandex.net/v2/wordstat/topRequests
Authorization: Api-Key <key>
Content-Type: application/json
```

Server-owned body fields (the browser never sends these):

- `folderId` — from env
- `regions` — default `["225"]` (Russia)
- `devices` — `["DEVICE_ALL"]`
- `numPhrases` — conservative UX value `20` (official range 1–2000)

Client request is only `{ "phrase": "<text>" }`. Phrase is trimmed,
normalized, and capped at the official 400-character limit.

Response arrays used together, in official order: `results`, then
`associations`. `count` is a string int64 and is parsed fail-safe.
`totalCount` is an aggregate for the topic, not invented as the seed
phrase frequency unless that phrase appears in `PhraseInfo`.

Data covers the last 30 days. GetTop is billed per 1000 requests;
identical lookups are served from an in-memory 20-minute cache. Nothing
is written to the product SEO tables.

Process-local outbound guard: at most 40 real GetTop HTTP attempts per
60 minutes. Cache hits do not count; a retry counts as a second attempt.
This is intentionally conservative versus the default Yandex quota of
100/hour, leaving headroom for zero-downtime overlapping processes.
Authors are also limited to 8 logical lookups per 15 minutes.

## Server-only env (names only)

Add later on the server if Wordstat should be available. Never use
`NEXT_PUBLIC_` for these names.

```text
YANDEX_WORDSTAT_ENABLED=true
YANDEX_SEARCH_API_KEY=<secret, enter only on the server>
YANDEX_SEARCH_FOLDER_ID=<Yandex Cloud folder id>
YANDEX_WORDSTAT_REGION_ID=225
```

`YANDEX_WORDSTAT_REGION_ID` defaults to `225` (Russia) when omitted.

Wordstat is available only when all of these are true:

- `YANDEX_WORDSTAT_ENABLED=true`
- API key and folder id are present

Missing or disabled env is graceful: the author sees
«Подбор запросов временно недоступен. Вы можете заполнить запрос вручную.»
Save and publish stay available. Manual SEO fields stay editable.

## What this helper does

An author can type a seed and press **Подобрать в Яндексе**. The app
suggests phrases; the author decides what to put into
`seoPrimaryQuery` / `seoSecondaryQueries`. Selecting a card only updates
the local product form. It does not write to the database and does not
trigger Webmaster recrawl.

Frequency bands (green 50–1000, yellow 10–49 / 1001–5000, red 0–9 /
5001+) are a **UX heuristic**, not a ranking guarantee. The UI never
calls frequency «конкуренция» and never promises TOP-3 / TOP-5.

## What this is not

- Not Yandex Webmaster OAuth / recrawl (`YANDEX_WEBMASTER_*`)
- Not IndexNow
- Not a SERP analyzer, keyword-difficulty score, or AI SEO score
- Not a publication requirement
