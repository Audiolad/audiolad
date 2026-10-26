import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { applyOverrides, validateOverride, FEATURE_VERSION } from "./features.mjs";
import { readMusicAnalyzerFeatures } from "./passport";
import { getMusicAnalyzerRun, MusicAnalyzerStorageError } from "./repository";

type OverrideRow = { id: number; patch: unknown; created_by: string; created_at: string; reason: string };

export async function getRunFeatures(runId: string) {
  const run = await getMusicAnalyzerRun(runId);
  const automatic = run?.status === "succeeded" ? readMusicAnalyzerFeatures(run.normalized_json) : null;
  if (!automatic) return null;
  const history: OverrideRow[] = [];
  for (let offset = 0; ; offset += 500) {
    if (offset >= 10000) throw new MusicAnalyzerStorageError("feature_history_limit");
    const { data, error } = await createServiceRoleClient().from("music_analyzer_feature_overrides")
      .select("id, patch, created_by, created_at, reason").eq("run_id", runId)
      .order("id", { ascending: true }).range(offset, offset + 499);
    if (error) throw new MusicAnalyzerStorageError("feature_history_unavailable");
    history.push(...(data ?? []) as OverrideRow[]);
    if (!data || data.length < 500) break;
  }
  return { automatic, effective: applyOverrides(automatic, history), history };
}

export async function appendRunFeatureOverride(input: { runId: string; userId: string; patch: unknown; reason: unknown }) {
  const patch = validateOverride(input.patch);
  if (typeof input.reason !== "string" || input.reason.trim().length < 3 || input.reason.trim().length > 1000) throw new Error("invalid_override");
  const run = await getMusicAnalyzerRun(input.runId);
  if (run?.status !== "succeeded" || !readMusicAnalyzerFeatures(run.normalized_json)) throw new Error("features_not_found");
  const { error } = await createServiceRoleClient().from("music_analyzer_feature_overrides").insert({
    run_id: input.runId, created_by: input.userId, patch, reason: input.reason.trim(), schema_version: FEATURE_VERSION,
  });
  if (error) throw new MusicAnalyzerStorageError("feature_override_failed");
  return getRunFeatures(input.runId);
}
