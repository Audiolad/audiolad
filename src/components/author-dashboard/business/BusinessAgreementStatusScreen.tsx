import Link from "next/link";

import { VERIFICATION_STATUS_TEXT } from "@/lib/business-rightsholder/examples";

export type BusinessTrackAdmission = {
  audioItemId: string;
  title: string;
  productTitle: string;
  /** Latest per-track review; null = no review, suitable track flows in automatically. */
  decision: "admitted" | "proof_requested" | "blocked" | null;
  reasonCode: string | null;
  comment: string | null;
  inBusiness: boolean;
};

/** One line instead of a per-track list (Sergey 18.10.2026 18:28: with 1000 tracks a list is endless). */
export const BUSINESS_TRACKS_AUTO_LINE =
  "После проверки прав все треки аккаунта и всех его авторских пространств попадут в «АудиоЛад Бизнес» автоматически.";

/** Short counts for this workspace once tracks are in (no list). */
export function businessTrackSummary(tracks: BusinessTrackAdmission[]): { inBusiness: number; restricted: number } {
  let inBusiness = 0;
  let restricted = 0;
  for (const t of tracks) {
    if (t.decision === "blocked" || t.decision === "proof_requested") restricted += 1;
    else if (t.inBusiness) inBusiness += 1;
  }
  return { inBusiness, restricted };
}

type Props = {
  authorSlug: string;
  agreement: { accepted: boolean; version: string | null };
  verificationStatus: string | null;
  tracks: BusinessTrackAdmission[];
};

/** Business status screen (unified agreement): agreement → rights check → automatic inflow (counts only, no track list). */
export default function BusinessAgreementStatusScreen({ authorSlug, agreement, verificationStatus, tracks }: Props) {
  const verified = verificationStatus === "verified";
  const summary = businessTrackSummary(tracks);
  return (
    <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6" data-testid="business-status-screen">
      <h2 className="text-lg font-semibold text-neutral-900">Статус в «АудиоЛад Бизнес»</h2>
      <ol className="mt-4 space-y-3 text-sm">
        <li data-testid="business-step-agreement" data-done={agreement.accepted ? "1" : "0"}>
          <p className="font-medium text-neutral-900">1. Соглашение</p>
          <p className="mt-1 text-neutral-700">
            {agreement.accepted
              ? `Принято Единое коммерческое соглашение, редакция ${agreement.version ?? ""}. Оно покрывает «АудиоЛад Бизнес» – отдельные согласия не нужны.`
              : "Нужно лично принять Единое коммерческое соглашение."}
          </p>
          {!agreement.accepted ? (
            <Link
              href={`/author-dashboard/legal?author=${encodeURIComponent(authorSlug)}`}
              className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white"
            >
              Прочитать и принять соглашение
            </Link>
          ) : null}
        </li>
        <li data-testid="business-step-verification" data-done={verified ? "1" : "0"}>
          <p className="font-medium text-neutral-900">2. Проверка прав</p>
          <p className="mt-1 text-neutral-700">
            {verificationStatus
              ? VERIFICATION_STATUS_TEXT[verificationStatus] ?? verificationStatus
              : "Подтвердите права минимум на один свой трек: ссылка на генерацию, скриншот с датой, платный тариф."}
          </p>
        </li>
        <li data-testid="business-step-tracks">
          <p className="mt-1 text-neutral-700">{BUSINESS_TRACKS_AUTO_LINE}</p>
          {verified && (summary.inBusiness > 0 || summary.restricted > 0) ? (
            <p className="mt-1 text-neutral-500" data-testid="business-track-summary">
              {`Уже в «АудиоЛад Бизнес» из этого авторского пространства: ${summary.inBusiness}.`}
              {summary.restricted > 0 ? ` Не допущены или ждут доказательств: ${summary.restricted}.` : ""}
            </p>
          ) : null}
        </li>
      </ol>
    </section>
  );
}
