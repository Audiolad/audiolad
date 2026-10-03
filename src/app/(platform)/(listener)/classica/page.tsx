import type { Metadata } from "next";
import Link from "next/link";

import { buildClassicaIndexMetadata } from "@/lib/classica/public/metadata";
import { listPublishedClassicaWorks } from "@/lib/classica/public/load";
import { classicaWorkPath } from "@/lib/classica/public/paths";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildClassicaIndexMetadata();
}

export default async function ClassicaIndexPage() {
  const supabase = await createClient();
  const works = await listPublishedClassicaWorks(supabase);
  const composers = new Map<string, typeof works>();
  for (const work of works) {
    const group = composers.get(work.composerName) ?? [];
    group.push(work);
    composers.set(work.composerName, group);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 text-[#25135c]">
      <h1 className="text-3xl font-semibold">Classica</h1>
      <p className="mt-3 leading-7 text-[#4d3f73]">
        Небольшой раздел опубликованных произведений. Каталог не собирается автоматически: здесь только то, что прошло производство и публикацию.
      </p>
      {works.length === 0 ? (
        <p className="mt-8 text-sm text-[#796ba0]">Пока нет опубликованных произведений.</p>
      ) : (
        <div className="mt-8 grid gap-6">
          {[...composers.entries()].map(([composer, composerWorks]) => (
            <section key={composer}>
              <h2 className="text-xl font-semibold">{composer}</h2>
              <ul className="mt-2 grid gap-2">
                {composerWorks.map((work) => (
                  <li key={work.id}>
                    <Link className="text-[#7042c5]" href={classicaWorkPath(work.composerSlug, work.workSlug)}>
                      {work.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
