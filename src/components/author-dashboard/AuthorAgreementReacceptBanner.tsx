import Link from "next/link";

import type { AuthorTermsStatusView } from "@/lib/author-terms/types";
import { UNIFIED_AGREEMENT_TITLE } from "@/lib/author-terms/unified-agreement-texts";

/**
 * Invitation (notice, not a requirement) for authors on an earlier edition once 2.0 is current.
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
        Вышла редакция {status.currentVersion.version} — {UNIFIED_AGREEMENT_TITLE}
      </p>
      <p className="mt-2">
        Одно соглашение на все способы монетизации, включая «АудиоЛад Бизнес». Отдельные заявления и согласия
        по альбомам и трекам больше не нужны.
      </p>
      <p className="mt-2">
        {status.previousEditionActive
          ? "Ваша редакция продолжает действовать без ограничения срока: продажи и другие возможности сохраняются. Чтобы подключить музыку к «АудиоЛад Бизнес», примите новую редакцию и пройдите проверку прав — за вас её никто не примет."
          : "Чтобы подключить «АудиоЛад Бизнес», примите новую редакцию лично — за вас её никто не примет."}
      </p>
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
