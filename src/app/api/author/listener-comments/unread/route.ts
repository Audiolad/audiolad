import { countUnreadAuthorImpressions } from "@/lib/practice-comments/service";
import { commentActor, commentStore, runCommentAction } from "@/lib/practice-comments/server";

export async function GET(request: Request) {
  return runCommentAction(async () =>
    countUnreadAuthorImpressions(await commentStore(request), await commentActor(request)),
  );
}
