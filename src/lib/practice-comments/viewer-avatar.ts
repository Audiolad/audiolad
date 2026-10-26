import { USER_AVATARS_BUCKET, isValidUserAvatarPath } from "@/lib/profile/avatar";
import { openListenerCommentAvatar } from "@/lib/practice-comments/avatar-proxy";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

function hiddenAvatar(): Response {
  return new Response(null, { status: 404 });
}

/** Profile photo of the signed-in listener, for the review form preview. */
export async function openSignedInListenerAvatar(request: Request): Promise<Response> {
  let reader;
  try {
    reader = await createClientFromRequest(request);
  } catch {
    return hiddenAvatar();
  }

  const {
    data: { user },
  } = await reader.auth.getUser();
  if (!user?.id) return hiddenAvatar();

  let service;
  try {
    service = createServiceRoleClient();
  } catch {
    return hiddenAvatar();
  }

  const { data: profile } = await service
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .maybeSingle();
  const path = profile?.avatar_path;
  if (!isValidUserAvatarPath(path, user.id)) return hiddenAvatar();

  const downloaded = await service.storage.from(USER_AVATARS_BUCKET).download(path);
  if (downloaded.error || !downloaded.data) return hiddenAvatar();

  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  return openListenerCommentAvatar({
    feed: { kind: "impression" },
    image: { bytes, contentType: downloaded.data.type || "image/webp" },
  });
}
