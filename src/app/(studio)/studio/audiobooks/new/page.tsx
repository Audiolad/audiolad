import Link from "next/link";

import { AudiobookCreator } from "@/components/studio/audiobooks/AudiobookCreator";
import { StudioBrand } from "@/components/studio/StudioBrand";
import { StudioChromeNav } from "@/components/studio/StudioChromeNav";
import { requireStudioAuthorAccess } from "@/lib/studio/access";

export const dynamic = "force-dynamic";

export default async function NewAudiobookPage() {
  const [workspace] = await requireStudioAuthorAccess("/studio/audiobooks/new");

  return (
    <main className="min-h-dvh bg-[#160d2d] px-5 py-6 text-white sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-3xl flex-col">
        <header className="flex flex-col gap-4 border-b border-white/15 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <StudioBrand />
          <StudioChromeNav accessMode="author" showStudioLauncher />
        </header>

        <section className="flex flex-1 items-center py-12 sm:py-16">
          <div className="w-full rounded-[28px] border border-[#9074c7] bg-[#271647] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)] sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Новая аудиокнига
            </h1>
            <div className="mt-8"><AudiobookCreator authorId={workspace.id} /></div>
            <Link
              href="/studio/audiobooks"
              className="mt-8 inline-flex text-sm font-semibold text-[#9bdab5] underline underline-offset-4"
            >
              Вернуться к аудиокнигам
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
