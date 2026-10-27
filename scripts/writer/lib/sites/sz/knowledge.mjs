// Bundled sergey-zoya.ru knowledge: editorial lessons (EDITS.md of the angel article and pack 04),
// reference articles and the tone sample that goes into the prompt. Human-readable version:
// knowledge/GUIDE.md. Every lesson here is also enforced by rules.mjs where it can be checked.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fieldsFromMarkdown } from "./extract.mjs";

export const KNOWLEDGE_DIR = fileURLToPath(new URL("./knowledge/", import.meta.url));
export const REFERENCES = ["reference-prakticheskaya-ezoterika.md", "reference-angel-hranitel.md"];

// Short, model-facing lessons. Source in brackets: A = angel-hranitel EDITS.md (28 manual edits),
// P4 = pack 04 «Знаки и символы» (453eaa2a), S = owner rule (Sergey).
export const LESSONS = [
  "Не уверена, что факт, традиция, примета, обряд, этимология, цитата или исследование реальны, – не упоминай их. Лучше короче, но правдиво. Ничего не выдумывай для полноты. [S]",
  "Запрос в transition – в именительном падеже, как есть; запрос всего 2–4 раза, не повторяй его в жирном вопросе и в финальном вопросе. [A]",
  "Эксперту – только то, что есть в цитате и её контексте; никаких выводов «за него». Цитата обрывается на полуслове – сайт ставит «…», ты её не дописываешь. [A]",
  "Факты – только из брифа (facts, материалы практики) или общеизвестные; никаких цифр, исследований и дат «из головы». Об эзотерике – без обобщений вроде «все традиции учат…». [A]",
  "Свойства практики – только из материалов; длительность, автор и название – как в брифе. [A]",
  "Без служебных пометок источников («(припев F)», «см. в статье», «[1]»). Без жаргона: «телесные симптомы», а не «соматические тревоги». [A]",
  "Не обещай «защиты», оберегов, удачи, денег, исцеления; слово «защита» – только в смысле психологической безопасности, лучше обойтись без него. [A, P4, S]",
  "Знаки, числа, цвета, руны, зеркала, карты не предсказывают будущее и не «сбываются»: это язык символов и повод для размышления. [P4]",
  "Практику описывай только позитивно: что она даёт и как её пройти. Не упоминай дискомфорт, неприятные ощущения, тревогу «во время практики», не советуй остановить запись. Раздел о специалисте – про трудности в жизни, а не про прослушивание. [S]",
  "Концовка истории (storyEnding) продолжает именно ту историю, с которой началась статья: те же герои и деталь. [A]",
  "FAQ: 5 разных вопросов на каждую статью, ответы 45–70 слов (гейт принимает 40–80). Не копируй вопрос другой статьи и не пиши «гарантирует» даже после «не». [A, P4]",
  "description – 140–160 символов, законченная фраза, с запросом. [A]",
  "Буква «ё» в цитатах – ровно как в источнике; цитаты вставляет сайт. [P4]",
  "Объём – частая ошибка: модель останавливается около 600 слов. Основная часть около 1200 слов: два раздела по 260–300, ответы FAQ 45–70. Гейт принимает основную часть от 880. [P4]",
  "Только «–» (U+2013): никаких «—», «‑» (U+2011) и неразрывных пробелов U+202F; slug в ссылках копируй из списка буква в букву. [A, P4]",
  "Без видимых дат: никаких «22 июня», «28.03.1990», «2026-10-23», «Обновлено/Опубликовано» – сайт их запрещает; пиши «двадцать второе число», «дата рождения». [P4, S]",
  "Только кириллица внутри русских слов (не «Тension», не «taro-на-dengi»); не пиши слово «художественный» в истории – гейт сайта примет его за оговорку о вымысле. [P4]",
  "Цифры гейт считает словами: не пиши выкладки «2+8+0+3 = 13» в FAQ. Разделы – абзацами по 3–5 предложений, не одним блоком; не бери каждое предложение в «ёлочки». [P4]",
  "Факты из сказок и книг – только точные (у Пушкина вопросы задаёт царица, зеркальце отвечает); сомневаешься – не упоминай. [P4]",
  "Ссылки [анкор](/s/slug) – только на статьи из списка (в т. ч. статьи этого же пакета), встроены в предложение, каждая на свою статью. [P4]",
];

// «Неверно → верно» examples from every review and edit (knowledge/LESSONS.md). The whole list goes
// into every prompt; after each independent review its findings are appended there (README).
export const LESSONS_FILE = fileURLToPath(new URL("./knowledge/LESSONS.md", import.meta.url));

/** Bullet items of LESSONS.md (one «Неверно: … → Верно: …» per line). */
export function parseCorrections(markdown) {
  return markdown
    .split("\n")
    .filter((line) => /^- Неверно: .+ → Верно: /.test(line))
    .map((line) => line.slice(2).trim());
}

export const CORRECTIONS = parseCorrections(readFileSync(LESSONS_FILE, "utf8"));

export function readReference(name = REFERENCES[0]) {
  return readFileSync(new URL(`./knowledge/${name}`, import.meta.url), "utf8");
}

/** A compact tone sample (fields of the canonical «практическая эзотерика» article). */
export function toneSample() {
  const f = fieldsFromMarkdown(readReference());
  return {
    story: f.story.slice(0, 2),
    transition: f.transition,
    invitation: f.invitation,
    question: f.question,
    practiceIntro: f.practiceIntro.slice(0, 1),
    experts: f.experts.slice(0, 1).map(({ name, thesis, bridge }) => ({ name, thesis, bridge })),
    steps: { title: f.steps.title, items: f.steps.items.slice(0, 1) },
    faq: f.faq.slice(0, 1),
    storyEnding: f.storyEnding,
  };
}
