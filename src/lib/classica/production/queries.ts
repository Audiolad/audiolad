import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { evaluateClassicaChecklist } from "@/lib/classica/production/checklist";
import { CLASSICA_PRODUCTION_BUCKET } from "@/lib/classica/public/paths";
import {
  emptyClassicaOperatorStats,
  moscowPeriodRange,
  summarizeClassicaOperatorStats,
  type ClassicaOperatorStats,
  type ClassicaStatsPeriod,
} from "@/lib/classica/production/stats";
import { isClassicaStatus, type ClassicaStatus } from "@/lib/classica/production/status";

export type ClassicaAssetRecord = {
  id: string;
  kind: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  altText: string | null;
  titleText: string | null;
  sortOrder: number;
  signedUrl: string | null;
};

export type ClassicaEventRecord = {
  id: string;
  action: string;
  actorLabel: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ClassicaReviewRecord = {
  id: string;
  decision: string;
  reason: string | null;
  comment: string | null;
  reviewerLabel: string | null;
  createdAt: string;
};

export type ClassicaJobRecord = {
  id: string;
  status: ClassicaStatus;
  priority: number;
  complexity: string;
  taskCostMinor: number;
  assigneeId: string | null;
  assigneeLabel: string | null;
  reservedAt: string | null;
  dueOn: string | null;
  firstTakenAt: string | null;
  submittedAt: string | null;
  acceptedAt: string | null;
  publishedAt: string | null;
  returnCount: number;
  productionSeconds: number | null;
  composerName: string;
  title: string;
  alternativeTitle: string | null;
  catalogueSystem: string | null;
  catalogueNumber: string | null;
  musicalKey: string | null;
  movementLabel: string | null;
  compositionYear: number | null;
  primaryQuery: string | null;
  extraQueries: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  slug: string | null;
  composerSlug: string | null;
  scoreSource: string | null;
  sourceUrl: string | null;
  sourceDescription: string | null;
  sourceType: string | null;
  rightsChecked: boolean;
  rightsComment: string | null;
  durationSeconds: number | null;
  audioPlaybackConfirmedAt: string | null;
  heading: string | null;
  subtitle: string | null;
  shortDescription: string | null;
  body: string | null;
  aboutWork: string | null;
  aboutComposer: string | null;
  listeningNotes: string | null;
  faq: Array<{ question: string; answer: string }>;
  extraBlocks: Array<{ heading: string; body: string }>;
  packagingFlags: Record<string, boolean>;
  createdAt: string;
  assets: ClassicaAssetRecord[];
  events: ClassicaEventRecord[];
  reviews: ClassicaReviewRecord[];
};

type JobRow = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : typeof value === "string" ? value : null;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function mapClassicaJobRow(row: JobRow): Omit<ClassicaJobRecord, "assets" | "events" | "reviews"> {
  const rawStatus = typeof row.status === "string" ? row.status : "";
  const status: ClassicaStatus = isClassicaStatus(rawStatus) ? rawStatus : "queued";
  const faq = Array.isArray(row.faq)
    ? row.faq.flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        const record = item as Record<string, unknown>;
        if (typeof record.question !== "string" || typeof record.answer !== "string") {
          return [];
        }
        return [{ question: record.question, answer: record.answer }];
      })
    : [];
  const extraBlocks = Array.isArray(row.extra_blocks)
    ? row.extra_blocks.flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        const record = item as Record<string, unknown>;
        if (typeof record.heading !== "string" || typeof record.body !== "string") {
          return [];
        }
        return [{ heading: record.heading, body: record.body }];
      })
    : [];
  const flags =
    row.packaging_flags && typeof row.packaging_flags === "object" && !Array.isArray(row.packaging_flags)
      ? Object.fromEntries(
          Object.entries(row.packaging_flags as Record<string, unknown>).map(([key, value]) => [
            key,
            value === true,
          ]),
        )
      : {};

  return {
    id: String(row.id),
    status,
    priority: Number(row.priority ?? 0),
    complexity: String(row.complexity ?? "medium"),
    taskCostMinor: Number(row.task_cost_minor ?? 0),
    assigneeId: nullableText(row.assignee_id),
    assigneeLabel: nullableText(row.assignee_label),
    reservedAt: nullableText(row.reserved_at),
    dueOn: nullableText(row.due_on),
    firstTakenAt: nullableText(row.first_taken_at),
    submittedAt: nullableText(row.submitted_at),
    acceptedAt: nullableText(row.accepted_at),
    publishedAt: nullableText(row.published_at),
    returnCount: Number(row.return_count ?? 0),
    productionSeconds:
      typeof row.production_seconds === "number" ? row.production_seconds : null,
    composerName: String(row.composer_name ?? ""),
    title: String(row.title ?? ""),
    alternativeTitle: nullableText(row.alternative_title),
    catalogueSystem: nullableText(row.catalogue_system),
    catalogueNumber: nullableText(row.catalogue_number),
    musicalKey: nullableText(row.musical_key),
    movementLabel: nullableText(row.movement_label),
    compositionYear:
      typeof row.composition_year === "number" ? row.composition_year : null,
    primaryQuery: nullableText(row.primary_query),
    extraQueries: Array.isArray(row.extra_queries)
      ? row.extra_queries.filter((item): item is string => typeof item === "string")
      : [],
    seoTitle: nullableText(row.seo_title),
    seoDescription: nullableText(row.seo_description),
    slug: nullableText(row.slug),
    composerSlug: nullableText(row.composer_slug),
    scoreSource: nullableText(row.score_source),
    sourceUrl: nullableText(row.source_url),
    sourceDescription: nullableText(row.source_description),
    sourceType: nullableText(row.source_type),
    rightsChecked: row.rights_checked === true,
    rightsComment: nullableText(row.rights_comment),
    durationSeconds:
      typeof row.duration_seconds === "number" ? row.duration_seconds : row.duration_seconds ? Number(row.duration_seconds) : null,
    audioPlaybackConfirmedAt: nullableText(row.audio_playback_confirmed_at),
    heading: nullableText(row.heading),
    subtitle: nullableText(row.subtitle),
    shortDescription: nullableText(row.short_description),
    body: text(row.body),
    aboutWork: text(row.about_work),
    aboutComposer: text(row.about_composer),
    listeningNotes: text(row.listening_notes),
    faq,
    extraBlocks,
    packagingFlags: flags,
    createdAt: String(row.created_at ?? ""),
  };
}

