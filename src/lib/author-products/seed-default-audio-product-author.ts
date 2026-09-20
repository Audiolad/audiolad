import type { SupabaseClient } from "@supabase/supabase-js";

function normalizeAudioProductAuthor(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * First non-empty audio_product_author seeds authors.default_audio_product_author
 * only when the workspace default is still NULL. Never overwrites an existing default.
 * Non-critical side effect: failures are logged and must not roll back product save.
 */
export async function seedAuthorDefaultAudioProductAuthorIfAbsent(
  supabase: SupabaseClient,
  input: {
    authorId: string;
    audioProductAuthor: string | null | undefined;
  },
): Promise<void> {
  const value = normalizeAudioProductAuthor(input.audioProductAuthor);
  if (!value || !input.authorId) {
    return;
  }

  const { error } = await supabase
    .from("authors")
    .update({ default_audio_product_author: value })
    .eq("id", input.authorId)
    .is("default_audio_product_author", null);

  if (error) {
    console.error("author_default_audio_product_author_seed_failed", {
      authorId: input.authorId,
      code: error.code ?? "internal_error",
      message: error.message,
    });
  }
}
