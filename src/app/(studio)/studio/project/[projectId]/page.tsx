import { PersistedStudioProjectShell } from "@/components/studio/PersistedStudioProjectShell";
import { requireStudioEditorAccess } from "@/lib/studio/guest-access";

export const dynamic = "force-dynamic";

export default async function PersistedStudioProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    studioRecorderDebug?: string;
    studioAudioDebug?: string;
  }>;
}) {
  const { projectId } = await params;
  const { studioRecorderDebug, studioAudioDebug } = await searchParams;
  const actor = await requireStudioEditorAccess(`/studio/project/${projectId}`);
  return (
    <PersistedStudioProjectShell
      projectId={projectId}
      accessMode={actor.kind}
      recorderDebug={studioRecorderDebug === "1"}
      audioDebug={studioAudioDebug === "1"}
    />
  );
}
