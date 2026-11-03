import {
  INSPECTOR_BUTTONS,
  INSPECTOR_CARD_LINES,
  INSPECTOR_CARD_TITLE,
  INSPECTOR_CONTACT,
} from "@/lib/business-app/inspector-contact";
import { INSPECTOR_CONTACT_ORDER } from "@/lib/business-app/sergey-contact";
import SergeyContactActions from "@/components/business-app/SergeyContactActions";
import VenueQrShowButton from "@/components/business-app/venue-licence/VenueQrFullscreen";

/** Top of «Документы»: one calm step for the barista – call Sergey. */
/** `qrUrl` – the venue's licence page; null when the licence QR is not available to this viewer. */
export default function InspectorContactCard({ qrUrl }: { qrUrl: string | null }) {
  return (
    <section
      className="business-app-card business-inspector-card"
      aria-labelledby="inspector-card-title"
      data-testid="biz-inspector-card"
    >
      <h2 id="inspector-card-title" className="text-[1.2rem] font-bold leading-snug text-[var(--biz-text)]">
        {INSPECTOR_CARD_TITLE}
      </h2>
      <p className="business-contact__name" data-testid="biz-inspector-name">
        {INSPECTOR_CONTACT.name}
      </p>
      <SergeyContactActions order={INSPECTOR_CONTACT_ORDER} testIdPrefix="biz-inspector">
        {qrUrl ? (
          <VenueQrShowButton
            url={qrUrl}
            variant="secondary"
            testId="biz-inspector-qr-show"
            label={INSPECTOR_BUTTONS.qr}
            className="business-contact__btn"
          />
        ) : null}
      </SergeyContactActions>
      <ul className="business-inspector-card__lines">
        {INSPECTOR_CARD_LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
