import { StudioProjectCreator } from "@/components/studio/StudioProjectCreator";
import { requireStudioAuthorAccess } from "@/lib/studio/access";

export const dynamic = "force-dynamic";

export default async function NewStudioProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ studioRecorderDebug?: string }>;
}) {
  const [workspace] = await requireStudioAuthorAccess("/studio/project/new");
  const { studioRecorderDebug } = await searchParams;

  return (
    <StudioProjectCreator
      authorId={workspace.id}
      recorderDebug={studioRecorderDebug === "1"}
    />
  );
}
