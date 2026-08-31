import { notFound } from "next/navigation";

import { AudiobookProjectWorkspace } from "@/components/studio/audiobooks/AudiobookProjectWorkspace";
import { StudioBrand } from "@/components/studio/StudioBrand";
import { StudioChromeNav } from "@/components/studio/StudioChromeNav";
import { AudiobookError, getAudiobookProject, listAudiobookChapters, parseAudiobookUuid } from "@/lib/audiobooks/server";
import { requireStudioAuthorAccess } from "@/lib/studio/access";

export const dynamic = "force-dynamic";

export default async function AudiobookProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [workspace] = await requireStudioAuthorAccess(`/studio/audiobooks/${projectId}`);
  let project;
  let chapters;
  try {
    const id = parseAudiobookUuid(projectId, "not_found");
    [project, chapters] = await Promise.all([
      getAudiobookProject(id, workspace.id),
      listAudiobookChapters(id, workspace.id),
    ]);
  } catch (error) {
    if (error instanceof AudiobookError && error.code === "not_found") notFound();
    throw error;
  }

  return (
    <main className="min-h-dvh bg-[#160d2d] px-5 py-6 text-white sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-6xl flex-col">
        <header className="flex flex-col gap-4 border-b border-white/15 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <StudioBrand />
          <StudioChromeNav accessMode="author" showStudioLauncher />
        </header>

        <AudiobookProjectWorkspace project={project} chapters={chapters} authorId={workspace.id} />
      </div>
    </main>
  );
}
