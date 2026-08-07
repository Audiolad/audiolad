import Link from "next/link";

import { requireStudioAuthorAccess } from "@/lib/studio/access";

export const dynamic = "force-dynamic";

export default async function StudioLivePage() {
  await requireStudioAuthorAccess("/studio/live");

  return (
    <main className="min-h-dvh bg-[#160d2d] px-5 py-6 text-white sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-3xl flex-col justify-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#bda8e8]">
          АудиоЛад · Студия
        </p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Прямой аудиоэфир</h1>
        <span className="mt-5 w-fit rounded-full bg-[#4c3a6f] px-3 py-1 text-sm font-semibold text-[#d9c9f7]">
          Функция находится в разработке
        </span>
        <p className="mt-6 max-w-2xl text-base leading-7 text-[#d8cee9]">
          Здесь автор сможет проводить живые аудиоэфиры. После завершения запись
          эфира будет сохраняться как проект Студии для дальнейшего
          редактирования, экспорта и публикации.
        </p>
        <nav className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/studio"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#9bdab5] px-5 text-sm font-semibold text-[#1c1530]"
          >
            Вернуться в Studio
          </Link>
          <Link
            href="/author-dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 px-5 text-sm font-semibold text-white"
          >
            Вернуться в кабинет автора
          </Link>
        </nav>
      </div>
    </main>
  );
}
