import { PersistedStudioProjectShell } from "@/components/studio/PersistedStudioProjectShell";
import { requireStudioAuthorAccess } from "@/lib/studio/access";

export const dynamic = "force-dynamic";

export default async function PersistedStudioProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireStudioAuthorAccess(`/studio/project/${projectId}`);
  return <PersistedStudioProjectShell projectId={projectId} />;
}
