#!/usr/bin/env node
/**
 * Build reviewable initial SEO opportunities seed from Wordstat research.
 * Hard gate: frequency 50–1500, analyzed disposition, natural audio-first phrases.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { classifySeoQuery } from "../src/lib/seo-queries/classifier.ts";

const RAW_PATH = process.env.SEO_SEED_RAW || "/workspace/wordstat-seed-raw.json";
const raw = JSON.parse(readFileSync(RAW_PATH, "utf8"));

const MIN_FREQ = 50;
const MAX_FREQ = 1500;

/** Trailing function words / truncated Wordstat suggestions. */
const TRUNCATED_ENDING =
  /(?:^|\s)(без|для|и|на|в|во|с|со|под|от|по|или|как|что|чтобы|при|к|ко|из|у|о|об|а|но|же|ли|бы|то|это|the|a|an|and|or|for|to|of|in|on|with)$/i;

const HARD_BLOCK =
  /(скачать|бесплатн|без рекламы|древс|ошо|видео|лучшее$|наполнение энергии|онлайн|mp3|torrent|ютуб|youtube|spotify|яндекс\s+музык|apple\s+music|детск|малыш|филармони|клуб|концерт|билеты|афиша|радио|википеди|фильм|сериал|что такое|\bэто\b|позы|упражнен|тренировк|песн|слушкин|всем ру|вики|перевод|значени|секс|похотлив|эроти|интим|луиз|хей |балацк|диспенза|гришко|джазмин|спб|москва|петербург|хорошем качестве|для видео|джаза фон|поднятия(?!\s+настроения)|осенний)/i;

const BRAND_OR_WORK =
  /(подсознание может все|психология влияния|луиз[аы]|хей\b|балацк|диспенза|\bджо\b|майкл джексон|слушкин|аудиокнига\b|ошо)/i;

const PERSONAL_REJECT =
  /(наполнен|медитация\s*5|где послушать|для ведущих|ресторана фоновая|релакс для дома музыка|музыка релакс успокаивающая|утренняя медитация джо|женщин наполнение|благодарности$)/i;

const ULTRA_BROAD =
  /^(аудио\s*рассказы|аудиорассказы|фоновая музыка|джазовая музыка|классическая музыка|smooth jazz|медитация|аффирмации?|музыка|джаз)$/i;

function groupOf(text) {
  const t = text.toLowerCase();
  if (/сон\b|сна\b|спать|засып|ночн|колыбель|бессон|усыпля/.test(t)) return "sleep";
  if (/джаз|jazz|босанов|саксофон|lounge/.test(t)) return "jazz";
  if (/медитац|практик|молитв|йог|энерго|аффирмац|дыхател|расслабл/.test(t)) return "practice";
  if (/сказк|истор|подкаст|аудиокниг|лекци|рассказ|аудио\s*истор/.test(t)) return "story";
  if (/фон|кафе|ресторан|работа|отдых|релакс|спокойн|фонов|ambient|эмбиент|учебы|учёб/.test(t)) {
    return "background";
  }
  if (/музык|classical|классич|lofi|лофи|piano|фортепиан|гитар/.test(t)) return "music_other";
  return "other";
}

function hasUseCase(phrase) {
  const t = phrase.toLowerCase();
  return /(для|под|слуша|фоном|перед сном|медитац|практик|аффирмац|релакс|отдых|работа|кафе|ресторан|сон|сна|засып)/.test(
    t,
  );
}

function looksNatural(phrase) {
  const words = phrase.trim().split(/\s+/);
  if (words.length < 2 || words.length > 7) return false;
  if (TRUNCATED_ENDING.test(phrase.trim())) return false;
  if (/\sи\s*$/i.test(phrase) || /\sбез\s*$/i.test(phrase)) return false;
  // incomplete "и поднятия" / cut compounds
  if (/\sи\s+поднятия$/i.test(phrase)) return false;
  if (/\sи\s+успокоения$/i.test(phrase)) return false;
  // awkward grammar fragments
  if (/слушать джаза\b/i.test(phrase)) return false;
  if (/джаз легкий слушать/i.test(phrase)) return false;
  return true;
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
for (const it of raw.items || []) {
  const phrase = (it.phrase || "").trim();
  if (!phrase) continue;
  const key = normKey(phrase);
  if (!key) continue;
  const prev = best.get(key);
  if (!prev || it.count > prev.count) best.set(key, { ...it, phrase, key });
}

const checkedAt = raw.collectedAt || new Date().toISOString();
const approved = [];
const rejects = {
  frequency: 0,
  classifier: 0,
  audio_fit: 0,
  specific_content: 0,
  hard_block: 0,
  brand_work: 0,
  ultra_broad: 0,
  truncated: 0,
  unnatural: 0,
  no_usecase: 0,
};

for (const it of best.values()) {
  const f = Number(it.count) || 0;
  if (f < MIN_FREQ || f > MAX_FREQ) {
    rejects.frequency += 1;
    continue;
  }
  if (HARD_BLOCK.test(it.phrase)) {
    rejects.hard_block += 1;
    continue;
  }
  if (BRAND_OR_WORK.test(it.phrase)) {
    rejects.brand_work += 1;
    continue;
  }
  if (ULTRA_BROAD.test(it.phrase.trim())) {
    rejects.ultra_broad += 1;
    continue;
  }
  if (PERSONAL_REJECT.test(it.phrase)) {
    rejects.unnatural += 1;
    continue;
  }
  if (TRUNCATED_ENDING.test(it.phrase.trim())) {
    rejects.truncated += 1;
    continue;
  }
  if (!looksNatural(it.phrase)) {
    rejects.unnatural += 1;
    continue;
  }
  if (!hasUseCase(it.phrase)) {
    rejects.no_usecase += 1;
    continue;
  }

  const cls = classifySeoQuery({ queryText: it.phrase });
  if (cls.recommendedDisposition !== "analyzed") {
    rejects.classifier += 1;
    continue;
  }
  if (cls.audioFit === "none" || cls.audioFit === "low") {
    rejects.audio_fit += 1;
    continue;
  }
  if (cls.intent === "specific_content") {
    rejects.specific_content += 1;
    continue;
  }

  const group = groupOf(it.phrase);
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
  });
}

