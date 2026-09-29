export type AiCompanyContractFields = {
  status: string;
  priority: string;
  strategicGoal: string;
  why: string;
  idealOutcome: string;
  expectedOutput: string;
  deliverableFormat: string;
  producer: string;
  resultConsumer: string;
  consumerNeed: string;
  acceptanceCriteria: string;
  marketReferenceCheck: string;
  humanGate: string;
  blocked: string;
  nextAction: string;
};

function normalizeHeading(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
}

export function parseMarkdownSections(
  body: string | null | undefined,
): Map<string, string> {
  const sections = new Map<string, string>();
  if (!body) return sections;

  let currentHeading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentHeading) return;
    sections.set(currentHeading, buffer.join("\n").trim());
  };

  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (match) {
      flush();
      currentHeading = normalizeHeading(match[1]);
      buffer = [];
      continue;
    }

    if (currentHeading) buffer.push(line);
  }

  flush();
  return sections;
}

function section(sections: Map<string, string>, ...names: string[]): string {
  for (const name of names) {
    const value = sections.get(normalizeHeading(name));
    if (value) return value.trim();
  }
  return "";
}

export function parseAiCompanyContract(
  body: string | null | undefined,
): AiCompanyContractFields {
  const sections = parseMarkdownSections(body);

  return {
    status: section(sections, "Status"),
    priority: section(sections, "Priority"),
    strategicGoal: section(sections, "Strategic Goal", "Goal"),
    why: section(sections, "Why"),
    idealOutcome: section(sections, "Ideal Outcome Scene"),
    expectedOutput: section(sections, "Expected Output"),
    deliverableFormat: section(sections, "Deliverable Format"),
    producer: section(sections, "Producer", "Agent"),
    resultConsumer: section(sections, "Result Consumer"),
    consumerNeed: section(sections, "Consumer Need"),
    acceptanceCriteria: section(sections, "Acceptance Criteria"),
    marketReferenceCheck: section(
      sections,
      "Market / Reference Check",
      "Market Reference Check",
    ),
    humanGate: section(sections, "Human Gate"),
    blocked: section(sections, "Blocked"),
    nextAction: section(sections, "Next Action"),
  };
}

export function isAiCompanyIssue(
  title: string,
  body: string | null | undefined,
): boolean {
  if (/^\[AI(?: Goal)?\]/i.test(title.trim())) return true;
  if (body?.includes("<!-- ai-company-task:v1 -->")) return true;

  const sections = parseMarkdownSections(body);
  return sections.has("strategic goal") && sections.has("result consumer");
}

export function isTruthyField(value: string): boolean {
  return /^(yes|true|1|да)$/i.test(value.trim());
}

export function requiresHumanGate(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    Boolean(normalized) &&
    !["none", "no", "нет", "n/a"].includes(normalized)
  );
}
