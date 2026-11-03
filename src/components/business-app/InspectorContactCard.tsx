import {
  INSPECTOR_CARD_LINES,
  INSPECTOR_CARD_TITLE,
  INSPECTOR_CONTACT,
} from "@/lib/business-app/inspector-contact";
import VenueQrShowButton from "@/components/business-app/venue-licence/VenueQrFullscreen";

/** Top of «Документы»: one calm step for the barista – call Sergey. */
/** `qrUrl` – the venue's licence page; null when the licence QR is not available to this viewer. */
export default function InspectorContactCard({ qrUrl }: { qrUrl: string | null }) {
  const c = INSPECTOR_CONTACT;
  return (
    <section
      className="business-app-card business-inspector-card"
      aria-labelledby="inspector-card-title"
      data-testid="biz-inspector-card"
    >
      <h2 id="inspector-card-title" className="text-[1.2rem] font-bold leading-snug text-[var(--biz-text)]">
        {INSPECTOR_CARD_TITLE}
      </h2>
      <dl className="business-inspector-card__contact" data-testid="biz-inspector-contact">
        <dt className="sr-only">Имя</dt>
        <dd className="font-semibold text-[var(--biz-text)]">{c.name}</dd>
        <dt className="sr-only">Телефон</dt>
        <dd className="business-inspector-card__phone">{c.phoneDisplay}</dd>
        <dt className="sr-only">Почта</dt>
        <dd className="text-[var(--biz-text-muted)]">{c.email}</dd>
      </dl>
      <div className="business-inspector-card__actions">
        <a
          href={c.phoneHref}
          className="business-app-btn business-app-btn-cta business-app-focus-ring business-inspector-card__call"
          data-testid="biz-inspector-call"
        >
          Позвонить
        </a>
        <a
          href={c.maxHref}
          target="_blank"
          rel="noopener noreferrer"
          className="business-app-btn business-app-btn-secondary business-app-focus-ring"
          data-testid="biz-inspector-max"
        >
          Написать в МАКС
        </a>
        <a
          href={c.emailHref}
          className="business-app-btn business-app-btn-secondary business-app-focus-ring"
          data-testid="biz-inspector-email"
        >
          Написать на почту
        </a>
      </div>
      {qrUrl ? (
        <div className="business-inspector-card__qr">
          <VenueQrShowButton url={qrUrl} variant="secondary" testId="biz-inspector-qr-show" />
        </div>
      ) : null}
      <ul className="business-inspector-card__lines">
        {INSPECTOR_CARD_LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