export function checklistForJob(
  job: Pick<
    ClassicaJobRecord,
    | "assets"
    | "audioPlaybackConfirmedAt"
    | "durationSeconds"
    | "composerName"
    | "title"
    | "scoreSource"
    | "rightsChecked"
    | "seoTitle"
    | "seoDescription"
    | "body"
    | "slug"
  >,
) {
  return evaluateClassicaChecklist({
    hasFinalAudio: job.assets.some((asset) => asset.kind === "final_audio"),
    audioPlaybackConfirmed: Boolean(job.audioPlaybackConfirmedAt),
    durationSeconds: job.durationSeconds,
    composerName: job.composerName,
    title: job.title,
    scoreSource: job.scoreSource,
    rightsChecked: job.rightsChecked,
    seoTitle: job.seoTitle,
    seoDescription: job.seoDescription,
    body: job.body,
    hasCover: job.assets.some((asset) => asset.kind === "cover"),
    slug: job.slug,
  });
}

async function signAssets(
  supabase: SupabaseClient,
  rows: Array<Record<string, unknown>>,
): Promise<ClassicaAssetRecord[]> {
  const assets: ClassicaAssetRecord[] = [];
  for (const row of rows) {
    const storagePath = String(row.storage_path ?? "");
    let signedUrl: string | null = null;
    if (storagePath) {
      const signed = await supabase.storage
        .from(CLASSICA_PRODUCTION_BUCKET)
        .createSignedUrl(storagePath, 60 * 60);
      signedUrl = signed.data?.signedUrl ?? null;
    }
    assets.push({
      id: String(row.id),
      kind: String(row.kind),
      storagePath,
      mimeType: String(row.mime_type ?? ""),
      byteSize: Number(row.byte_size ?? 0),
      altText: nullableText(row.alt_text),
      titleText: nullableText(row.title_text),
      sortOrder: Number(row.sort_order ?? 0),
      signedUrl,
    });
  }
  return assets;
}

