import { isSimilarityDefinition } from "@/lib/music-lab/answers";
import { assertMusicLabClientSafe } from "@/lib/music-lab/client-safety";
import { serverOnlyLiterals } from "@/lib/music-lab/client-view";
import type { BlindSystemCode } from "@/lib/music-lab/packet";
import type {
  MusicLabBlindAssignment,
  MusicLabExperiment,
  MusicLabFieldPolicy,
  MusicLabItem,
  MusicLabResponse,
  MusicLabResultSlotId,
  MusicLabResultsSnapshot,
  MusicLabTask,
  SimilarityAnswers,
} from "@/lib/music-lab/types";
import type { MusicLabResultsView, ResultsSlotView, SimilaritySystemView } from "@/lib/music-lab/results-types";
import { FIELD_POLICY_LABELS, RESULT_SLOT_TITLES } from "@/lib/music-lab/vocabulary";

export type { MusicLabResultsView, ResultsSlotView, SimilaritySystemView } from "@/lib/music-lab/results-types";

const SLOT_IDS = Object.keys(RESULT_SLOT_TITLES) as MusicLabResultSlotId[];

const POLICIES = new Set<MusicLabFieldPolicy>([
  "AUTO",
  "SUGGEST_CONFIRM",
  "MANUAL",
  "HIDDEN",
  "DROP",
]);

export function displayBlindSystem(systemCode: string): string | null {
  if (systemCode === "clap_native") {
    return "CLAP";
  }
  if (systemCode === "openl3") {
    return "OpenL3";
  }
  return null;
}

export function normalizeResultsSnapshot(value: unknown): MusicLabResultsSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_results_snapshot");
  }
  const slotsRaw = (value as { slots?: unknown }).slots;
  if (!slotsRaw || typeof slotsRaw !== "object" || Array.isArray(slotsRaw)) {
    throw new Error("invalid_results_snapshot");
  }

  const slots: MusicLabResultsSnapshot["slots"] = {};
  for (const [key, raw] of Object.entries(slotsRaw)) {
    if (!SLOT_IDS.includes(key as MusicLabResultSlotId)) {
      throw new Error("invalid_results_snapshot");
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("invalid_results_snapshot");
    }
    const text = (raw as { text?: unknown }).text;
    const policy = (raw as { policy?: unknown }).policy;
    if (typeof text !== "string" || text.trim().length === 0 || text.trim().length > 200) {
      throw new Error("invalid_results_snapshot");
    }
    if (policy !== undefined && !POLICIES.has(policy as MusicLabFieldPolicy)) {
      throw new Error("invalid_results_snapshot");
    }
    slots[key as MusicLabResultSlotId] = {
      text: text.trim(),
      ...(policy ? { policy: policy as MusicLabFieldPolicy } : {}),
    };
  }

  return { slots };
}

function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 100) / 100;
}

export function buildMusicLabResultsView(input: {
  experiment: MusicLabExperiment;
  items: readonly MusicLabItem[];
  tasks: readonly MusicLabTask[];
  responses: readonly MusicLabResponse[];
  blindAssignments: readonly MusicLabBlindAssignment[];
}): MusicLabResultsView {
  if (input.experiment.status !== "completed") {
    return { locked: true };
  }

  const bySystem = new Map<BlindSystemCode, number[]>();
  bySystem.set("clap_native", []);
  bySystem.set("openl3", []);

  for (const task of input.tasks) {
    if (task.taskType !== "similarity" || !isSimilarityDefinition(task.definition)) {
      continue;
    }
    const response = input.responses.find((entry) => entry.taskId === task.id);
    const scores = (response?.answers as SimilarityAnswers | undefined)?.scores ?? {};
    for (const slot of ["A", "B"] as const) {
      const assignment = input.blindAssignments.find(
        (entry) => entry.taskId === task.id && entry.slotCode === slot,
      );
      if (
        !assignment ||
        (assignment.systemCode !== "clap_native" && assignment.systemCode !== "openl3") ||
        !displayBlindSystem(assignment.systemCode)
      ) {
        continue;
      }
      const bucket = bySystem.get(assignment.systemCode);
      if (!bucket) {
        continue;
      }
      for (const neighbour of task.definition.sets[slot]) {
        const score = scores[neighbour.itemPublicCode];
        if (score && "score" in score) {
          bucket.push(score.score);
        }
      }
    }
  }

  const similarity: SimilaritySystemView[] = [
    {
      label: "CLAP",
      mean: mean(bySystem.get("clap_native") ?? []),
      numericCount: (bySystem.get("clap_native") ?? []).length,
    },
    {
      label: "OpenL3",
      mean: mean(bySystem.get("openl3") ?? []),
      numericCount: (bySystem.get("openl3") ?? []).length,
    },
  ];

  const snapshot = input.experiment.resultsSnapshot;
  const slots: ResultsSlotView[] = SLOT_IDS.map((id) => {
    const imported = snapshot?.slots[id];
    return {
      id,
      title: RESULT_SLOT_TITLES[id],
      text: imported?.text ?? null,
      policyLabel: imported?.policy ? FIELD_POLICY_LABELS[imported.policy] : null,
    };
  });

  const view: MusicLabResultsView = {
    locked: false,
    similarity,
    slots,
    policies: (Object.keys(FIELD_POLICY_LABELS) as MusicLabFieldPolicy[]).map((code) => ({
      code,
      label: FIELD_POLICY_LABELS[code],
    })),
  };

  assertMusicLabClientSafe(view, [
    ...serverOnlyLiterals(input),
    ...input.blindAssignments.map((entry) => entry.systemCode),
  ]);
  return view;
}
