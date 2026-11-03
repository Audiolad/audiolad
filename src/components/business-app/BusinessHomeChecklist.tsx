"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import {
  BusinessOfferAcceptNote,
  BusinessOfferAcceptedNote,
  BusinessPayError,
  BusinessReceiptEmailField,
  useBusinessHomePay,
} from "@/components/business-app/BusinessHomeAccessCard";
import { BizDocumentsIcon, BizMusicIcon, BizSettingsIcon } from "@/components/business-app/BusinessIcons";
import { BUSINESS_GIFT_CLOSING_NOTE, BUSINESS_GIFT_LICENSE_NOTE, BUSINESS_PERIOD_ENDED_PAY_NOTE, BUSINESS_SUBSCRIPTION_NOTE, businessGiftPriceNote } from "@/lib/access-grants/copy";
import { formatMoscowDateTime } from "@/lib/access-grants/policy";
import type { BusinessHomeStep, BusinessHomeStepIcon } from "@/lib/business-app/home-checklist";

const STEP_ICONS: Record<BusinessHomeStepIcon, (props: { className?: string }) => ReactNode> = {
  music: BizMusicIcon,
  settings: BizSettingsIcon,
  documents: BizDocumentsIcon,
};

function StepMark({ index, done }: { index: number; done: boolean | null }) {
  if (done === true) {
    return (
      <span className="business-app-step-mark" data-done="true" aria-label="Готово">
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden focusable="false">
          <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="business-app-step-mark" data-done={done === false ? "false" : "unknown"} aria-hidden>
      {index}
    </span>
  );
}

function Step({
  id,
  index,
  done,
  title,
  children,
  anchorId,
  mode,
}: {
  id: string;
  index: number;
  done: boolean | null;
  title: string;
  children: ReactNode;
  anchorId?: string;
  mode?: string;
}) {
  return (
    <li
      className="business-app-step"
      id={anchorId}
      data-step={id}
      data-done={done === null ? "unknown" : String(done)}
      data-testid={anchorId === "dostup" ? "biz-home-access" : `biz-home-step-${id}`}
      data-mode={mode}
    >
      <StepMark index={index} done={done} />
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="text-[1.05rem] font-bold leading-snug text-[var(--biz-text)]">{title}</h3>
        {children}
      </div>
    </li>
  );
}

function stepButtonClass(done: boolean | null): string {
  return `business-app-btn ${done === true ? "business-app-btn-secondary" : "business-app-btn-cta"} business-app-focus-ring`;
}

/**
 * «С чего начать» on Главная: one short line and one button per step. Tabs are opened with
 * client navigation, so the cabinet player keeps playing.
 */
export default function BusinessHomeChecklist({
  steps,
  showAccess = true,
}: {
  steps: BusinessHomeStep[];
  /** Terms and payment steps: the owner's own side only, never the venue side or a hall device. */
  showAccess?: boolean;
}) {
  const { access, hasTerm, canPay, accepted, busy, error, accept, pay, askReceiptEmail, receiptEmail, setReceiptEmail } =
    useBusinessHomePay();
  const withAccess = showAccess && canPay && hasTerm && access.endsAt != null;
  const label = access.endsAt ? formatMoscowDateTime(new Date(access.endsAt)) : "";
  const paid = access.mode === "paid";

  return (
    <section className="business-app-card" aria-labelledby="biz-home-start-title" data-testid="biz-home-start">
      <h2 id="biz-home-start-title" className="text-[1.25rem] font-bold text-[var(--biz-text)]">
        С чего начать
      </h2>
      <ol className="business-app-steps mt-4">
        {steps.map((step, i) => {
          const Icon = STEP_ICONS[step.icon];
          return (
            <Step key={step.id} id={step.id} index={i + 1} done={step.done} title={step.title}>
              <p className="text-sm leading-6 text-[var(--biz-text-muted)]">{step.detail}</p>
              <Link href={step.href} className={stepButtonClass(step.done)} data-testid={`biz-home-step-${step.id}-link`}>
                <Icon className="h-5 w-5" />
                {step.cta}
              </Link>
            </Step>
          );
        })}
        {withAccess ? (
          <Step id="terms" index={steps.length + 1} done={accepted} title="Примите условия">
            {accepted ? <BusinessOfferAcceptedNote /> : <BusinessOfferAcceptNote />}
            {accepted ? null : (
              <button
                type="button"
                className="business-app-btn business-app-btn-cta business-app-focus-ring"
                onClick={accept}
                disabled={busy}
                data-testid="biz-home-accept"
              >
                Принять условия
              </button>
            )}
            {error && !accepted ? <BusinessPayError error={error} /> : null}
          </Step>
        ) : null}
        {withAccess ? (
          <Step
            id="pay"
            index={steps.length + 2}
            done={paid}
            title={paid ? "Подписка оплачена" : "Оплатите подписку"}
            anchorId="dostup"
            mode={access.mode}
          >
            {paid ? (
              <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-home-paid-until">
                Подписка до {label}
              </p>
            ) : access.mode === "grace" ? (
              <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-home-grace">
                {BUSINESS_PERIOD_ENDED_PAY_NOTE}
              </p>
            ) : access.mode === "offer" ? (
              <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-home-ended">
                Подарочный период закончился {label}. {BUSINESS_SUBSCRIPTION_NOTE}
              </p>
            ) : (
              <>
                <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-home-rules">
                  {BUSINESS_GIFT_CLOSING_NOTE}
                </p>
                <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-home-license">
                  {BUSINESS_GIFT_LICENSE_NOTE}
                </p>
              </>
            )}
            <div className="space-y-2" data-testid="biz-home-pay">
              <p className="text-sm leading-6 text-[var(--biz-text-muted)]">{businessGiftPriceNote()}</p>
              {accepted && askReceiptEmail ? (
                <BusinessReceiptEmailField control={{ value: receiptEmail, onChange: setReceiptEmail }} busy={busy} />
              ) : null}
              {accepted ? (
                <button
                  type="button"
                  className={stepButtonClass(paid)}
                  onClick={pay}
                  disabled={busy}
                  data-testid="biz-home-pay-button"
                >
                  {paid ? "Продлить" : "Оплатить"}
                </button>
              ) : (
                <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-home-pay-after-terms">
                  Кнопка оплаты появится, когда вы примете условия – шаг выше.
                </p>
              )}
            </div>
            {error && accepted ? <BusinessPayError error={error} /> : null}
          </Step>
        ) : null}
      </ol>
    </section>
  );
}
