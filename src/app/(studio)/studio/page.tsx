import Link from "next/link";

import { StudioBrand } from "@/components/studio/StudioBrand";
import { requireStudioAuthorAccess } from "@/lib/studio/access";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  await requireStudioAuthorAccess("/studio");

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

        <section className="flex flex-1 items-center py-12 sm:py-16">
          <div className="w-full">
            <p className="text-sm font-medium text-[#9bdab5]">Выберите режим работы</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Создавайте аудиопрактики, аудиокниги и проводите аудиоэфиры
            </h2>
            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              <article className="flex min-h-80 flex-col rounded-[28px] border border-[#9074c7] bg-[#271647] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)] sm:p-8">
                <div>
                  <h3 className="text-2xl font-semibold">Студия аудиопрактик</h3>
                  <p className="mt-4 max-w-lg leading-7 text-[#ddd2f5]">
                    Записывайте голос, добавляйте музыку и создавайте готовые
                    аудиопрактики без сложного монтажа.
                  </p>
                </div>
                <Link
                  href="/studio/projects"
                  className="mt-8 inline-flex min-h-11 w-fit items-center justify-center rounded-full bg-[#9bdab5] px-5 text-sm font-semibold text-[#1c1530] sm:mt-auto"
                >
                  Открыть студию
                </Link>
              </article>

              <article className="flex min-h-80 flex-col rounded-[28px] border border-[#9074c7] bg-[#271647] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)] sm:p-8">
                <div>
                  <h3 className="text-2xl font-semibold">Студия аудиокниг</h3>
                  <p className="mt-4 max-w-lg leading-7 text-[#ddd2f5]">
                    Записывайте аудиокниги по главам и создавайте готовые
                    аудиофайлы без сложного монтажа.
                  </p>
                </div>
                <Link
                  href="/studio/audiobooks"
                  className="mt-8 inline-flex min-h-11 w-fit items-center justify-center rounded-full bg-[#9bdab5] px-5 text-sm font-semibold text-[#1c1530] sm:mt-auto"
                >
                  Создать аудиокнигу
                </Link>
              </article>

              <article className="flex min-h-80 flex-col rounded-[28px] border border-white/15 bg-[#21133d] p-6 sm:p-8">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-2xl font-semibold">Студия аудиоэфиров</h3>
                    <span className="rounded-full bg-[#4c3a6f] px-3 py-1 text-xs font-semibold text-[#d9c9f7]">
                      В разработке
                    </span>
                  </div>
                  <p className="mt-4 max-w-lg leading-7 text-[#cfc4e4]">
                    Проводите аудиоэфиры, сохраняйте запись и продолжайте
                    работу с ней в студии.
                  </p>
                </div>
                <Link
                  href="/studio/live"
                  className="mt-8 inline-flex min-h-11 w-fit items-center justify-center rounded-full border border-[#8065ad] px-5 text-sm font-semibold text-white sm:mt-auto"
                >
                  Подробнее
                </Link>
              </article>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
