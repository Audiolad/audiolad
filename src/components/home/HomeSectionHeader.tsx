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
    <div className="flex items-center justify-between gap-4">
      <h2 className="min-w-0 text-[22px] font-semibold leading-tight text-[#25135c] xl:text-[24px] xl:font-semibold xl:leading-[1.2]">
        {title}
      </h2>

      {href ? (
        <Link
          href={href}
          className="shrink-0 self-center text-[13px] font-medium text-[#8a7cb0] underline-offset-2 transition-colors hover:text-[#7042c5] hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] xl:text-sm"
        >
          {linkLabel} ›
        </Link>
      ) : null}
    </div>
  );
}
