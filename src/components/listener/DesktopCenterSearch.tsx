import Link from "next/link";

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-[#9485b4]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export default function DesktopCenterSearch() {
  return (
    <Link
      href="/catalog"
      className="flex h-14 min-h-14 w-full items-center gap-2.5 rounded-[20px] border border-[#eadff8] bg-[#fffdfd] px-4 text-[15px] text-[#9485b4] shadow-[0_4px_14px_rgba(90,60,145,0.05)] transition hover:border-[#dcc9f2] hover:text-[#796ba0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      aria-label="Поиск практик — перейти в каталог"
    >
      <SearchIcon />
      <span>Поиск практик</span>
    </Link>
  );
}
