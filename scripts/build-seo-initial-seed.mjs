#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { classifySeoQuery } from "../src/lib/seo-queries/classifier.ts";

const raw = JSON.parse(readFileSync("/workspace/wordstat-seed-raw.json", "utf8"));

const BLOCK =
  /(скачать|бесплатно|без рекламы|онлайн|mp3|torrent|ютуб|youtube|spotify|яндекс\s+музык|apple\s+music|[123]|детск|малыш|филармони|гришко|джазмин|спб|москва|петербург|клуб|концерт|билеты|афиша|радио|википеди|фильм|сериал|что такое|\bэто\b|позы|упражнен|тренировк|диспенза|луиз|хей |балацк|песн|слушкин|всем ру|вики|перевод|значени|esse jazz|night smooth|секс|похотлив|эроти|интим)/i;

function groupOf(text) {
  const t = text.toLowerCase();
  if (/сон\b|сна\b|спать|засып|ночн|колыбель|бессон|усыпля/.test(t)) return "sleep";
  if (/джаз|jazz|босанов|саксофон/.test(t)) return "jazz";
  if (/медитац|практик|молитв|йог|энерго|аффирмац|расслабл/.test(t)) return "practice";
  if (/сказк|истор|подкаст|аудиокниг|лекци|рассказ|аудио\s*истор/.test(t)) return "story";
  if (/фон|кафе|ресторан|работа|отдых|релакс|спокойн|фонов|ambient|эмбиент|lounge|учебы|учёб/.test(t)) {
    return "background";
  }
  if (/музык|classical|классич|lofi|лофи|piano|фортепиан|гитар/.test(t)) return "music_other";
  return "other";
}

function looksLikeOpportunity(phrase) {
  const t = phrase.toLowerCase();
  if (/(для|под|слуша|фонов|медитац|практик|молитв|аффирмац|аудио|джаз|jazz|классич|lofi|эмбиент|ambient|сказк|рассказ)/.test(t)) {
    return true;
  }
  return /музык/.test(t) && phrase.split(/\s+/).length >= 3;
}

