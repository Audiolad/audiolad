import { PHILOSOPHY_TOC } from "@/lib/seo/philosophy/content";

const linkClassName =
  "font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

function TocList() {
  return (
    <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-[#4a3d73] sm:text-[15px] sm:leading-7">
      {PHILOSOPHY_TOC.map((item) => (
        <li key={item.id}>
          <a href={`#${item.id}`} className={linkClassName}>
            {item.title}
          </a>
        </li>
      ))}
    </ol>
  );
}

export default function PhilosophyToc() {
  return (
    <nav
      aria-label="Содержание"
      className="mt-8 max-w-3xl rounded-[24px] border border-[#e8def5] bg-[#faf7ff] p-4 sm:p-5"
    >
      <div className="md:hidden">
        <details className="group">
          <summary className="cursor-pointer list-none text-base font-semibold text-[#25135c] marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-3">
              Содержание
              <span
                aria-hidden
                className="text-[#7042c5] transition group-open:rotate-45"
              >
                +
              </span>
            </span>
          </summary>
          <TocList />
        </details>
      </div>

      <div className="hidden md:block">
        <p className="text-base font-semibold text-[#25135c]">Содержание</p>
        <TocList />
      </div>
    </nav>
  );
}
