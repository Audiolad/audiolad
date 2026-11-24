import { GUEST_COFFEE_BENEFITS } from "@/lib/business-app/guest-coffee/benefits";

type BenefitId = (typeof GUEST_COFFEE_BENEFITS)[number]["id"];

/** Simple line icons, no external assets. */
function BenefitIcon({ id }: { id: BenefitId }) {
  const common = {
    width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
  };
  if (id === "legal") {
    return (
      <svg {...common}>
        <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  if (id === "no-repeats") {
    return (
      <svg {...common}>
        <path d="M16 3h5v5" />
        <path d="M4 20 21 3" />
        <path d="M21 16v5h-5" />
        <path d="m15 15 6 6" />
        <path d="M4 4l5 5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" />
      <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M8 3c0 1.5 1 1.5 1 3M12 3c0 1.5 1 1.5 1 3" />
    </svg>
  );
}

/**
 * t1666u: three key benefits on the guest first screen (Yandex Direct traffic). Compact so the
 * «Настройки звучания» picker stays on the first screen at 375 px.
 */
export default function GuestCoffeeBenefits() {
  return (
    <ul
      className="divide-y divide-[var(--biz-border)] rounded-2xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:divide-y-0 sm:px-4 sm:py-3"
      data-testid="guest-coffee-benefits"
      aria-label="Преимущества АудиоЛад Кофейня"
    >
      {GUEST_COFFEE_BENEFITS.map((b) => (
        <li key={b.id} className="flex items-start gap-2.5 py-2 sm:py-0" data-testid={`guest-coffee-benefit-${b.id}`}>
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--biz-accent-soft)] text-[var(--biz-accent)] sm:h-8 sm:w-8">
            <BenefitIcon id={b.id} />
          </span>
          <p className="min-w-0 text-[0.82rem] leading-snug text-[var(--biz-text-muted)] sm:text-[0.88rem]">
            <span className="font-semibold text-[var(--biz-text)] sm:block sm:text-[0.95rem]">{b.title}</span>
            <span className="sm:hidden">. </span>
            {b.text}
          </p>
        </li>
      ))}
    </ul>
  );
}