function normKey(s) {
  return s
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const best = new Map();
for (const it of raw.items) {
  const phrase = (it.phrase || "").trim();
  if (!phrase) continue;
  const key = normKey(phrase);
  if (!key) continue;
  const prev = best.get(key);
  if (!prev || it.count > prev.count) best.set(key, { ...it, phrase, key });
}

const checkedAt = raw.collectedAt || new Date().toISOString();
const approved = [];
let classifierRejected = 0;
let otherRejected = 0;

for (const it of best.values()) {
  if (BLOCK.test(it.phrase)) {
    otherRejected += 1;
    continue;
  }
  if (!looksLikeOpportunity(it.phrase)) {
    otherRejected += 1;
    continue;
  }
  const words = it.phrase.split(/\s+/).length;
  if (words < 2) {
    otherRejected += 1;
    continue;
  }
  // Drop head terms that are too broad without purpose
  if (/^(джазовая музыка|smooth jazz|фоновая музыка|классическая музыка)$/i.test(it.phrase)) {
    // keep a few mid head terms? skip ultra-broad singles without "для"
    if (!/для|фоном|слуша/.test(it.phrase.toLowerCase()) && words <= 2) {
      otherRejected += 1;
      continue;
    }
  }
  const cls = classifySeoQuery({ queryText: it.phrase });
  if (cls.recommendedDisposition !== "analyzed") {
    classifierRejected += 1;
    continue;
  }
  if (cls.audioFit === "none" || cls.audioFit === "low") {
    otherRejected += 1;
    continue;
  }

  const f = it.count;
  let freqScore = 0;
  if (f >= 50 && f <= 1500) freqScore = 100;
  else if (f > 1500 && f <= 5000) freqScore = 75;
  else if (f > 5000 && f <= 20000) freqScore = 45;
  else if (f > 20000 && f <= 80000) freqScore = 20;
  else if (f > 80000) freqScore = 5;
  else freqScore = 30;

  const group = groupOf(it.phrase);
  const themeBoost =
    group === "jazz" ? 42 :
    group === "practice" ? 36 :
    group === "sleep" ? 40 :
    group === "story" ? 32 :
    group === "background" ? 18 :
    8;

  // Prefer phrases with "для" / listen intent
  const purposeBoost = /для|слуша|фоном|перед сном/.test(it.phrase.toLowerCase()) ? 15 : 0;

  approved.push({
    query_text: it.phrase,
    frequency: f,
    source: "wordstat",
    frequency_checked_at: checkedAt,
    intent: cls.intent,
    recommended_format: cls.recommendedFormat,
    audio_fit: cls.audioFit,
    analysis_status: "analyzed",
    confidence: cls.confidence,
    classifier_reasons: cls.reasons,
    from_seed: it.fromSeed ?? null,
    group,
    score: freqScore + themeBoost + purposeBoost + Math.min(18, words * 3),
  });
}

approved.sort((a, b) => b.score - a.score || b.frequency - a.frequency || a.query_text.localeCompare(b.query_text, "ru"));

const quotas = {
  jazz: 18,
  practice: 18,
  sleep: 18,
  story: 10,
  background: 28,
  music_other: 18,
  other: 6,
};
const selected = [];
const used = new Set();

function takeFrom(group, n) {
  let taken = 0;
  for (const c of approved) {
    if (taken >= n) break;
    if (c.group !== group) continue;
    const k = c.query_text.toLocaleLowerCase("ru-RU");
    if (used.has(k)) continue;
    selected.push(c);
    used.add(k);
    taken += 1;
  }
  return taken;
}

const filled = {};
for (const [g, n] of Object.entries(quotas)) filled[g] = takeFrom(g, n);
for (const c of approved) {
  if (selected.length >= 110) break;
  const k = c.query_text.toLocaleLowerCase("ru-RU");
  if (used.has(k)) continue;
  selected.push(c);
  used.add(k);
}

if (selected.length < 100) {
  console.error("ERROR: selected < 100:", selected.length, "approved", approved.length, "filled", filled);
  process.exit(1);
}

// Ensure dry-run phrase present
const must = ["джаз для отдыха"];
for (const m of must) {
  if (![...used].some((k) => k === m)) {
    const hit = approved.find((c) => c.query_text.toLocaleLowerCase("ru-RU") === m);
    if (hit) {
      selected.push(hit);
      used.add(m);
    }
  }
}

selected.sort((a, b) => b.frequency - a.frequency || a.query_text.localeCompare(b.query_text, "ru"));
// dedupe again after must
const final = [];
const seen = new Set();
for (const s of selected) {
  const k = s.query_text.toLocaleLowerCase("ru-RU");
  if (seen.has(k)) continue;
  seen.add(k);
  final.push(s);
}

const groups = {};
for (const s of final) groups[s.group] = (groups[s.group] || 0) + 1;
const freqs = final.map((s) => s.frequency).sort((a, b) => a - b);
const median = freqs[Math.floor(freqs.length / 2)] ?? 0;

const out = {
  generatedAt: new Date().toISOString(),
  sourceCollectedAt: checkedAt,
  researchNotes:
    "Wordstat topSuggestions via production API (read-only). Selected with classifySeoQuery recommendedDisposition=analyzed only. Seed is reviewable; migration inserts idempotently.",
  stats: {
    collected: best.size,
    classifier_rejected: classifierRejected,
    other_rejected: otherRejected,
    approved_pool: approved.length,
    selected: final.length,
    groups,
    quota_filled: filled,
    min: freqs[0] ?? 0,
    median,
    max: freqs[freqs.length - 1] ?? 0,
    duplicates_in_raw: raw.items.length - best.size,
  },
  queries: final.map(({ group, score, ...rest }) => rest),
};

mkdirSync("data", { recursive: true });
writeFileSync("data/seo-initial-opportunities-seed.json", JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out.stats, null, 2));
for (const g of ["jazz", "sleep", "practice", "story", "background"]) {
  console.log(
    g + ":",
    final.filter((s) => s.group === g).slice(0, 8).map((s) => `${s.query_text} (${s.frequency})`),
  );
}