// Prefer thematic diversity without forced equal quotas: sort by theme priority then frequency proximity to mid-band
function themePriority(g) {
  return (
    {
      jazz: 0,
      background: 1,
      sleep: 2,
      practice: 3,
      music_other: 4,
      story: 5,
      other: 6,
    }[g] ?? 9
  );
}

approved.sort((a, b) => {
  const tp = themePriority(a.group) - themePriority(b.group);
  if (tp !== 0) return tp;
  // prefer mid of band
  const da = Math.abs(a.frequency - 400);
  const db = Math.abs(b.frequency - 400);
  if (da !== db) return da - db;
  return a.query_text.localeCompare(b.query_text, "ru");
});

// Soft caps per theme to avoid dump of one cluster, but never invent rows
const softCap = {
  jazz: 22,
  background: 30,
  sleep: 18,
  practice: 25,
  music_other: 18,
  story: 12,
  other: 8,
};
const selected = [];
const used = new Set();
const groupCount = {};

function tryTake(c) {
  const k = c.query_text.toLocaleLowerCase("ru-RU");
  if (used.has(k)) return false;
  const g = c.group;
  const n = groupCount[g] || 0;
  if (n >= (softCap[g] ?? 15)) return false;
  selected.push(c);
  used.add(k);
  groupCount[g] = n + 1;
  return true;
}

for (const c of approved) tryTake(c);
// If under 100, fill remaining without soft caps (still quality-gated approved only)
if (selected.length < 100) {
  for (const c of approved) {
    if (selected.length >= 100) break;
    const k = c.query_text.toLocaleLowerCase("ru-RU");
    if (used.has(k)) continue;
    selected.push(c);
    used.add(k);
    groupCount[c.group] = (groupCount[c.group] || 0) + 1;
  }
}

selected.sort((a, b) => b.frequency - a.frequency || a.query_text.localeCompare(b.query_text, "ru"));

// Must-have thematic anchors for discovery dry-runs / jazz cluster density
const MUST = ["джаз для отдыха", "легкий джаз для отдыха", "джаз музыка для отдыха", "спокойная музыка для отдыха"];
for (const m of MUST) {
  const already = selected.some((s) => s.query_text.toLocaleLowerCase("ru-RU") === m);
  if (already) continue;
  const hit = approved.find((c) => c.query_text.toLocaleLowerCase("ru-RU") === m);
  if (!hit) continue;
  // replace lowest-score junk at end of same-ish group if at cap
  selected.push(hit);
}
// re-dedupe keeping first occurrence after re-sort by frequency
{
  const seen = new Set();
  const dedup = [];
  selected.sort((a, b) => b.frequency - a.frequency || a.query_text.localeCompare(b.query_text, "ru"));
  for (const s of selected) {
    const k = s.query_text.toLocaleLowerCase("ru-RU");
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(s);
  }
  selected.length = 0;
  selected.push(...dedup.slice(0, Math.max(100, Math.min(120, dedup.length))));
}


// recompute groups after must-have / dedupe
const groupCountFinal = {};
for (const s of selected) groupCountFinal[s.group] = (groupCountFinal[s.group] || 0) + 1;
Object.assign(groupCount, groupCountFinal); // recompute groups after must

const freqs = selected.map((s) => s.frequency).sort((a, b) => a - b);
const median = freqs[Math.floor(freqs.length / 2)] ?? 0;

const out = {
  generatedAt: new Date().toISOString(),
  sourceCollectedAt: checkedAt,
  researchNotes:
    "Wordstat topSuggestions (read-only). Hard gate: frequency 50–1500, classifySeoQuery analyzed, audioFit not low/none, no specific_content, natural audio-first phrases, no truncated endings, no ultra-broad heads / brands / works.",
  qualityGate: {
    minFrequency: MIN_FREQ,
    maxFrequency: MAX_FREQ,
    requireAnalyzed: true,
    forbidSpecificContent: true,
    forbidTruncatedEndings: true,
  },
  stats: {
    collected: best.size,
    rejects,
    approved_pool: approved.length,
    selected: selected.length,
    groups: groupCount,
    min: freqs[0] ?? 0,
    median,
    max: freqs[freqs.length - 1] ?? 0,
    duplicates_in_raw: (raw.items || []).length - best.size,
    specific_content: 0,
    truncated: 0,
  },
  queries: selected.map(({ group, ...rest }) => rest),
};

mkdirSync("data", { recursive: true });
writeFileSync("data/seo-initial-opportunities-seed.json", JSON.stringify(out, null, 2) + "\n");

console.log(JSON.stringify({ stats: out.stats, rejects }, null, 2));
if (selected.length < 100) {
  console.error(`NEED_MORE_RESEARCH: selected=${selected.length} approved=${approved.length}`);
  process.exit(2);
}
console.log("OK selected", selected.length);
console.log(
  "first5",
  selected.slice(0, 5).map((s) => `${s.frequency} ${s.query_text}`),
);
console.log(
  "last5",
  selected.slice(-5).map((s) => `${s.frequency} ${s.query_text}`),
);
console.log(
  "jazz",
  selected.filter((s) => groupOf(s.query_text) === "jazz").map((s) => s.query_text),
);
