import { USER_AVATARS_BUCKET, isValidUserAvatarPath } from "@/lib/profile/avatar";
import { commentActor } from "@/lib/practice-comments/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const COMMENT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ commentId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { commentId } = await context.params;
  if (!COMMENT_ID_RE.test(commentId)) {
    return new Response(null, { status: 404 });
  }

  let service;
  try {
    service = createServiceRoleClient();
  } catch {
    return new Response(null, { status: 404 });
  }

  const { data: comment, error } = await service
    .from("practice_listener_comments")
    .select("id, user_id, kind, status, deleted_at")
    .eq("id", commentId)
    .maybeSingle();
  if (error || !comment || comment.kind !== "impression" || comment.deleted_at || comment.status === "deleted") {
    return new Response(null, { status: 404 });
  }

  if (comment.status !== "published") {
    const actor = await commentActor(request);
    if (!actor.userId || actor.userId !== comment.user_id) {
      return new Response(null, { status: 404 });
    }
  }

  const { data: profile } = await service
    .from("profiles")
    .select("avatar_path")
    .eq("id", comment.user_id)
    .maybeSingle();
  const path = profile?.avatar_path;
  if (!isValidUserAvatarPath(path, comment.user_id)) {
    return new Response(null, { status: 404 });
  }

  const downloaded = await service.storage.from(USER_AVATARS_BUCKET).download(path);
  if (downloaded.error || !downloaded.data) {
    return new Response(null, { status: 404 });
  }

  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": downloaded.data.type || "image/webp",
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
