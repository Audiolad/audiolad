import Link from "next/link";

const linkClassName =
  "text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

export default function PurchaseConsent({ className }: { className?: string }) {
  return (
    <p
      className={`text-center text-xs leading-5 text-[#8c7dab] ${className ?? ""}`}
    >
      Нажимая «Купить», вы принимаете условия{" "}
      <Link href="/offer" className={linkClassName}>
        Публичной оферты
      </Link>{" "}
      и соглашаетесь с{" "}
      <Link href="/privacy" className={linkClassName}>
        Политикой обработки персональных данных
      </Link>
      .
    </p>
  );
}