export async function listClassicaJobs(
  supabase: SupabaseClient,
  filters: { status?: string | null; assigneeId?: string | null; composer?: string | null },
): Promise<Array<Omit<ClassicaJobRecord, "assets" | "events" | "reviews">>> {
  let query = supabase
    .from("classica_production_jobs")
    .select("*")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (filters.status && isClassicaStatus(filters.status)) {
    query = query.eq("status", filters.status);
  }
  if (filters.assigneeId) {
    query = query.eq("assignee_id", filters.assigneeId);
  }
  const composer = filters.composer?.trim() ?? "";
  if (composer) {
    query = query.ilike("composer_name", `%${composer.replace(/[%_]/g, "")}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error("classica_jobs_list_failed");
  }
  return ((data ?? []) as JobRow[]).map(mapClassicaJobRow);
}

export async function listClassicaAssignees(
  supabase: SupabaseClient,
): Promise<Array<{ id: string; label: string }>> {
  const { data, error } = await supabase
    .from("classica_production_jobs")
    .select("assignee_id, assignee_label")
    .not("assignee_id", "is", null);
  if (error) {
    return [];
  }
  const seen = new Map<string, string>();
  for (const row of data ?? []) {
    const id = nullableText(row.assignee_id);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.set(id, nullableText(row.assignee_label) ?? id);
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label }));
}

export async function getClassicaJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<ClassicaJobRecord | null> {
  const { data, error } = await supabase
    .from("classica_production_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }

  const [assetsResult, eventsResult, reviewsResult] = await Promise.all([
    supabase
      .from("classica_production_assets")
      .select("*")
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("classica_production_events")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("classica_production_reviews")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
  ]);

  const assets = await signAssets(
    supabase,
    (assetsResult.data ?? []) as Array<Record<string, unknown>>,
  );
  const events: ClassicaEventRecord[] = ((eventsResult.data ?? []) as JobRow[]).map((row) => ({
    id: String(row.id),
    action: String(row.action ?? ""),
    actorLabel: nullableText(row.actor_label),
    fromStatus: nullableText(row.from_status),
    toStatus: nullableText(row.to_status),
    payload:
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {},
    createdAt: String(row.created_at ?? ""),
  }));
  const reviews: ClassicaReviewRecord[] = ((reviewsResult.data ?? []) as JobRow[]).map((row) => ({
    id: String(row.id),
    decision: String(row.decision ?? ""),
    reason: nullableText(row.reason),
    comment: nullableText(row.comment),
    reviewerLabel: nullableText(row.reviewer_label),
    createdAt: String(row.created_at ?? ""),
  }));

  return { ...mapClassicaJobRow(data as JobRow), assets, events, reviews };
}

export async function getClassicaMasterPrompt(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("classica_production_prompts")
    .select("body")
    .eq("code", "packaging_master")
    .maybeSingle();
  if (error || !data?.body) {
    throw new Error("classica_prompt_missing");
  }
  return String(data.body);
}

export type ClassicaStatsBundle = {
  periods: Record<ClassicaStatsPeriod, ClassicaOperatorStats>;
  operators: Array<{ id: string; label: string; periods: Record<ClassicaStatsPeriod, ClassicaOperatorStats> }>;
};

export async function loadClassicaStats(
  supabase: SupabaseClient,
  userId: string,
  includeOperators: boolean,
): Promise<ClassicaStatsBundle> {
  const now = new Date();
  const month = moscowPeriodRange("month", now);
  const [eventsResult, accrualsResult] = await Promise.all([
    supabase
      .from("classica_production_events")
      .select("action, actor_id, actor_label, payload, created_at")
      .gte("created_at", month.from.toISOString()),
    supabase
      .from("classica_production_accruals")
      .select("operator_id, operator_label, amount_minor, status, created_at")
      .gte("created_at", month.from.toISOString()),
  ]);

  const events = ((eventsResult.data ?? []) as JobRow[]).map((row) => {
    const payload =
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {};
    return {
      action: String(row.action ?? ""),
      actorId: nullableText(row.actor_id),
      actorLabel: nullableText(row.actor_label),
      operatorId: nullableText(payload.operator_id),
      returnCount: typeof payload.return_count === "number" ? payload.return_count : null,
      createdAt: String(row.created_at ?? ""),
    };
  });
  const accruals = ((accrualsResult.data ?? []) as JobRow[]).map((row) => ({
    operatorId: String(row.operator_id ?? ""),
    operatorLabel: nullableText(row.operator_label),
    amountMinor: Number(row.amount_minor ?? 0),
    status: String(row.status ?? ""),
    createdAt: String(row.created_at ?? ""),
  }));

  const periods = {
    today: summarizeClassicaOperatorStats(
      userId,
      events,
      accruals,
      moscowPeriodRange("today", now).from,
      now,
    ),
    week: summarizeClassicaOperatorStats(
      userId,
      events,
      accruals,
      moscowPeriodRange("week", now).from,
      now,
    ),
    month: summarizeClassicaOperatorStats(userId, events, accruals, month.from, now),
  };

  const operators: ClassicaStatsBundle["operators"] = [];
  if (includeOperators) {
    const labels = new Map<string, string>();
    for (const event of events) {
      if (event.actorId && event.actorLabel) {
        labels.set(event.actorId, event.actorLabel);
      }
      if (event.operatorId) {
        labels.set(event.operatorId, labels.get(event.operatorId) ?? event.operatorId);
      }
    }
    for (const accrual of accruals) {
      if (accrual.operatorId) {
        labels.set(accrual.operatorId, accrual.operatorLabel ?? labels.get(accrual.operatorId) ?? accrual.operatorId);
      }
    }
    for (const [id, label] of labels) {
      operators.push({
        id,
        label,
        periods: {
          today: summarizeClassicaOperatorStats(id, events, accruals, moscowPeriodRange("today", now).from, now),
          week: summarizeClassicaOperatorStats(id, events, accruals, moscowPeriodRange("week", now).from, now),
          month: summarizeClassicaOperatorStats(id, events, accruals, month.from, now),
        },
      });
    }
  }

  return { periods, operators };
}

export { emptyClassicaOperatorStats };
