import Link from "next/link";
import type { Metadata } from "next";

import HelpSearch from "@/components/help/HelpSearch";
import { listHelpCategories } from "@/lib/help/categories";
import { buildHelpAudienceHubMetadata } from "@/lib/help/metadata";
import { helpArticlePath, helpHubHref, helpSupportHref } from "@/lib/help/paths";
import {
  getHelpSearchIndex,
  listHelpArticlesByCategory,
} from "@/lib/help/registry";
import type { HelpCategoryId } from "@/lib/help/types";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildHelpAudienceHubMetadata("authors");
}

const AUTHOR_CATEGORY_IDS: HelpCategoryId[] = [
  "authors",
  "personal-work",
  "promotion",
  "finance",
];

type PageProps = {
  searchParams?: Promise<{ author?: string }>;
};

function withAuthor(href: string, authorSlug: string | null): string {
  if (!authorSlug) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}author=${encodeURIComponent(authorSlug)}`;
}

export default async function HelpAuthorsHubPage({ searchParams }: PageProps) {
  const authorSlug = ((await searchParams) ?? {}).author?.trim() || null;
  const searchIndex = getHelpSearchIndex();
  const categories = listHelpCategories().filter((category) =>
    AUTHOR_CATEGORY_IDS.includes(category.id),
  );

  return (
    <div className="pb-10 pt-4">
      <nav aria-label="Хлебные крошки" className="text-sm text-[#7d70a2]">
        <Link href={helpHubHref()} className="font-medium text-[#7042c5] underline-offset-2 hover:underline">
          Справочный центр
        </Link>
        <span className="mx-1.5" aria-hidden="true">/</span>
        <span className="text-[#25135c]">Для авторов</span>
      </nav>

      <header className="mt-6 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[#25135c] sm:text-4xl">
          Справка для авторов
        </h1>
        <p className="mt-4 text-base leading-7 text-[#4a3d73]">
          Пошаговые инструкции по продуктам, личной работе, продвижению и финансам.
        </p>
      </header>

      <HelpSearch index={searchIndex} path="/help/authors" />

      {categories.map((category) => {
        const articles = listHelpArticlesByCategory(category.id);
        if (articles.length === 0) return null;
        return (
          <section key={category.id} className="mt-10 max-w-3xl">
            <h2 className="text-xl font-semibold text-[#25135c]">{category.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#5f5484]">
              {category.description}
            </p>
            <ul className="mt-4 space-y-3">
              {articles.map((article) => (
                <li key={article.id}>
                  <Link
                    href={withAuthor(helpArticlePath(article), authorSlug)}
                    className="block rounded-[20px] border border-[#eadff8] bg-white px-4 py-4"
                  >
                    <span className="font-semibold text-[#25135c]">
                      {article.title}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-[#5f5484]">
                      {article.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <div className="mt-10">
        <Link
          href={helpSupportHref({
            source: "/help/authors",
            author: authorSlug ?? undefined,
          })}
          className="inline-flex min-h-11 items-center rounded-[16px] bg-[#7042c5] px-5 text-sm font-semibold text-white"
        >
          Задать вопрос
        </Link>
      </div>
    </div>
  );
}
