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
  "Статья сразу начинается с практической темы, без истории. Первый абзац вступления начинается с основного запроса как есть и объясняет, о чём речь и зачем это кофейне. Никаких историй, диалогов, прямой речи, рассказчика «я» и выдуманных героев – истории бывают только в статьях «Сергея и Зои», не здесь.",
  "Тон спокойный и доброжелательный. Не пиши про страх, стыд, провал, стресс, усталость, дискомфорт и неприятный опыт – не настраивай читателя на негатив.",
  "Кофейня – в единственном числе: «ваша кофейня», «в кофейне». Слово «точка» не используй ни в каком виде (и «точка безубыточности» тоже: пиши «порог безубыточности», «безубыточность»).",
  "Не упоминай «редакцию». Подпись статьи ставит сайт.",
  "Никакой латиницы: иностранные имена, названия, термины – по-русски (эспрессо, капучино, бариста).",
  "Только среднее тире «–» (U+2013), никогда «—». Кавычки – ёлочки «».",
  "Ссылки в тексте – только markdown [анкор](адрес) и только из списка брифа, встроенные в предложение. Никаких других адресов, сайтов, соцсетей, мессенджеров. Кнопку MAX ставит сайт.",
  "Не пиши о музыке, песнях, треках, плеерах, плейлистах и комментариях – ни слова: статьи о кофейнях без музыки.",
  "Цифры, проценты, цены, даты, исследования, опросы, названия компаний и регалии – только из фактов брифа. Каждый факт в брифе приходит с источником («Источник: …»); если берёшь из него цифру или вывод исследования, назови источник словами в том же абзаце (без ссылки). Нет такого факта – пиши без цифр и без «исследования показывают». Пример расчёта допустим, только если он явно начинается с «например» и не выдаётся за статистику.",
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
