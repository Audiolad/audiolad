import Link from "next/link";

export default function CatalogMobileHeader() {
  return (
    <div className="px-5 pt-6 xl:hidden">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          aria-label="Назад"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-3xl text-[#7042c5]"
        >
          ‹
        </Link>

        <h1 className="text-[28px] font-semibold">Каталог</h1>

        <span aria-hidden="true" className="h-11 w-11 shrink-0" />
      </header>
    </div>
  );
}
