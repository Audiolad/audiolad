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
      className="flex h-[58px] min-h-[58px] w-full items-center gap-3 rounded-[18px] border border-[#e8ddf5] bg-white px-4 text-[15px] leading-none text-[#9485b4] shadow-[0_2px_10px_rgba(90,60,145,0.04)] transition-[border-color,box-shadow,color] hover:border-[#dcc9f2] hover:text-[#796ba0] hover:shadow-[0_4px_14px_rgba(90,60,145,0.07)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      aria-label="Поиск практик — перейти в каталог"
    >
      <SearchIcon />
      <span className="translate-y-px">Поиск практик</span>
    </Link>
  );
}
