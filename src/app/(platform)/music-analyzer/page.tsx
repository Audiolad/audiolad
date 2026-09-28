import Link from "next/link";

import { CompleteExperimentButton, ImportPacketButton } from "@/components/music-lab/HubActions";
import { loadMusicLabBundle } from "@/lib/music-lab/page-data";

export const dynamic = "force-dynamic";

export default async function MusicAnalyzerHubPage() {
  const { bundle } = await loadMusicLabBundle();

  if (!bundle) {
    return <ImportPacketButton initial />;
  }

  const missing = {
    listen: bundle.progress.listen.total - bundle.progress.listen.done,
    similarity: bundle.progress.similarity.total - bundle.progress.similarity.done,
    bpm: bundle.progress.bpm.total - bundle.progress.bpm.done,
  };
  const ready =
    bundle.progress.listen.total > 0 &&
    missing.listen === 0 &&
    missing.similarity === 0 &&
    missing.bpm === 0;

  const sections = [
    {
      href: bundle.listen[0] ? `/music-analyzer/listen/${bundle.listen[0].code}` : null,
      title: "Прослушивание",
      detail: `${bundle.progress.listen.done} из ${bundle.progress.listen.total}`,
      locked: false,
    },
    {
      href: bundle.similarity[0]
        ? `/music-analyzer/similarity/${bundle.similarity[0].code}`
        : null,
      title: "Похожесть",
      detail: `${bundle.progress.similarity.done} из ${bundle.progress.similarity.total}`,
      locked: false,
    },
    {
      href: bundle.bpm[0] ? `/music-analyzer/bpm/${bundle.bpm[0].code}` : null,
      title: "BPM / тональность",
      detail: `${bundle.progress.bpm.done} из ${bundle.progress.bpm.total}`,
      locked: false,
    },
    {
      href: bundle.experiment.locked ? "/music-analyzer/results" : null,
      title: "Результаты",
      detail: bundle.experiment.locked ? "Открыты" : "Откроется после завершения оценки",
      locked: !bundle.experiment.locked,
    },
  ];

  return (
    <div className="space-y-6">
      <p className="text-[22px] font-semibold text-[#25135c]">
        Проверено {bundle.progress.listen.done} из {bundle.progress.listen.total}
      </p>
      <p className="max-w-2xl text-sm leading-6 text-[#796ba0]">
        Закрытая проверка на слух. Ответы сохраняются сразу и не попадают в каталог.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map((section) =>
          section.href ? (
            <Link
              key={section.title}
              href={section.href}
              className="rounded-[22px] border border-[#e4d7f4] bg-white p-5"
            >
              <h2 className="text-lg font-semibold text-[#25135c]">{section.title}</h2>
              <p className="mt-2 text-sm text-[#796ba0]">{section.detail}</p>
            </Link>
          ) : (
            <div
              key={section.title}
              aria-disabled="true"
              className="rounded-[22px] border border-dashed border-[#e4d7f4] bg-[#fbf8fe] p-5"
            >
              <h2 className="text-lg font-semibold text-[#25135c]">{section.title}</h2>
              <p className="mt-2 text-sm text-[#796ba0]">{section.detail}</p>
            </div>
          ),
        )}
      </div>
      <CompleteExperimentButton
        ready={ready}
        missing={missing}
        completed={bundle.experiment.locked}
      />
      <ImportPacketButton initial={false} />
    </div>
  );
}
