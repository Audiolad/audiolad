import Link from "next/link";

import { StudioBrand } from "@/components/studio/StudioBrand";
import { StudioChromeNav } from "@/components/studio/StudioChromeNav";
import { requireStudioAuthorAccess } from "@/lib/studio/access";

export const dynamic = "force-dynamic";

export default async function NewAudiobookPage() {
  await requireStudioAuthorAccess("/studio/audiobooks/new");

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
            <div className="mt-8">
              <label
                htmlFor="audiobook-title"
                className="text-sm font-semibold text-[#eadfff]"
              >
                Название книги
              </label>
              <input
                id="audiobook-title"
                name="title"
                type="text"
                placeholder="Введите название книги"
                className="mt-3 min-h-12 w-full rounded-xl border border-[#a98be0] bg-[#21133d] px-4 text-base text-white outline-none placeholder:text-[#b9accd] focus:border-[#9bdab5] focus:ring-2 focus:ring-[#9bdab5]/30"
              />
            </div>
            <button
              type="button"
              disabled
              className="mt-8 inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-full bg-[#9bdab5] px-5 text-sm font-semibold text-[#1c1530] opacity-60"
            >
              Создать аудиокнигу
            </button>
            <p className="mt-4 text-sm leading-6 text-[#cfc4e4]">
              Создание и сохранение книг будет подключено на следующем этапе.
            </p>
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
