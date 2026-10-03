import Link from "next/link";

import { classicaIndexPath, classicaPublicAudioPath, classicaWorkPath } from "@/lib/classica/public/paths";
import type { ClassicaPublicWork } from "@/lib/classica/public/metadata";
import { formatAudioDuration } from "@/lib/products/duration";

type ClassicaPublicWorkViewProps = {
  work: ClassicaPublicWork;
  related: ClassicaPublicWork[];
};

export default function ClassicaPublicWorkView({ work, related }: ClassicaPublicWorkViewProps) {
  const duration = formatAudioDuration(work.durationSeconds);
  const slides = [
    ...(work.coverUrl ? [{ url: work.coverUrl, alt: work.coverAlt, title: work.title }] : []),
    ...work.images,
  ];

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-8 text-[#25135c]">
      <nav className="text-sm text-[#796ba0]">
        <Link href={classicaIndexPath()}>Classica</Link>
        <span> / {work.composerName}</span>
      </nav>
      <h1 className="mt-3 text-3xl font-semibold leading-tight">{work.heading || work.title}</h1>
      <p className="mt-2 text-lg">{work.composerName}</p>
      {work.subtitle ? <p className="mt-2 text-[#796ba0]">{work.subtitle}</p> : null}
      <p className="mt-2 text-sm text-[#796ba0]">
        {[work.catalogueNumber, work.musicalKey, work.compositionYear, duration]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <audio
        className="mt-4 w-full"
        controls
        preload="metadata"
        src={work.audioUrl ?? classicaPublicAudioPath(work.id)}
      >
        <a href={classicaPublicAudioPath(work.id)}>Слушать</a>
      </audio>
      {work.shortDescription ? <p className="mt-6 leading-7">{work.shortDescription}</p> : null}
      {work.body ? <div className="mt-4 whitespace-pre-wrap leading-7">{work.body}</div> : null}
      {work.aboutWork ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">О произведении</h2>
          <div className="mt-3 whitespace-pre-wrap leading-7">{work.aboutWork}</div>
        </section>
      ) : null}
      {work.aboutComposer ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">О композиторе</h2>
          <div className="mt-3 whitespace-pre-wrap leading-7">{work.aboutComposer}</div>
        </section>
      ) : null}
      {work.listeningNotes ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">На что обратить внимание при прослушивании</h2>
          <div className="mt-3 whitespace-pre-wrap leading-7">{work.listeningNotes}</div>
        </section>
      ) : null}
      {work.faq.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Вопросы</h2>
          <div className="mt-3 grid gap-4">
            {work.faq.map((item) => (
              <div key={item.question}>
                <h3 className="font-semibold">{item.question}</h3>
                <p className="mt-1 leading-7">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {slides.length > 0 ? (
        <div className="mt-8 flex gap-3 overflow-x-auto">
          {slides.map((image) => (
            // Public Classica covers are stored as remote Supabase objects.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={image.url}
              src={image.url}
              alt={image.alt ?? work.title}
              title={image.title ?? undefined}
              className="h-48 w-auto rounded-2xl object-cover"
            />
          ))}
        </div>
      ) : null}
      {work.extraBlocks.map((block) => (
        <section key={block.heading} className="mt-8">
          <h2 className="text-xl font-semibold">{block.heading}</h2>
          <div className="mt-3 whitespace-pre-wrap leading-7">{block.body}</div>
        </section>
      ))}
      {related.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Другие произведения</h2>
          <ul className="mt-3 grid gap-2">
            {related.map((item) => (
              <li key={item.id}>
                <Link
                  className="text-[#7042c5]"
                  href={classicaWorkPath(item.composerSlug, item.workSlug)}
                >
                  {item.composerName} — {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
