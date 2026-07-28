import type { Metadata } from "next";

import LegalPageShell from "@/components/legal/LegalPageShell";
import {
  buildAuthorTermsDocumentBlocks,
  getAuthorTermsPublicMeta,
} from "@/lib/author-terms/document-view";
import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

const meta = getAuthorTermsPublicMeta();
const canonical = `${PRODUCTION_APP_ORIGIN}/author-terms`;

export const metadata: Metadata = {
  title: "Авторские условия сотрудничества платформы «АудиоЛад»",
  description:
    "Условия регулируют размещение продуктов, предоставление доступа слушателям и выплату авторского вознаграждения.",
  alternates: {
    canonical: "/author-terms",
  },
  openGraph: {
    title: "Авторские условия сотрудничества платформы «АудиоЛад»",
    description:
      "Условия регулируют размещение продуктов, предоставление доступа слушателям и выплату авторского вознаграждения.",
    url: canonical,
  },
};

const bodyClassName = "text-[15px] leading-7 text-[#4c3d78]";
const sectionTitleClassName =
  "text-[22px] font-semibold leading-tight text-[#25135c]";

function formatPublishedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(date);
}

export default function AuthorTermsPage() {
  const blocks = buildAuthorTermsDocumentBlocks();

  return (
    <LegalPageShell>
      <h1 className="mt-6 text-[28px] font-semibold leading-tight text-[#25135c] lg:text-[32px]">
        Авторские условия сотрудничества платформы «АудиоЛад»
      </h1>

      <p className="mt-3 text-[17px] leading-6 text-[#4c3d78] lg:text-[18px]">
        Условия регулируют размещение продуктов, предоставление доступа
        слушателям и выплату авторского вознаграждения.
      </p>

      <p className="mt-3 text-sm leading-6 text-[#8c7dab]">
        Версия: {meta.version}
        <br />
        Дата публикации: {formatPublishedDate(meta.publishedAt)}
        <br />
        Дата вступления в силу: {formatPublishedDate(meta.effectiveAt)}
      </p>

      <nav
        className="mt-8 rounded-[22px] border border-[#eadff8] bg-[#faf6ff] p-5"
        aria-label="Оглавление"
      >
        <p className="text-sm font-semibold text-[#25135c]">Содержание</p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[15px] leading-6 text-[#4c3d78]">
          {meta.toc.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="text-[#7042c5] underline-offset-2 hover:underline"
              >
                {item.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 space-y-4">
        {blocks.map((block, index) => {
          if (block.type === "heading") {
            if (block.level === 1) {
              return (
                <h2
                  key={`h1-${index}`}
                  className="pt-4 text-[20px] font-semibold leading-tight text-[#25135c]"
                >
                  {block.text}
                </h2>
              );
            }

            return (
              <h2
                key={block.id ?? `h2-${index}`}
                id={block.id}
                className={`${sectionTitleClassName} scroll-mt-24 pt-6`}
              >
                {block.text}
              </h2>
            );
          }

          if (block.type === "list") {
            return (
              <ul
                key={`list-${index}`}
                className="list-disc space-y-2 pl-5 marker:text-[#7042c5]"
              >
                {block.items.map((item) => (
                  <li key={item} className={bodyClassName}>
                    {item}
                  </li>
                ))}
              </ul>
            );
          }

          return (
            <p key={`p-${index}`} className={bodyClassName}>
              {block.text}
            </p>
          );
        })}
      </div>
    </LegalPageShell>
  );
}
