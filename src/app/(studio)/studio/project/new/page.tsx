import { Suspense } from "react";

import { GuestStudioOpenBeacon } from "@/components/studio/GuestStudioOpenBeacon";
import { StudioProjectCreator } from "@/components/studio/StudioProjectCreator";
import { requireStudioEditorAccess } from "@/lib/studio/guest-access";
import { resolveStudioHomeWorkspace } from "@/lib/studio/server/home-workspace";

export const dynamic = "force-dynamic";

export default async function NewStudioProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ studioRecorderDebug?: string; author?: string | string[] }>;
}) {
  const actor = await requireStudioEditorAccess("/studio/project/new");
  const { studioRecorderDebug, author } = await searchParams;
  const accessMode = actor.kind;
  const authorId = (
    await resolveStudioHomeWorkspace(actor, typeof author === "string" ? author : null)
  )?.id;

  return (
    <>
      <Suspense fallback={null}>
        <GuestStudioOpenBeacon accessMode={accessMode} />
      </Suspense>
      <StudioProjectCreator
        authorId={authorId}
        accessMode={accessMode}
        recorderDebug={studioRecorderDebug === "1"}
      />
    </>
  );
}
