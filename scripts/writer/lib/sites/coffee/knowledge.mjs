// Coffee-guide knowledge for the prompt: short lessons, «неверно → верно» list and a tone sample
// taken verbatim from the approved reference article (kofe-v-zernah-dlya-kofeyni).
// Human-readable rules: knowledge/TEMPLATE_RU.md. Separate from the sz knowledge on purpose.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const KNOWLEDGE_DIR = fileURLToPath(new URL("./knowledge/", import.meta.url));
export const LESSONS_FILE = fileURLToPath(new URL("./knowledge/LESSONS.md", import.meta.url));
export const TONE_SAMPLE_FILE = fileURLToPath(new URL("./knowledge/tone-sample.json", import.meta.url));

// Owner rules (Sergey, 2026-10-29/30) in the form the model reads them. rules.mjs enforces each
// one that can be checked by code.
export const LESSONS = [
  "Статья начинается с живой истории от первого лица (3–6 коротких абзацев) с диалогом: минимум две реплики прямой речи. Рассказчик – собирательный владелец или бариста кофейни. Никаких имён людей, названий кофеен и городов.",
  "Эмоция истории – тёплая и сильная: радость, азарт, гордость, облегчение, благодарность гостя. Не пиши про страх, стыд, провал, стресс, усталость, дискомфорт и неприятный опыт.",
  "После истории – абзац-мостик (bridge): он связывает историю с темой и содержит основной запрос как есть.",
  "Кофейня – в единственном числе: «ваша кофейня», «в кофейне». Слово «точка» не используй ни в каком виде (и «точка безубыточности» тоже: пиши «порог безубыточности», «безубыточность»).",
  "Не упоминай «редакцию». Подпись статьи ставит сайт.",
  "Никакой латиницы: иностранные имена, названия, термины – по-русски (эспрессо, капучино, бариста).",
  "Только среднее тире «–» (U+2013), никогда «—». Кавычки – ёлочки «».",
  "Ссылки в тексте – только markdown [анкор](адрес) и только из списка брифа, встроенные в предложение. Никаких других адресов, сайтов, соцсетей, мессенджеров. Кнопку MAX ставит сайт.",
  "Не пиши о музыке, плеерах, плейлистах и комментариях – страница их не содержит.",
  "Цифры, цены, даты, исследования, названия компаний и регалии – только из фактов брифа или общеизвестные. Не уверен – не пиши. Лучше короче, но правдиво.",
  "Эксперту – только то, что есть в его цитате и её контексте. Цитату и перевод вставит сайт, ты их не пересказываешь в кавычках.",
  "Абзацы по 2–5 предложений, без длинных полотен; разделы не повторяют друг друга.",
];

/** Bullet items of LESSONS.md (one «Неверно: … → Верно: …» per line). */
export function parseCorrections(markdown) {
  return markdown
    .split("\n")
    .filter((line) => /^- Неверно: .+ → Верно: /.test(line))
    .map((line) => line.slice(2).trim());
}

export function corrections() {
  return parseCorrections(readFileSync(LESSONS_FILE, "utf8"));
}

export function toneSample() {
  const sample = JSON.parse(readFileSync(TONE_SAMPLE_FILE, "utf8"));
  delete sample.source;
  return sample;
}
