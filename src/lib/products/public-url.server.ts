import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePracticePublicPath } from "./paths";
import { getPracticeByAuthorAndSlug } from "./lookup";

export async function canExposePracticeUrl(db: SupabaseClient | (() => SupabaseClient), url: string): Promise<boolean> {
  const path = parsePracticePublicPath(new URL(url).pathname);
  if (!path) return true;
  const result = await getPracticeByAuthorAndSlug(typeof db === "function" ? db() : db, path.authorSlug, path.productSlug);
  return !result.error && Boolean(result.practice);
}
