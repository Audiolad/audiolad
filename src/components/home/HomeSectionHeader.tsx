import Link from "next/link";

type HomeSectionHeaderProps = {
  title: string;
  href?: string;
  linkLabel?: string;
};

export default function HomeSectionHeader({
  title,
  href,
  linkLabel = "Смотреть все",
}: HomeSectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[22px] font-semibold leading-tight text-[#25135c]">
        {title}
      </h2>

      {href ? (
        <Link
          href={href}
          className="shrink-0 text-sm font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {linkLabel} ›
        </Link>
      ) : null}
    </div>
  );
}
