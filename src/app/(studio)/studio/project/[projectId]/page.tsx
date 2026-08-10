import { PersistedStudioProjectShell } from "@/components/studio/PersistedStudioProjectShell";
import { requireStudioAuthorAccess } from "@/lib/studio/access";

export const dynamic = "force-dynamic";

export default async function PersistedStudioProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ studioRecorderDebug?: string }>;
}) {
  const { projectId } = await params;
  const { studioRecorderDebug } = await searchParams;
  await requireStudioAuthorAccess(`/studio/project/${projectId}`);
  return (
    <PersistedStudioProjectShell
      projectId={projectId}
      recorderDebug={studioRecorderDebug === "1"}
    />
  );
}
