import Link from "next/link";

import { StudioBrand } from "@/components/studio/StudioBrand";
import { StudioChromeNav } from "@/components/studio/StudioChromeNav";
import { listAudiobookProjects } from "@/lib/audiobooks/server";
import { requireStudioAuthorAccess } from "@/lib/studio/access";

export const dynamic = "force-dynamic";

export default async function AudiobooksPage() {
  const [workspace] = await requireStudioAuthorAccess("/studio/audiobooks");
  const projects = await listAudiobookProjects(workspace.id);

  return (
    <main className="min-h-dvh bg-[#160d2d] px-5 py-6 text-white sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-5xl flex-col">
        <header className="flex flex-col gap-4 border-b border-white/15 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <StudioBrand />
          <StudioChromeNav accessMode="author" showStudioLauncher />
        </header>

        <section className="flex flex-1 flex-col py-12 sm:py-16">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Студия аудиокниг
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#ddd2f5]">
                Записывайте книги своим голосом по главам, продолжайте запись с
                места остановки и получайте готовые MP3.
              </p>
            </div>
            <Link
              href="/studio/audiobooks/new"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[#9bdab5] px-5 text-sm font-semibold text-[#1c1530]"
            >
              Создать аудиокнигу
            </Link>
          </div>

          {projects.length === 0 ? <section className="mt-10 flex flex-1 items-center justify-center rounded-[28px] border border-white/15 bg-[#21133d] p-6 text-center sm:p-10">
            <div className="max-w-lg">
              <h2 className="text-2xl font-semibold">У вас пока нет аудиокниг</h2>
              <p className="mt-4 leading-7 text-[#cfc4e4]">
                Создайте первую книгу – добавляйте главы и записывайте их в
                удобном темпе.
              </p>
              <Link
                href="/studio/audiobooks/new"
                className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-[#9bdab5] px-5 text-sm font-semibold text-[#1c1530]"
              >
                Создать первую аудиокнигу
              </Link>
            </div>
          </section>
          ) : <section className="mt-10 grid gap-5 sm:grid-cols-2">
            {projects.map((project) => <article key={project.id} className="rounded-[28px] border border-white/15 bg-[#21133d] p-6">
              <h2 className="text-xl font-semibold">{project.title}</h2>
              <p className="mt-3 text-sm text-[#cfc4e4]">Глав: {project.chapter_count}</p>
              <p className="mt-1 text-sm text-[#cfc4e4]">Изменено: {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(project.updated_at))}</p>
              <Link href={`/studio/audiobooks/${project.id}`} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[#9bdab5] px-5 text-sm font-semibold text-[#1c1530]">Открыть</Link>
            </article>)}
          </section>}
        </section>
      </div>
    </main>
  );
}
