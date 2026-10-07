const MISSING = "Нет данных";
const RUN_ID = /^[A-Za-z0-9_.:-]{1,120}$/;

export type AiCompanyTaskCopyLink = {
  label: string;
  href: string;
};

export type AiCompanyTaskCopyInput = {
  title: string;
  taskId: string;
  runId: string | null;
  brief: string | null;
  stageLabel: string;
  stageDetail: string | null;
  executor: string;
  decisionKind: "decision" | "blocked" | "none";
  decisionOwner: string | null;
  reason: string | null;
  requiredDecision: string | null;
  requiredAction: string | null;
  createdAt: string;
  receivedAt: string;
  startedAt: string;
  lastEventAt: string;
  completedAt: string;
  snapshotAt: string;
  result: string;
  nextStep: string | null;
  links: AiCompanyTaskCopyLink[];
  note: string | null;
};

export function copySafeProse(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[скрыто]")
    .replace(/\b(bearer\s+)\S+/gi, "$1[скрыто]")
    .replace(/\b(?:sk|pk|ghp|github_pat|xox[baprs])-[A-Za-z0-9_-]+/gi, "[скрыто]")
    .replace(
      /\b([A-Za-z0-9_.-]*(?:token|secret|password|api[_-]?key|authorization|credential)[A-Za-z0-9_.-]*)\s*[:=]\s*\S+/gi,
      "$1: [скрыто]",
    )
    .trim();
}

function shown(value: string | null | undefined): string {
  const text = value == null ? "" : copySafeProse(value);
  return text ? text : MISSING;
}

function line(label: string, value: string | null | undefined): string {
  return `${label}: ${shown(value)}`;
}

function safeRunId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!RUN_ID.test(trimmed)) return null;
  if (/token|secret|password|api[_-]?key|authorization|credential|bearer/i.test(trimmed)) return null;
  return trimmed;
}

function safeLink(link: AiCompanyTaskCopyLink): AiCompanyTaskCopyLink | null {
  try {
    const url = new URL(link.href);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return { label: link.label, href: url.toString() };
  } catch {
    return null;
  }
}

export function formatAiCompanyTaskCopy(input: AiCompanyTaskCopyInput): string {
  const lines = [
    line("Название", input.title),
    line("Идентификатор задачи", input.taskId),
    line("Идентификатор запуска", safeRunId(input.runId)),
    "",
  ];

  if (input.decisionKind === "decision") {
    lines.push(
      "Нужно решение.",
      line("Какое решение требуется", input.requiredDecision ?? input.reason),
      line("Кто вправе его принять", input.decisionOwner),
      line("Почему", input.reason),
      line("Требуемое действие", input.requiredAction),
      "",
    );
  } else if (input.decisionKind === "blocked") {
    lines.push(
      "Задача заблокирована.",
      line("Причина", input.reason),
      line("Кто вправе его принять", input.decisionOwner),
      line("Требуемое действие", input.requiredAction),
      "",
    );
  } else {
    lines.push("Отдельное решение по этой задаче в снимке не записано.", "");
  }

  if (input.note) lines.push(shown(input.note), "");

  lines.push(
    line("Стадия", input.stageLabel),
    line("Уточнение стадии", input.stageDetail),
    line("Фактический исполнитель", input.executor),
    "",
    "Постановка:",
    shown(input.brief),
    "",
    "Времена, Europe/Moscow",
    line("Создание записи", input.createdAt),
    line("Получение", input.receivedAt),
    line("Начало", input.startedAt),
    line("Последнее подтверждённое событие", input.lastEventAt),
    line("Завершение", input.completedAt),
    line("Снимок источника", input.snapshotAt),
    "",
    line("Результат", input.result),
    line("Следующее действие", input.nextStep),
    "",
    "Ссылки",
  );

  const links = input.links.map(safeLink).filter((link): link is AiCompanyTaskCopyLink => link != null);
  if (!links.length) lines.push(MISSING);
  else {
    for (const link of links) lines.push(`${link.label}: ${link.href}`);
  }

  return lines.join("\n");
}
