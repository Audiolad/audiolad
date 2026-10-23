// Run report and draft PR body (Russian, en dash only).
import { formatRub } from "./cost.mjs";

function bullet(items, empty = "нет") {
  return items?.length ? items.map((item) => `- ${item}`).join("\n") : `- ${empty}`;
}

export function buildReport(state, brief, article, { forPr }) {
  const lines = [];
  if (forPr) {
    lines.push(
      `Автор: **${state.authorLabel}**. Черновик сгенерирован пайплайном \`scripts/writer\` по брифу; мерж и деплой – только после независимого ревью и по обычной политике деплоя. Пайплайн не мержит и не деплоит.`,
      "",
      "ARTICLE TYPE: practice",
      "",
    );
    if (brief.pilot) lines.push("> Пилотный прогон пайплайна: PR будет закрыт без мержа.", "");
    lines.push(
      `- Статья: \`/articles/${brief.slug}\` – «${article.title}»`,
      `- Главный ключ: «${brief.primaryKeyword}»${brief.keywordFrequency ? ` (частотность ${brief.keywordFrequency})` : ""}`,
      `- Основная практика: \`${brief.primaryPractice.href}\``,
      `- Операционный ID: \`${state.articleId}\` (статус PLANNED)`,
      `- База: \`${state.baseSha}\`, прогон \`${state.runId}\``,
      "",
    );
  } else {
    lines.push(`# Отчёт Райтера ${state.runId}`, "", `Модель: ${state.model}. Начало ${state.startedAt}, конец ${state.finishedAt}.`, "");
    if (state.failure) lines.push(`**Остановлено:** ${state.failure}`, "");
    if (state.prUrl) lines.push(`Черновой PR: ${state.prUrl}`, "");
  }

  lines.push("## Генерация и стоимость", "", "| Вызов | HTTP | Токены (вход/выход, из них reasoning) | Время | Стоимость |", "|---|---|---|---|---|");
  for (const call of state.calls) {
    lines.push(
      `| ${call.name} | ${call.http ?? "–"} | ${call.promptTokens ?? 0} / ${call.completionTokens ?? 0}${call.reasoningTokens ? ` (${call.reasoningTokens})` : ""} | ${call.seconds ?? "–"} с | ${formatRub(call.costRub ?? 0)}${call.costEstimated ? " (худший случай: нет usage)" : ""} |`,
    );
  }
  lines.push("", `Итого: **${formatRub(state.spentRub)}** (тариф Cloud.ru с НДС, оценка по usage).`, "");
  if (state.calls.some((call) => call.responseFormatFallback)) {
    lines.push("Структурированный вывод (json_schema) отклонён API – использован промпт без response_format.", "");
  }

  const validation = state.validation;
  if (validation) {
    lines.push("## Валидаторы", "");
    if (state.firstValidation) {
      lines.push(`Первичная проверка: ${state.firstValidation.errors.length} ошибок, исправлено одним раундом Райтера:`, bullet(state.firstValidation.errors), "");
    }
    lines.push(
      `Итог: ${validation.ok ? "✅ пройдено" : "❌ не пройдено"}. Слов в основном тексте: ${validation.stats.words ?? "–"}; главный ключ в тексте: ${validation.stats.primaryKeywordInBody ?? "–"}; дословных цитат: ${validation.stats.quotes?.verbatim ?? 0}; ссылок: ${validation.stats.links?.total ?? 0} (статей ${validation.stats.links?.articles ?? 0}).`,
      "",
      "Проверено: поля и длины, тип practice, дословность цитат по материалам брифа, внутренние ссылки (реестр + живой ответ 200), внешние ссылки только из брифа, без длинного тире (U+2014), без обещаний исцеления/защиты/гарантий, ключи, дубли slug/интента/заголовков, поддержка таблиц.",
      "",
      "Ошибки:",
      bullet(validation.errors),
      "",
      "Предупреждения:",
      bullet(validation.warnings),
      "",
    );
    if (validation.stats.live?.length) {
      lines.push("Живая проверка ссылок:", bullet(validation.stats.live.map((item) => `${item.url} – ${item.status}`)), "");
    }
  }
  if (state.normalization?.length) lines.push("Автоматическая нормализация:", bullet(state.normalization), "");
  if (state.checks) {
    lines.push("## Проверки репозитория", "");
    for (const result of state.checks.results) {
      const mark = result.ok ? "✅" : result.preExisting ? "⚠️ падает и на main (не регрессия)" : "❌";
      lines.push(`- ${mark} ${result.name}`);
    }
    lines.push("");
  }
  if (state.secretScan) {
    lines.push(`Поиск секретов (${state.secretScan.tool ?? "шаблоны"} + шаблоны): ${state.secretScan.ok ? "чисто" : state.secretScan.findings.join("; ")}`, "");
  }
  if (state.files?.length) lines.push("## Файлы", "", bullet(state.files.map((file) => `\`${file}\``)), "");
  if (!forPr && !state.failure && !state.prUrl) lines.push(`Ветка ${state.branch} не опубликована (--dry-run).`, "");
  return `${lines.join("\n").replace(/\u2014/g, "\u2013")}\n`;
}
