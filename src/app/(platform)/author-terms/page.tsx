import type { Metadata } from "next";

import LegalPageShell from "@/components/legal/LegalPageShell";
import { buildAuthorTermsDocumentBlocks } from "@/lib/author-terms/document-view";
import {
  LEGACY_AUTHOR_TERMS_EDITION,
  APPROVED_AUTHOR_TERMS_EDITIONS,
  findAcceptableEditionByHash,
  findPublishedEditionByVersion,
  type ApprovedAuthorTermsEdition,
} from "@/lib/author-terms/editions";
import { resolveEditionDisplayDates, type EditionDateRow, type EditionDisplayDates } from "@/lib/author-terms/edition-dates";
import { getCurrentAuthorTermsVersion, listAuthorTermsVersionDates } from "@/lib/author-terms/service";
import { isUnifiedAgreementEnabled } from "@/lib/author-terms/unified-agreement-flag";
import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

// The displayed edition follows the DB current edition when the unified-agreement flag is on.
export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ edition?: string }> };

async function resolveDisplayedEdition(
  requestedVersion: string | undefined,
): Promise<{
  edition: ApprovedAuthorTermsEdition;
  isCurrent: boolean;
  current: ApprovedAuthorTermsEdition;
  dates: EditionDisplayDates;
  dbHashes: readonly string[];
  dbRows: readonly EditionDateRow[];
}> {
  if (!isUnifiedAgreementEnabled()) {
    // Flag off: 1.2 only, code dates (equal to its DB row), no DB read – unchanged behaviour.
    const legacy = LEGACY_AUTHOR_TERMS_EDITION;
    return {
      edition: legacy,
      isCurrent: true,
      current: legacy,
      dates: resolveEditionDisplayDates({
        contentHash: legacy.contentHash,
        codePublishedAt: legacy.publishedAt,
        codeEffectiveAt: legacy.effectiveAt,
        rows: [],
      }),
      dbHashes: [],
      dbRows: [],
    };
  }
  const [row, rows] = await Promise.all([getCurrentAuthorTermsVersion(), listAuthorTermsVersionDates()]);
  const current = findAcceptableEditionByHash(row?.content_hash, true) ?? LEGACY_AUTHOR_TERMS_EDITION;
  const dbHashes = rows.map((item) => item.content_hash);
  // Only editions present in the DB can be opened (2.1 stays invisible until sql/04 inserts it).
  const requested = findPublishedEditionByVersion(requestedVersion, dbHashes);
  const edition = requested ?? current;
  // Dates always from the DB row (2.0: set at the switch); never a hardcoded 2.0 date.
  const dates = resolveEditionDisplayDates({
    contentHash: edition.contentHash,
    codePublishedAt: edition.publishedAt,
    codeEffectiveAt: edition.effectiveAt,
    rows,
  });
  return { edition, isCurrent: edition.versionId === current.versionId, current, dates, dbHashes, dbRows: rows };
}

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

export default async function AuthorTermsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const { edition, isCurrent, current, dates, dbHashes, dbRows } = await resolveDisplayedEdition(params.edition?.trim());
  const meta = edition;
  const blocks = buildAuthorTermsDocumentBlocks(edition.text, edition.frontMatterMarker);
  const otherEditions = isUnifiedAgreementEnabled()
    ? [
        current,
        // Earlier unified editions in the DB (2.0 after the 2.1 switch), then 1.2.
        ...APPROVED_AUTHOR_TERMS_EDITIONS.filter(
          (item) =>
            item.coversBusiness &&
            dbHashes.includes(item.contentHash) &&
            // never list a not-yet-current newer edition (pending): it is only reachable once current
            resolveEditionDisplayDates({ contentHash: item.contentHash, codePublishedAt: null, codeEffectiveAt: null, rows: dbRows }).kind === "dated",
        ).reverse(),
        LEGACY_AUTHOR_TERMS_EDITION,
      ].filter(
        (item, index, list) => item.versionId !== edition.versionId && list.findIndex((x) => x.versionId === item.versionId) === index,
      )
    : [];

  return (
    <LegalPageShell>
      <h1 className="mt-6 text-[28px] font-semibold leading-tight text-[#25135c] lg:text-[32px]">
        {edition.coversBusiness
          ? "Единое коммерческое соглашение с правообладателем"
          : "Авторские условия сотрудничества платформы «АудиоЛад»"}
      </h1>

      <p className="mt-3 text-[17px] leading-6 text-[#4c3d78] lg:text-[18px]">
        {edition.coversBusiness
          ? "Одно соглашение на все способы монетизации на Платформе, включая «АудиоЛад Бизнес». Отдельные заявления и согласия по альбомам и трекам не нужны."
          : "Условия регулируют размещение продуктов, предоставление доступа слушателям и выплату авторского вознаграждения."}
      </p>

      {!isCurrent && dates.kind === "pending" ? (
        <p
          role="note"
          data-testid="author-terms-pending-edition"
          className="mt-4 rounded-2xl border border-[#d9cff1] bg-[#f6f2ff] p-4 text-sm leading-6 text-[#4c3d78]"
        >
          Это новая редакция {meta.version}. Она ещё не вступила в силу: даты публикации и вступления в силу
          будут указаны в день, когда она станет текущей. Сейчас действует редакция {current.version}.
        </p>
      ) : null}

      {!isCurrent && dates.kind !== "pending" ? (
        <p
          role="note"
          data-testid="author-terms-archived-edition"
          className="mt-4 rounded-2xl border border-[#f1d9a6] bg-[#fff8e8] p-4 text-sm leading-6 text-[#6b4a00]"
        >
          Это прежняя редакция {meta.version}. Она продолжает действовать для авторов, которые приняли её и ещё не
          приняли текущую редакцию {current.version}.
        </p>
      ) : null}

      <p className="mt-3 text-sm leading-6 text-[#8c7dab]" data-testid="author-terms-edition">
        Версия: {meta.version}
        {dates.kind === "dated" ? (
          <>
            <br />
            Дата публикации: {formatPublishedDate(dates.publishedAt)}
            <br />
            Дата вступления в силу: {formatPublishedDate(dates.effectiveAt)}
          </>
        ) : (
          <>
            <br />
            Ещё не вступила в силу
          </>
        )}
      </p>

      {otherEditions.length > 0 ? (
        <p className="mt-3 text-sm leading-6 text-[#6f61a3]">
          {otherEditions.map((item) => (
            <a
              key={item.versionId}
              href={item.versionId === current.versionId ? "/author-terms" : `/author-terms?edition=${encodeURIComponent(item.version)}`}
              className="mr-4 text-[#7042c5] underline-offset-2 hover:underline"
            >
              {item.versionId === current.versionId ? `Текущая редакция ${item.version}` : `Редакция ${item.version}`}
            </a>
          ))}
        </p>
      ) : null}

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
