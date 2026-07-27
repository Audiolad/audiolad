import Link from "next/link";

type CommercialOnboardingStubPanelProps = {
  title: string;
  lead: string;
  bullets?: string[];
  note: string;
  backHref: string;
  backLabel?: string;
};

export default function CommercialOnboardingStubPanel({
  title,
  lead,
  bullets = [],
  note,
  backHref,
  backLabel = "Вернуться к подключению",
}: CommercialOnboardingStubPanelProps) {
  return (
    <section className="mx-auto w-full max-w-2xl rounded-[28px] border border-[#eadff8] bg-white px-5 py-7 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8b7bb4]">
        Коммерческое подключение
      </p>
      <h1 className="mt-3 text-[28px] font-semibold leading-tight text-[#2d2148]">
        {title}
      </h1>
      <p className="mt-4 text-[15px] leading-7 text-[#5c4f7a]">{lead}</p>

      {bullets.length > 0 ? (
        <ul className="mt-5 list-disc space-y-2 pl-5 text-[15px] leading-7 text-[#5c4f7a]">
          {bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 rounded-[20px] border border-[#f0e7ff] bg-[#faf7ff] px-4 py-4 text-[14px] leading-6 text-[#6a5b8c]">
        {note}
      </div>

      <div className="mt-7">
        <Link
          href={backHref}
          className="inline-flex rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
        >
          {backLabel}
        </Link>
      </div>
    </section>
  );
}
