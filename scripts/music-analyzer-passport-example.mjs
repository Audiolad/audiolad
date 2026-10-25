import { writeFile } from "node:fs/promises";
import { buildFeatures } from "../src/lib/music-analyzer-runs/features.mjs";
import { featureDisplayRows } from "../src/lib/music-analyzer-runs/feature-display.mjs";

const features = buildFeatures({ technical: { bpm: null, diagnostics: { bpm_candidate: 70, bpm_candidate_raw: 140, pulse_accepted: false } },
  genres: [{ label: "Dark Jazz", score: 0.7 }, { label: "Ambient", score: 0.6 }], moods: ["calm"] },
{ energy_0_100: 42, rhythm_salience: 0.2, dynamic_spread_db: 4.8, loudness_range_lu: 3.1, loudness_lufs: -18.3, true_peak_dbtp: -1.2, ffmpeg_version: "демонстрация" }, "демонстрация");
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const cards = featureDisplayRows(features).map(row => `<article><h2>${escape(row.label)}</h2><strong>${escape(row.value)}</strong><p>${escape(row.status)} · ${escape(row.confidence)}</p><details><summary>Источник и ограничения</summary>${escape(row.source)} · ${escape(row.version)}<p>${escape(row.reason ?? "")}</p></details></article>`).join("\n");
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Пример музыкального паспорта</title><style>body{font:16px system-ui;margin:24px auto;padding:16px;max-width:1100px;color:#25135c;background:#faf8fc}header,article{border:1px solid #e4d7f4;border-radius:20px;background:white;padding:20px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:16px}h2,p,details{font-size:14px}h2,p{color:#796ba0}strong{font-size:22px}aside{padding:16px;background:#fff2d9}</style><header><h1>Музыкальный паспорт</h1><aside>Синтетический пример интерфейса. Это не результат анализа Aurafon или другого реального трека.</aside><p>Кандидат темпа: 70 BPM. Исходный кандидат: 140 BPM. Ритм неопределён.</p><p>Жанр: Ambient – гипотеза. Dark Jazz удержан до ручной проверки. Вокал не определён.</p></header><section>${cards}</section><p>Воспринимаемая энергия и жанровые оценки требуют слуховой проверки. Исходная автоматика сохраняется. Версия признаков: ${features.schema_version}.</p></html>\n`;
await writeFile(process.argv[2] ?? "docs/music-analyzer/PASSPORT-EXAMPLE-09d393ce.html", html);
console.log("Создан синтетический пример паспорта.");
