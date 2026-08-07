import StudioEditorShell from "@/components/studio/StudioEditorShell";
import { requireStudioAuthorAccess } from "@/lib/studio/access";

export const dynamic = "force-dynamic";

export default async function NewStudioProjectPage() {
  await requireStudioAuthorAccess("/studio/project/new");

  return <StudioEditorShell />;
}
