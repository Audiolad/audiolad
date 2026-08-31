import { StudioBrand } from "@/components/studio/StudioBrand";
import { StudioChromeNav } from "@/components/studio/StudioChromeNav";
import { requireStudioAuthorAccess } from "@/lib/studio/access";

export const dynamic = "force-dynamic";

export default async function AudiobookProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireStudioAuthorAccess(`/studio/audiobooks/${projectId}`);

  return (
    <main className="min-h-dvh bg-[#160d2d] px-5 py-6 text-white sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-6xl flex-col">
        <header className="flex flex-col gap-4 border-b border-white/15 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <StudioBrand />
          <StudioChromeNav accessMode="author" showStudioLauncher />
        </header>

        <section className="grid flex-1 gap-5 py-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-white/15 bg-[#21133d] p-6">
            <h1 className="text-xl font-semibold">Главы</h1>
            <p className="mt-4 text-sm leading-6 text-[#cfc4e4]">Глав пока нет.</p>
            <button
              type="button"
              disabled
              className="mt-6 inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-full border border-[#8065ad] px-5 text-sm font-semibold text-white opacity-60"
            >
              + Добавить главу
            </button>
          </aside>

          <section className="flex min-h-80 items-center justify-center rounded-[28px] border border-[#9074c7] bg-[#271647] p-6 text-center sm:p-10">
            <div className="max-w-md">
              <h2 className="text-2xl font-semibold">Выберите главу</h2>
              <p className="mt-4 leading-7 text-[#ddd2f5]">
                После создания глав здесь появятся запись, прослушивание и
                работа с текстом.
              </p>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
