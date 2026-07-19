import BottomNav from "@/components/BottomNav";
import AuthorListCard from "@/components/authors/AuthorListCard";
import {
  PUBLIC_AUTHORS_SORT_LABELS,
  type PublicAuthorSort,
} from "@/lib/authors/public-list";
import { loadPublicAuthorsList } from "@/lib/authors/public-list-data";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <path
        d="M15 5 8 12l7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <circle
        cx="11"
        cy="11"
        r="7"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="m16.5 16.5 4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default async function AuthorsPage() {
  const sort: PublicAuthorSort = "products";
  const supabase = await createClient();
  const { authors, error } = await loadPublicAuthorsList(supabase, { sort });

  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface lg:max-w-[1200px] ${platformMobileShellClass}`}
      >
        <div className="px-5 pt-5 lg:px-10 lg:pt-8">
          <header className="flex items-center justify-between">
            <Link
              href="/catalog"
              aria-label="Назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              <BackIcon />
            </Link>

            <div className="text-center">
              <h1 className="text-[26px] font-semibold">Авторы</h1>
              <p className="mt-1 text-xs text-[#7d70a2]">
                Практики от проверенных специалистов
              </p>
            </div>

            <button
              type="button"
              aria-label="Поиск"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <SearchIcon />
            </button>
          </header>

          <section className="mt-6 rounded-[26px] bg-gradient-to-br from-[#7042c5] to-[#a27ad9] p-5 text-white shadow-[0_14px_34px_rgba(96,59,168,0.22)]">
            <p className="text-sm text-white/75">Авторы АудиоЛада</p>

            <h2 className="mt-2 text-[24px] font-semibold leading-8">
              Найдите голос, которому хочется доверять
            </h2>

            <p className="mt-3 text-sm leading-6 text-white/75">
              У каждого автора свой подход, тематика и атмосфера практик.
            </p>
          </section>

          <section className="mt-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[21px] font-semibold">
                {authors.length > 0
                  ? `Все авторы — ${authors.length}`
                  : "Все авторы"}
              </h2>

              <p className="text-sm font-medium text-[#7042c5]">
                {PUBLIC_AUTHORS_SORT_LABELS[sort]}
              </p>
            </div>

            {error ? (
              <div className="mt-5 rounded-[24px] border border-[#f0d9dc] bg-[#fff7f8] p-5 text-sm leading-6 text-[#8a4a57]">
                Не удалось загрузить список авторов. Попробуйте обновить
                страницу позже.
              </div>
            ) : authors.length === 0 ? (
              <div className="mt-5 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] p-8 text-center">
                <p className="text-base font-medium text-[#7042c5]">
                  Авторы скоро появятся
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-5 lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0 xl:grid-cols-3">
                {authors.map((author) => (
                  <AuthorListCard key={author.id} author={author} />
                ))}
              </div>
            )}
          </section>

          <section className="mt-8 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] p-5">
            <h2 className="text-lg font-semibold text-[#7042c5]">
              Хотите стать автором?
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#70628e]">
              Размещайте медитации, энергопрактики, молитвы, программы и
              аудиокурсы.
            </p>

            <Link
              href="/profile"
              className="mt-4 inline-flex min-h-11 items-center rounded-[16px] bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              Узнать подробнее
            </Link>
          </section>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
