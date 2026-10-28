import {
  BUSINESS_GIFT_TITLE,
  BUSINESS_SUBSCRIPTION_NOTE,
  BUSINESS_UNCONFIRMED_NOTE,
} from "@/lib/access-grants/copy";
import { ruDaysWord } from "@/lib/access-grants/policy";
import { BUSINESS_BRAND_MARK_SRC, BUSINESS_BRAND_NAME } from "@/lib/business-app/brand-icons";
import { CLIENT_DOCUMENT_EDITION_LABEL, CLIENT_DOCUMENT_REQUISITES } from "@/lib/business-app/client-documents";
import { BUSINESS_INQUIRY_EMAIL, BUSINESS_SUPPORT_LEAD, BUSINESS_SUPPORT_TITLE } from "@/lib/business/landing";
import { BUSINESS_OFFER_TITLE } from "@/lib/business/offer";
import type { VenueLicenceView } from "@/lib/business-app/venue-licence/present";

const SCOPE =
  "Простую неисключительную лицензию на публичное исполнение треков каталога «АудиоЛад Бизнес» как фоновой музыки в конкретной точке (адрес, зона), указанной в личном кабинете, через плеер АудиоЛад, в период доступа.";

const TERRITORY =
  "Территория – точка на территории Российской Федерации. Перенос на другой адрес оформляется как новая точка.";

const METHOD = "Способ – только воспроизведение через плеер сервиса.";

const OTHER_MUSIC = "Лицензия не распространяется на музыку из иных источников; за неё отвечает лицензиат.";

const STATUTORY =
  "Лицензия не освобождает от выплат, которые закон предусматривает независимо от договора (ст. 1326, 1244 ГК РФ), в случаях, когда такие выплаты применимы.";

const AFTER_ACCESS =
  "По окончании доступа воспроизведение прекращается; личный кабинет и документы остаются доступны.";

function statusClass(status: VenueLicenceView["status"]): string {
  return `business-app-card venue-licence-status is-${status}`;
}

