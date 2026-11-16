import { Suspense } from "react";

import { GuestStudioOpenBeacon } from "@/components/studio/GuestStudioOpenBeacon";
import { StudioBrand } from "@/components/studio/StudioBrand";
import { StudioChromeNav } from "@/components/studio/StudioChromeNav";
import { StudioProjectLibrary } from "@/components/studio/StudioProjectLibrary";
import { requireStudioEditorAccess } from "@/lib/studio/guest-access";
import { resolveStudioHomeAuthorId } from "@/lib/studio/server/home-workspace";

export const dynamic = "force-dynamic";

export default async function StudioProjectsPage() {
  const actor = await requireStudioEditorAccess("/studio/projects");
  const accessMode = actor.kind;
  const authorId = await resolveStudioHomeAuthorId(actor);

  return (
    <main className="min-h-dvh bg-[#160d2d] px-5 py-6 text-white sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-5xl flex-col">
        <header className="flex flex-col gap-4 border-b border-white/15 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <StudioBrand />
          <StudioChromeNav accessMode={accessMode} showStudioLauncher />
        </header>

        <Suspense fallback={null}>
          <GuestStudioOpenBeacon accessMode={accessMode} />
        </Suspense>
        <StudioProjectLibrary authorId={authorId} accessMode={accessMode} />
      </div>
    </main>
  );
}
