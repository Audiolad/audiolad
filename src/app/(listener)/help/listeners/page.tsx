import Link from "next/link";
import type { Metadata } from "next";

import HelpSearch from "@/components/help/HelpSearch";
import { buildHelpAudienceHubMetadata } from "@/lib/help/metadata";
import { helpArticlePath, helpHubHref, helpSupportHref } from "@/lib/help/paths";
import {
  getHelpSearchIndex,
  listHelpArticlesByCategory,
} from "@/lib/help/registry";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildHelpAudienceHubMetadata("listeners");
}

export default function HelpListenersHubPage() {
  const articles = [
    ...listHelpArticlesByCategory("getting-started"),
    ...listHelpArticlesByCategory("troubleshooting"),
  ];
  const searchIndex = getHelpSearchIndex();

  return (
    <div className="pb-10 pt-4">
      <nav aria-label="Хлебные крошки" className="text-sm text-[#7d70a2]">
        <Link href={helpHubHref()} className="font-medium text-[#7042c5] underline-offset-2 hover:underline">
          Справочный центр
        </Link>
        <span className="mx-1.5" aria-hidden="true">/</span>
        <span className="text-[#25135c]">Для слушателей</span>
      </nav>

      <header className="mt-6 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[#25135c] sm:text-4xl">
          Справка для слушателей
        </h1>
        <p className="mt-4 text-base leading-7 text-[#4a3d73]">
          Регистрация, вход, Аудиотека, установка приложения и типичные проблемы.
        </p>
      </header>

      <HelpSearch index={searchIndex} path="/help/listeners" />

      <ul className="mt-10 max-w-3xl space-y-3">
        {articles.map((article) => (
          <li key={article.id}>
            <Link
              href={helpArticlePath(article)}
              className="block rounded-[20px] border border-[#eadff8] bg-white px-4 py-4"
            >
              <span className="font-semibold text-[#25135c]">{article.title}</span>
              <span className="mt-1 block text-sm leading-6 text-[#5f5484]">
                {article.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-10">
        <Link
          href={helpSupportHref({ source: "/help/listeners" })}
          className="inline-flex min-h-11 items-center rounded-[16px] bg-[#7042c5] px-5 text-sm font-semibold text-white"
        >
          Задать вопрос
        </Link>
      </div>
    </div>
  );
}
