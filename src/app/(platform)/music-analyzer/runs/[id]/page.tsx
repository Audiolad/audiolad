import { notFound } from "next/navigation";

import { RunDetail } from "@/components/music-analyzer-runs/RunDetail";
import { toClientRun } from "@/lib/music-analyzer-runs/contract";
import {
  MusicAnalyzerStorageError,
  getMusicAnalyzerRun,
  listMusicAnalyzerRunsBySha,
} from "@/lib/music-analyzer-runs/repository";

export const dynamic = "force-dynamic";

export default async function MusicAnalyzerRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let unavailable = false;
  let row: Awaited<ReturnType<typeof getMusicAnalyzerRun>> = null;
  try {
    row = await getMusicAnalyzerRun(id);
  } catch (error) {
    if (!(error instanceof MusicAnalyzerStorageError)) throw error;
    unavailable = true;
  }
  if (unavailable) {
    return <p className="text-sm text-[#796ba0]">Хранилище прогонов сейчас недоступно.</p>;
  }
  if (!row) notFound();
  const siblings = await listMusicAnalyzerRunsBySha(row.sha256);
  return (
    <RunDetail
      initial={toClientRun(row, { includePayload: true })}
      siblings={siblings.map((item) => toClientRun(item))}
    />
  );
}
