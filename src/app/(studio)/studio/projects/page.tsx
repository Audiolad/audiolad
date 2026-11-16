import Link from "next/link";
import { Suspense } from "react";

import { GuestStudioOpenBeacon } from "@/components/studio/GuestStudioOpenBeacon";
import { StudioAuthorSelectionSync } from "@/components/studio/StudioAuthorSelectionSync";
import { StudioBrand } from "@/components/studio/StudioBrand";
import { StudioChromeNav } from "@/components/studio/StudioChromeNav";
import { StudioProjectLibrary } from "@/components/studio/StudioProjectLibrary";
import { requireStudioEditorAccess } from "@/lib/studio/guest-access";
import { resolveStudioHomeWorkspace } from "@/lib/studio/server/home-workspace";

export const dynamic = "force-dynamic";

export default async function StudioProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ author?: string | string[] }>;
}) {
  const actor = await requireStudioEditorAccess("/studio/projects");
  const accessMode = actor.kind;
  const { author } = await searchParams;
  const workspace = await resolveStudioHomeWorkspace(
    actor,
    typeof author === "string" ? author : null,
  );
  const authorId = workspace?.id;
  const syncSlug =
    workspace && typeof author === "string" && author.trim() === workspace.slug
      ? workspace.slug
      : null;
  const otherWorkspaces =
    actor.kind === "author" && workspace
      ? actor.workspaces.filter((item) => item.id !== workspace.id)
      : [];

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
        {syncSlug ? <StudioAuthorSelectionSync slug={syncSlug} /> : null}
        {workspace ? (
          <section className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[#ddd2f5]">
            <span>
              Автор: <strong className="font-semibold text-white">{workspace.name}</strong>
            </span>
            {otherWorkspaces.length > 0 ? (
              <details className="relative">
                <summary className="cursor-pointer font-semibold text-[#9bdab5] underline underline-offset-4">
                  Сменить автора
                </summary>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {otherWorkspaces.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/studio/projects?author=${encodeURIComponent(item.slug)}`}
                        className="inline-flex min-h-9 items-center rounded-full border border-white/25 px-3 text-sm text-white hover:bg-white/10"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ) : null}
        <StudioProjectLibrary
          authorId={authorId}
          authorSlug={workspace?.slug}
          accessMode={accessMode}
        />
      </div>
    </main>
  );
}
