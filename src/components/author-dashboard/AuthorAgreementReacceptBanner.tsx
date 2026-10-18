import Link from "next/link";

import type { AuthorTermsStatusView } from "@/lib/author-terms/types";
import { UNIFIED_AGREEMENT_TITLE } from "@/lib/author-terms/unified-agreement-texts";

/**
 * Invitation (notice, not a requirement) for authors on an earlier edition once a newer one is current
 * (1.2 -> 2.0; 2.0 -> 2.1: an author on 2.0 keeps Business, 2.1 adds the venue player offline cache).
 * Authors on 1.2 keep their 1.2 commercial features (sales, payouts, Studio) with no end date;
 * only AudioLad Business needs a personal 2.0 acceptance plus a verified rights check.
 * Nothing is accepted automatically: the author opens the document and accepts it personally.
 */
export default function AuthorAgreementReacceptBanner({
  status,
  authorSlug,
}: {
  status: AuthorTermsStatusView;
  authorSlug: string;
}) {
  if (!status.reacceptInvited || !status.coversBusiness || !status.currentVersion) {
    return null;
  }
  return (
    <section
      role="status"
      data-testid="agreement-reaccept-banner"
      className="mb-6 rounded-[20px] border border-[#d9c8f5] bg-[#faf6ff] px-5 py-4 text-[15px] leading-6 text-[#2f2548]"
    >
      <p className="font-semibold text-[#25135c]">
        Вышла редакция {status.currentVersion.version} – {UNIFIED_AGREEMENT_TITLE}
      </p>
      {status.previousEditionActive && status.businessAgreement ? (
        // Author already on a unified edition (2.0) after a newer one (2.1) became current.
        <p className="mt-2">
          Ваша редакция продолжает действовать без ограничения срока: продажи и «АудиоЛад Бизнес» сохраняются.
          Новая редакция добавляет работу плеера заведения без подключения к сети – она распространится на вашу
          музыку только после того, как вы лично примете новую редакцию.
        </p>
      ) : (
        <>
          <p className="mt-2">
            Одно соглашение на все способы монетизации, включая «АудиоЛад Бизнес». Отдельные заявления и согласия
            по альбомам и трекам больше не нужны.
          </p>
          <p className="mt-2">
            {status.previousEditionActive
              ? "Ваша редакция продолжает действовать без ограничения срока: продажи и другие возможности сохраняются. Чтобы подключить музыку к «АудиоЛад Бизнес», примите новую редакцию и пройдите проверку прав – за вас её никто не примет."
              : "Чтобы подключить «АудиоЛад Бизнес», примите новую редакцию лично – за вас её никто не примет."}
          </p>
        </>
      )}
      <p className="mt-3 flex flex-wrap gap-4">
        <Link href="/author-terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#7042c5] underline-offset-2 hover:underline">
          Прочитать соглашение
        </Link>
        <Link
          href={`/author-dashboard/legal?author=${encodeURIComponent(authorSlug)}`}
          className="font-semibold text-[#7042c5] underline-offset-2 hover:underline"
        >
          Перейти к принятию
        </Link>
      </p>
    </section>
  );
}