export default function VenueLicencePage({ view }: { view: VenueLicenceView }) {
  return (
    <article className="venue-licence" data-testid="venue-licence" data-status={view.status} data-clock={view.clock ?? "none"}>
      <header className="flex flex-col gap-3">
        {/* Public mark. The cabinet lockup would open the player shell. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="venue-licence-mark" src={BUSINESS_BRAND_MARK_SRC} alt="" width={72} height={72} />
        <p className="business-app-eyebrow">{BUSINESS_BRAND_NAME}</p>
        <h1 className="text-[1.65rem] font-bold leading-tight text-[var(--biz-text)]">
          Лицензия на публичное исполнение музыки в заведении
        </h1>
      </header>

      <section className="business-app-card mt-5" data-testid="venue-place">
        <h2 className="text-lg font-bold text-[var(--biz-text)]">Точка</h2>
        <p className="mt-2 text-base font-semibold text-[var(--biz-text)]" data-testid="venue-name">{view.venueName}</p>
        <h2 className="mt-4 text-lg font-bold text-[var(--biz-text)]">Адрес точки</h2>
        <p className="mt-2 text-base text-[var(--biz-text)]" data-testid="venue-address">
          {view.address ?? "Адрес точки пока не указан."}
        </p>
      </section>

      <section className={`${statusClass(view.status)} mt-4`} data-testid="venue-status">
        <h2 className="text-lg font-bold">Срок</h2>
        <StatusCopy view={view} />
      </section>

      <section className="business-app-card mt-4" data-testid="venue-scope">
        <h2 className="text-lg font-bold text-[var(--biz-text)]">Что получает клиент</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--biz-text)]">{SCOPE}</p>
        <p className="mt-3 text-sm leading-6 text-[var(--biz-text)]">{TERRITORY}</p>
        <p className="mt-3 text-sm leading-6 text-[var(--biz-text)]">{METHOD}</p>
        <p className="mt-3 text-sm leading-6 text-[var(--biz-text)]">{OTHER_MUSIC}</p>
        <p className="mt-3 text-sm leading-6 text-[var(--biz-text)]">{STATUTORY}</p>
      </section>

      <section className="business-app-card mt-4" data-testid="venue-basis">
        <h2 className="text-lg font-bold text-[var(--biz-text)]">Основание</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--biz-text)]">
          «{BUSINESS_OFFER_TITLE}». {CLIENT_DOCUMENT_EDITION_LABEL}.
        </p>
        <p className="mt-3 text-sm leading-6 text-[var(--biz-text)]">{AFTER_ACCESS}</p>
        <p className="mt-3 text-sm">
          <a href="/documents/b2b-terms">{BUSINESS_OFFER_TITLE}</a>
        </p>
      </section>

      <section className="business-app-card mt-4" data-testid="venue-contacts">
        <h2 className="text-lg font-bold text-[var(--biz-text)]">{BUSINESS_SUPPORT_TITLE}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--biz-text)]">{BUSINESS_SUPPORT_LEAD}</p>
        <p className="mt-3 text-sm leading-6 text-[var(--biz-text)]" data-testid="venue-requisites">{CLIENT_DOCUMENT_REQUISITES}</p>
        <p className="mt-3 text-sm">
          <a href={`mailto:${BUSINESS_INQUIRY_EMAIL}`}>Написать нам</a>
        </p>
      </section>
    </article>
  );
}

function StatusCopy({ view }: { view: VenueLicenceView }) {
  if (view.status === "not_started") {
    return <p className="mt-2 text-sm leading-6">{BUSINESS_UNCONFIRMED_NOTE}</p>;
  }
  if (view.status === "trial") {
    return (
      <>
        <p className="business-app-eyebrow mt-2">{BUSINESS_GIFT_TITLE}</p>
        <p className="mt-2 text-base font-semibold" data-testid="venue-until">Бесплатный доступ до {view.periodEndLabel}.</p>
        <Period view={view} />
      </>
    );
  }
  if (view.status === "paid") {
    return (
      <>
        <p className="mt-2 text-base font-semibold" data-testid="venue-until">Подписка до {view.periodEndLabel}.</p>
        <Period view={view} />
      </>
    );
  }
  if (view.status === "grace") {
    const days = view.graceDaysLeft ?? 0;
    return (
      <>
        <p className="mt-2 text-base font-semibold">Срок закончился</p>
        <p className="mt-2 text-sm leading-6" data-testid="venue-grace">
          Музыка играет ещё {days} {ruDaysWord(days)}, затем остановится. Конец срока был {view.periodEndLabel}.
        </p>
        <Period view={view} />
      </>
    );
  }
  if (view.clock === "subscription") {
    return (
      <>
        <p className="mt-2 text-base font-semibold" data-testid="venue-ended">Подписка до {view.periodEndLabel}.</p>
        <p className="mt-2 text-sm leading-6">{AFTER_ACCESS}</p>
        <Period view={view} />
      </>
    );
  }
  return (
    <>
      <p className="mt-2 text-base font-semibold" data-testid="venue-ended">Подарочный период закончился {view.periodEndLabel}.</p>
      <p className="mt-2 text-sm leading-6">{BUSINESS_SUBSCRIPTION_NOTE}</p>
      <Period view={view} />
    </>
  );
}

function Period({ view }: { view: VenueLicenceView }) {
  if (!view.periodStartLabel || !view.periodEndLabel) return null;
  return (
    <p className="mt-2 text-sm leading-6" data-testid="venue-period">
      с {view.periodStartLabel} по {view.periodEndLabel}
    </p>
  );
}

export function VenueLicenceUnavailable() {
  return (
    <article className="venue-licence" data-testid="venue-licence-unavailable">
      <h1 className="text-[1.65rem] font-bold text-[var(--biz-text)]">Лицензия на публичное исполнение музыки в заведении</h1>
      <p className="business-app-card mt-5 text-sm leading-6 text-[var(--biz-text)]">Страница точки временно недоступна.</p>
    </article>
  );
}
