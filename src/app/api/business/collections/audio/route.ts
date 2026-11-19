import { authorizedCollectionTrack } from "@/lib/business-collections/load.server";
import { serveCollectionAudio } from "@/lib/business-collections/audio.mjs";
import { isCoffeeHostRequest } from "@/lib/business-app/host";
import { signWorkspaceAudio } from "@/lib/business-workspace/sign.server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return serveCollectionAudio(request, {
    hostAllowed: isCoffeeHostRequest(request.headers),
    authorize: authorizedCollectionTrack,
    sign: (track) => signWorkspaceAudio(track, new Set([track])),
    fetchAudio: fetch,
  });
}
