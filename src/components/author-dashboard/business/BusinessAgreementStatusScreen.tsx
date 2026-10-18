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

const DECISION_TEXT: Record<NonNullable<BusinessTrackAdmission["decision"]>, string> = {
  admitted: "Допущен",
  proof_requested: "Нужны доказательства по этому треку",
  blocked: "Не допущен",
};

const REASON_TEXT: Record<string, string> = {
  rights_undefined_or_limited: "права не определены или ограничены",
  other_rightsholder: "у трека другой правообладатель",
  rights_revoked_or_disputed: "права отозваны или оспорены",
  use_type_missing: "нет нужного способа использования",
  proof_requested: "запрошены дополнительные доказательства",
  suspended: "использование приостановлено",
};

type Props = {
  authorSlug: string;
  agreement: { accepted: boolean; version: string | null };
  verificationStatus: string | null;
  tracks: BusinessTrackAdmission[];
};

/** Business status screen (unified agreement): agreement → rights check → per-track admission. */
export default function BusinessAgreementStatusScreen({ authorSlug, agreement, verificationStatus, tracks }: Props) {
  const verified = verificationStatus === "verified";
  return (
    <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6" data-testid="business-status-screen">
      <h2 className="text-lg font-semibold text-neutral-900">Статус в «АудиоЛад Бизнес»</h2>
      <ol className="mt-4 space-y-3 text-sm">
        <li data-testid="business-step-agreement" data-done={agreement.accepted ? "1" : "0"}>
          <p className="font-medium text-neutral-900">1. Соглашение</p>
          <p className="mt-1 text-neutral-700">
            {agreement.accepted
              ? `Принято Единое коммерческое соглашение, редакция ${agreement.version ?? ""}. Оно покрывает «АудиоЛад Бизнес» – отдельные согласия не нужны.`
              : "Нужно лично принять Единое коммерческое соглашение (редакция 2.0)."}
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
          <p className="mt-1 text-neutral-500">
            Проверка одного трека не подтверждает остальные: по любому треку могут запросить доказательства.
          </p>
        </li>
        <li data-testid="business-step-tracks">
          <p className="font-medium text-neutral-900">3. Треки</p>
          <p className="mt-1 text-neutral-700">
            {verified
              ? "Пригодные треки попадают в «АудиоЛад Бизнес» автоматически – включать альбомы вручную не нужно."
              : "После проверки прав пригодные треки попадут в «АудиоЛад Бизнес» автоматически."}
          </p>
          {tracks.length > 0 ? (
            <ul className="mt-3 divide-y divide-neutral-100 rounded-xl border border-neutral-200" data-testid="business-track-admissions">
              {tracks.map((t) => (
                <li key={t.audioItemId} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2" data-track-decision={t.decision ?? "auto"}>
                  <span>
                    <span className="font-medium text-neutral-900">{t.title}</span>
                    <span className="text-neutral-500"> · {t.productTitle}</span>
                  </span>
                  <span className="text-right text-neutral-700">
                    {t.decision
                      ? `${DECISION_TEXT[t.decision]}${t.reasonCode && REASON_TEXT[t.reasonCode] ? ` – ${REASON_TEXT[t.reasonCode]}` : ""}`
                      : t.inBusiness
                        ? "В «АудиоЛад Бизнес»"
                        : verified && agreement.accepted
                          ? "Ожидает синхронизации каталога"
                          : "Пока не в «АудиоЛад Бизнес»"}
                    {t.comment ? <span className="block text-neutral-500">{t.comment}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      </ol>
    </section>
  );
}
