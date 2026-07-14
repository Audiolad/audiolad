import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-[#eadff8] bg-white/95 px-5 py-3 text-center backdrop-blur">
      <Link
        href="/requisites"
        className="text-sm text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        Реквизиты
      </Link>
    </footer>
  );
}
