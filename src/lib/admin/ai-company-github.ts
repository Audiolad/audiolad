import "server-only";

import {
  isAiCompanyIssue,
  isTruthyField,
  parseAiCompanyContract,
  parseMarkdownSections,
  requiresHumanGate,
} from "@/lib/ai-company/contract";

const DEFAULT_REPO = "Audiolad/audiolad";
const ACTIVE_STATUSES = new Set(["research", "in progress", "review", "human gate"]);

export const AI_COMPANY_AGENT_ROSTER = [
  "Orchestrator",
  "Research",
  "Product",
  "UX",
  "Engineering",
  "QA",
  "Marketing & Sales",
  "Analytics",
] as const;

type GithubIssue = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: "open" | "closed";
  updated_at: string;
  pull_request?: unknown;
};

export type AiCompanyTask = {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed";
  updatedAt: string;
  status: string;
  priority: string;
  strategicGoal: string;
  producer: string;
  resultConsumer: string;
  humanGate: string;
  blocked: boolean;
  nextAction: string;
};

export type AiCompanyGoal = {
  number: number;
  title: string;
  url: string;
  goal: string;
  why: string;
  idealOutcome: string;
  successEvidence: string;
};

export type AiCompanyAgentState = {
  name: (typeof AI_COMPANY_AGENT_ROSTER)[number];
  state: "active" | "idle";
  task: AiCompanyTask | null;
};

export type AiCompanyPullRequest = {
  number: number;
  title: string;
  url: string;
  updatedAt: string;
};

export type AiCompanySnapshot = {
  repo: string;
  sourceUrl: string;
  fetchedAt: string;
  goal: AiCompanyGoal | null;
  tasks: AiCompanyTask[];
  humanGates: AiCompanyTask[];
  agents: AiCompanyAgentState[];
  pullRequests: AiCompanyPullRequest[];
  counts: {
    ready: number;
    active: number;
    humanGate: number;
    blocked: number;
  };
  error: string | null;
};

function cleanIssueFormValue(value: string): string {
  return value.replace(/^_No response_$/i, "").trim();
}

function sameAgent(left: string, right: string): boolean {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-zа-я0-9]/gi, "");

  return normalize(left) === normalize(right);
}

async function fetchGithubIssues(repo: string): Promise<GithubIssue[]> {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/issues?state=open&per_page=100&sort=updated&direction=desc`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Audiolad-AI-Company",
      },
      next: { revalidate: 60 },
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }

  return (await response.json()) as GithubIssue[];
}

function toTask(issue: GithubIssue): AiCompanyTask {
  const contract = parseAiCompanyContract(issue.body);

  return {
    number: issue.number,
    title: issue.title.replace(/^\[AI\]\s*/i, "").trim(),
    url: issue.html_url,
    state: issue.state,
    updatedAt: issue.updated_at,
    status: cleanIssueFormValue(contract.status) || "Idea",
    priority: cleanIssueFormValue(contract.priority) || "P2",
    strategicGoal: cleanIssueFormValue(contract.strategicGoal),
    producer: cleanIssueFormValue(contract.producer),
    resultConsumer: cleanIssueFormValue(contract.resultConsumer),
    humanGate: cleanIssueFormValue(contract.humanGate) || "None",
    blocked: isTruthyField(cleanIssueFormValue(contract.blocked)),
    nextAction: cleanIssueFormValue(contract.nextAction),
  };
}

function toGoal(issue: GithubIssue): AiCompanyGoal {
  const sections = parseMarkdownSections(issue.body);
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const value = sections.get(key.toLowerCase());
      if (value) return cleanIssueFormValue(value);
    }
    return "";
  };

  return {
    number: issue.number,
    title: issue.title.replace(/^\[AI Goal\]\s*/i, "").trim(),
    url: issue.html_url,
    goal: get("goal", "strategic goal"),
    why: get("why"),
    idealOutcome: get("ideal outcome scene"),
    successEvidence: get("success evidence", "acceptance criteria"),
  };
}

function emptySnapshot(repo: string, error: string | null): AiCompanySnapshot {
  return {
    repo,
    sourceUrl: `https://github.com/${repo}/issues`,
    fetchedAt: new Date().toISOString(),
    goal: null,
    tasks: [],
    humanGates: [],
    agents: AI_COMPANY_AGENT_ROSTER.map((name) => ({
      name,
      state: "idle",
      task: null,
    })),
    pullRequests: [],
    counts: { ready: 0, active: 0, humanGate: 0, blocked: 0 },
    error,
  };
}

export async function getAiCompanySnapshot(): Promise<AiCompanySnapshot> {
  const repo = process.env.AI_COMPANY_GITHUB_REPO?.trim() || DEFAULT_REPO;

  try {
    const issues = await fetchGithubIssues(repo);
    const normalIssues = issues.filter((issue) => !issue.pull_request);
    const goalIssue =
      normalIssues.find((issue) => /^\[AI Goal\]/i.test(issue.title.trim())) ?? null;

    const tasks = normalIssues
      .filter((issue) => !/^\[AI Goal\]/i.test(issue.title.trim()))
      .filter((issue) => isAiCompanyIssue(issue.title, issue.body))
      .map(toTask);

    const pullRequests = issues
      .filter((issue) => Boolean(issue.pull_request))
      .slice(0, 12)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
        updatedAt: issue.updated_at,
      }));

    const humanGates = tasks.filter(
      (task) =>
        task.status.trim().toLowerCase() === "human gate" ||
        requiresHumanGate(task.humanGate),
    );

    const agents: AiCompanyAgentState[] = AI_COMPANY_AGENT_ROSTER.map((name) => {
      const task =
        tasks.find(
          (candidate) =>
            sameAgent(candidate.producer, name) &&
            ACTIVE_STATUSES.has(candidate.status.trim().toLowerCase()),
        ) ?? null;

      return { name, state: task ? "active" : "idle", task };
    });

    return {
      repo,
      sourceUrl: `https://github.com/${repo}/issues`,
      fetchedAt: new Date().toISOString(),
      goal: goalIssue ? toGoal(goalIssue) : null,
      tasks,
      humanGates,
      agents,
      pullRequests,
      counts: {
        ready: tasks.filter((task) => task.status.trim().toLowerCase() === "ready").length,
        active: tasks.filter((task) =>
          ACTIVE_STATUSES.has(task.status.trim().toLowerCase()),
        ).length,
        humanGate: humanGates.length,
        blocked: tasks.filter((task) => task.blocked).length,
      },
      error: null,
    };
  } catch (error) {
    console.error("ai_company_github_snapshot_error", error);

    return emptySnapshot(
      repo,
      error instanceof Error ? error.message : "Неизвестная ошибка GitHub",
    );
  }
}
