import Link from "next/link";

import { StudioBrand } from "@/components/studio/StudioBrand";
import { StudioProjectLibrary } from "@/components/studio/StudioProjectLibrary";
import { requireStudioAuthorAccess } from "@/lib/studio/access";

export const dynamic = "force-dynamic";

export default async function StudioProjectsPage() {
  const [workspace] = await requireStudioAuthorAccess("/studio/projects");

  return (
    <main className="min-h-dvh bg-[#160d2d] px-5 py-6 text-white sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-5xl flex-col">
        <header className="flex flex-col gap-4 border-b border-white/15 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <StudioBrand />
          <nav className="flex flex-wrap gap-2">
            <Link
              href="/studio/help"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#a98be0] px-4 text-sm font-semibold text-[#eadfff] hover:bg-white/10"
            >
              Инструкция
            </Link>
            <Link
              href="/studio"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/25 px-4 text-sm font-semibold text-white"
            >
              ← В Studio
            </Link>
            <Link
              href="/author-dashboard"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#7051ae] px-4 text-sm font-semibold text-white"
            >
              Вернуться в кабинет автора
            </Link>
            <Link
              href="/profile"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/25 px-4 text-sm font-semibold text-white"
            >
              Вернуться в АудиоЛад
            </Link>
          </nav>
        </header>

        <StudioProjectLibrary authorId={workspace.id} />
      </div>
    </main>
  );
}
