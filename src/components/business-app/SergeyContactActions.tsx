import type { ReactNode } from "react";

import { SERGEY_CONTACT, SERGEY_CONTACT_LABELS, type SergeyContactPart } from "@/lib/business-app/sergey-contact";

/**
 * Shared block of Sergey's contacts: big phone number, green «Позвонить», MAX,
 * Telegram and email buttons in the order the screen needs. MAX / Telegram open in
 * a new tab, so the cabinet tab (and its music) stays as it is.
 * `children` go last inside the same column (e.g. «Показать QR-код …»).
 */
export default function SergeyContactActions({
  order,
  testIdPrefix,
  children,
}: {
  order: readonly SergeyContactPart[];
  testIdPrefix: string;
  children?: ReactNode;
}) {
  const c = SERGEY_CONTACT;
  const l = SERGEY_CONTACT_LABELS;
  const part = (p: SergeyContactPart) => {
    switch (p) {
      case "phone":
        return (
          <p key={p} className="business-contact__phone" data-testid={`${testIdPrefix}-phone`}>
            {c.phoneDisplay}
          </p>
        );
      case "call":
        return (
          <a
            key={p}
            href={c.phoneHref}
            className="business-app-btn business-app-btn-cta business-app-focus-ring business-contact__call"
            data-testid={`${testIdPrefix}-call`}
          >
            {l.call}
          </a>
        );
      case "max":
        return (
          <a
            key={p}
            href={c.maxHref}
            target="_blank"
            rel="noopener noreferrer"
            className="business-app-btn business-app-btn-secondary business-app-focus-ring business-contact__btn"
            data-testid={`${testIdPrefix}-max`}
          >
            {l.max}
          </a>
        );
      case "telegram":
        return (
          <a
            key={p}
            href={c.telegramHref}
            target="_blank"
            rel="noopener noreferrer"
            className="business-app-btn business-app-btn-secondary business-app-focus-ring business-contact__btn"
            data-testid={`${testIdPrefix}-telegram`}
          >
            {l.telegram}
          </a>
        );
      case "email":
        return (
          <a
            key={p}
            href={c.emailHref}
            className="business-app-btn business-app-btn-secondary business-app-focus-ring business-contact__btn"
            data-testid={`${testIdPrefix}-email`}
          >
            {l.email}
          </a>
        );
    }
  };
  return (
    <div className="business-contact__actions" data-testid={`${testIdPrefix}-actions`}>
      {order.map(part)}
      {children}
    </div>
  );
}
