import Link from "next/link";

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

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

        <span
          aria-hidden="true"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-transparent text-[#7042c5] opacity-0"
        >
          <SearchIcon />
        </span>
      </header>
    </div>
  );
}
