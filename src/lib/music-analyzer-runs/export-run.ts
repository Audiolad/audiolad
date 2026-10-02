import type { MusicAnalyzerRunClient } from "./contract";
import { flattenJson } from "./compare";

function csvCell(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

export function exportRunJson(run: MusicAnalyzerRunClient): string {
  return `${JSON.stringify({
    id: run.id,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
    status: run.status,
    sourceFilename: run.sourceFilename,
    sha256: run.sha256,
    byteSize: run.byteSize,
    versionNumber: run.versionNumber,
    analyzerVersion: run.analyzerVersion,
    analyzerGitCommit: run.analyzerGitCommit,
    analyzerContentCommit: run.analyzerContentCommit,
    modelCheckpoint: run.modelCheckpoint,
    taxonomyVersion: run.taxonomyVersion,
    promptVersion: run.promptVersion,
    device: run.device,
    errorCode: run.errorCode,
    raw: run.rawJson,
    normalized: run.normalizedJson,
    provenance: run.provenance,
  }, null, 2)}\n`;
}

export function exportRunCsv(run: MusicAnalyzerRunClient): string {
  const lines = ["path,value"];
  lines.push(`${csvCell("id")},${csvCell(run.id)}`);
  lines.push(`${csvCell("sha256")},${csvCell(run.sha256)}`);
  lines.push(`${csvCell("version")},${csvCell(run.versionNumber)}`);
  lines.push(`${csvCell("source_filename")},${csvCell(run.sourceFilename)}`);
  lines.push(`${csvCell("analyzer_git_commit")},${csvCell(run.analyzerGitCommit)}`);
  lines.push(`${csvCell("model_checkpoint")},${csvCell(run.modelCheckpoint)}`);
  for (const [path, value] of flattenJson(run.normalizedJson)) {
    lines.push(`${csvCell(`normalized.${path}`)},${csvCell(value)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function exportRunMarkdown(run: MusicAnalyzerRunClient): string {
  return [
    `# Прогон ${run.id}`,
    "",
    `- Файл: ${run.sourceFilename}`,
    `- SHA256: \`${run.sha256}\``,
    `- Версия: ${run.versionNumber}`,
    `- Статус: ${run.status}`,
    `- Создан: ${run.createdAt}`,
    `- Завершён: ${run.finishedAt ?? "—"}`,
    `- Коммит анализатора: ${run.analyzerGitCommit ?? "—"}`,
    `- Содержание: ${run.analyzerContentCommit ?? "—"}`,
    `- Версия анализатора: ${run.analyzerVersion ?? "—"}`,
    `- Чекпоинт: ${run.modelCheckpoint ?? "—"}`,
    `- Таксономия: ${run.taxonomyVersion ?? "—"}`,
    `- Промпт: ${run.promptVersion ?? "—"}`,
    `- Устройство: ${run.device ?? "—"}`,
    "",
    "## Normalized",
    "",
    "```json",
    JSON.stringify(run.normalizedJson, null, 2),
    "```",
    "",
    "## Raw",
    "",
    "```json",
    JSON.stringify(run.rawJson, null, 2),
    "```",
    "",
  ].join("\n");
}
