import { USER_AVATARS_BUCKET, isValidUserAvatarPath } from "@/lib/profile/avatar";
import { listenerImpressionInFeed, openListenerCommentAvatar } from "@/lib/practice-comments/avatar-proxy";
import { openSignedInListenerAvatar } from "@/lib/practice-comments/viewer-avatar";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const COMMENT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ commentId: string }>;
};

function hiddenAvatar(): Response {
  return new Response(null, { status: 404 });
}

export async function GET(request: Request, context: RouteContext) {
  const { commentId } = await context.params;
  if (commentId === "me") {
    return openSignedInListenerAvatar(request);
  }
  if (!COMMENT_ID_RE.test(commentId)) {
    return hiddenAvatar();
  }

  let reader;
  try {
    reader = await createClientFromRequest(request);
  } catch {
    return hiddenAvatar();
  }

  const { data: feed, error: feedError } = await reader
    .from("practice_listener_comment_feed")
    .select("id, kind")
    .eq("id", commentId)
    .maybeSingle();
  if (feedError || !listenerImpressionInFeed(feed)) {
    return hiddenAvatar();
  }

  let service;
  try {
    service = createServiceRoleClient();
  } catch {
    return hiddenAvatar();
  }

  const { data: comment, error } = await service
    .from("practice_listener_comments")
    .select("user_id")
    .eq("id", commentId)
    .maybeSingle();
  if (error || !comment?.user_id) {
    return hiddenAvatar();
  }

  const { data: profile } = await service
    .from("profiles")
    .select("avatar_path")
    .eq("id", comment.user_id)
    .maybeSingle();
  const path = profile?.avatar_path;
  if (!isValidUserAvatarPath(path, comment.user_id)) {
    return hiddenAvatar();
  }

  const downloaded = await service.storage.from(USER_AVATARS_BUCKET).download(path);
  if (downloaded.error || !downloaded.data) {
    return hiddenAvatar();
  }

  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  return openListenerCommentAvatar({
    feed: { kind: "impression" },
    image: { bytes, contentType: downloaded.data.type || "image/webp" },
  });
}
