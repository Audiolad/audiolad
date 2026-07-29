import Link from "next/link";
import type { Metadata } from "next";

import HelpSearch from "@/components/help/HelpSearch";
import {
  listHelpCategories,
} from "@/lib/help/categories";
import { buildHelpHubMetadata } from "@/lib/help/metadata";
import { helpArticlePath, helpSupportHref } from "@/lib/help/paths";
import {
  getHelpSearchIndex,
  listHelpArticlesByCategory,
  listPopularHelpArticles,
} from "@/lib/help/registry";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildHelpHubMetadata();
}

export default function HelpHubPage() {
  const categories = listHelpCategories().filter(
    (category) => listHelpArticlesByCategory(category.id).length > 0,
  );
  const popular = listPopularHelpArticles();
  const searchIndex = getHelpSearchIndex();

  return (
    <div className="pb-10 pt-4">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[#25135c] sm:text-4xl">
          Справочный центр
        </h1>
        <p className="mt-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
          Найдите пошаговую инструкцию по работе с АудиоЛадом или задайте вопрос
          поддержке.
        </p>
      </header>

      <HelpSearch index={searchIndex} path="/help" />

      <section className="mt-12 max-w-3xl" aria-labelledby="help-categories-heading">
        <h2
          id="help-categories-heading"
          className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl"
        >
          Категории
        </h2>
        <ul className="mt-4 grid list-none gap-3 p-0 sm:grid-cols-2">
          {categories.map((category) => {
            const count = listHelpArticlesByCategory(category.id).length;
            const href = category.hubPath ?? `/help#category-${category.id}`;
            return (
              <li key={category.id} id={`category-${category.id}`}>
                <Link
                  href={href}
                  className="flex min-h-11 flex-col justify-center rounded-[20px] border border-[#e8def5] bg-white px-5 py-4 transition hover:border-[#c9b6ea] hover:bg-[#faf7ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                >
                  <span className="text-base font-semibold text-[#7042c5]">
                    {category.title}
                  </span>
                  <span className="mt-1 text-sm leading-6 text-[#4a3d73]">
                    {category.description}
                  </span>
                  <span className="mt-2 text-xs text-[#8c7dab]">
                    {count}{" "}
                    {count === 1
                      ? "инструкция"
                      : count < 5
                        ? "инструкции"
                        : "инструкций"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {categories
        .filter((category) => !category.hubPath)
        .map((category) => {
          const articles = listHelpArticlesByCategory(category.id);
          return (
            <section
              key={category.id}
              className="mt-10 max-w-3xl"
              aria-labelledby={`help-cat-list-${category.id}`}
            >
              <h2
                id={`help-cat-list-${category.id}`}
                className="text-lg font-semibold text-[#25135c]"
              >
                {category.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {articles.map((article) => (
                  <li key={article.id}>
                    <Link
                      href={helpArticlePath(article)}
                      className="block rounded-[16px] px-1 py-2 text-[15px] font-medium text-[#7042c5] underline-offset-2 hover:underline"
                    >
                      {article.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

      <section className="mt-12 max-w-3xl" aria-labelledby="help-popular-heading">
        <h2
          id="help-popular-heading"
          className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl"
        >
          Популярные инструкции
        </h2>
        <ul className="mt-4 space-y-3">
          {popular.map((article) => (
            <li key={article.id}>
              <Link
                href={helpArticlePath(article)}
                className="block rounded-[20px] border border-[#eadff8] bg-white px-4 py-4 transition hover:border-[#c9b6ea] hover:bg-[#faf7ff]"
              >
                <span className="font-semibold text-[#25135c]">{article.title}</span>
                <span className="mt-1 block text-sm leading-6 text-[#5f5484]">
                  {article.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 max-w-3xl rounded-[24px] border border-[#eadff8] bg-white px-5 py-5">
        <h2 className="text-lg font-semibold text-[#25135c]">Не нашли ответ?</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f5484]">
          Если инструкции не хватило, задайте вопрос поддержке. Ответ придёт на
          электронную почту — без обещания мгновенного ответа.
        </p>
        <Link
          href={helpSupportHref({ source: "/help" })}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[16px] bg-[#7042c5] px-5 text-sm font-semibold text-white"
        >
          Задать вопрос
        </Link>
      </section>
    </div>
  );
}
