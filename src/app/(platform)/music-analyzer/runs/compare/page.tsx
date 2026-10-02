import Link from "next/link";

import { diffJson } from "@/lib/music-analyzer-runs/compare";
import { toClientRun } from "@/lib/music-analyzer-runs/contract";
import { MusicAnalyzerStorageError, getMusicAnalyzerRun } from "@/lib/music-analyzer-runs/repository";

export const dynamic = "force-dynamic";

function cell(value: unknown): string {
  if (value === undefined) return "—";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export default async function MusicAnalyzerComparePage({
  searchParams,
}: {
  searchParams: Promise<{ left?: string; right?: string }>;
}) {
  const { left: leftId, right: rightId } = await searchParams;
  if (!leftId || !rightId || leftId === rightId) {
    return (
      <div className="space-y-3">
        <h2 className="text-[22px] font-semibold text-[#25135c]">Сравнение</h2>
        <p className="text-sm text-[#796ba0]">Выберите два готовых прогона одного файла в истории.</p>
        <Link href="/music-analyzer/runs" className="text-sm font-medium text-[#7042c5]">
          К истории
        </Link>
      </div>
    );
  }
  let unavailable = false;
  let leftRow: Awaited<ReturnType<typeof getMusicAnalyzerRun>> = null;
  let rightRow: Awaited<ReturnType<typeof getMusicAnalyzerRun>> = null;
  try {
    [leftRow, rightRow] = await Promise.all([
      getMusicAnalyzerRun(leftId),
      getMusicAnalyzerRun(rightId),
    ]);
  } catch (error) {
    if (!(error instanceof MusicAnalyzerStorageError)) throw error;
    unavailable = true;
  }
  if (unavailable) {
    return <p className="text-sm text-[#796ba0]">Хранилище прогонов сейчас недоступно.</p>;
  }
  if (!leftRow || !rightRow || leftRow.status !== "succeeded" || rightRow.status !== "succeeded") {
    return <p className="text-sm text-[#796ba0]">Оба прогона должны быть готовы.</p>;
  }
  if (leftRow.sha256 !== rightRow.sha256) {
    return <p className="text-sm text-[#8b2f4b]">Сравниваются только две версии одного SHA256.</p>;
  }
  const left = toClientRun(leftRow, { includePayload: true });
  const right = toClientRun(rightRow, { includePayload: true });
  const diff = diffJson(left.normalizedJson, right.normalizedJson).filter((entry) => entry.state !== "same");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-semibold text-[#25135c]">Сравнение версий</h2>
          <p className="mt-2 break-all font-mono text-xs text-[#796ba0]">{left.sha256}</p>
        </div>
        <Link href="/music-analyzer/runs" className="text-sm font-medium text-[#7042c5]">
          К истории
        </Link>
      </div>
      <p className="text-sm text-[#25135c]">
        Версия {left.versionNumber} ({left.analyzerGitCommit ?? "без коммита"}) и версия {right.versionNumber} ({right.analyzerGitCommit ?? "без коммита"}).
      </p>
      {diff.length === 0 ? (
        <p className="text-sm text-[#796ba0]">Нормализованный JSON совпадает.</p>
      ) : (
        <div className="overflow-x-auto rounded-[22px] border border-[#e4d7f4] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[#796ba0]">
              <tr>
                <th className="px-4 py-3 font-medium">Поле</th>
                <th className="px-4 py-3 font-medium">Версия {left.versionNumber}</th>
                <th className="px-4 py-3 font-medium">Версия {right.versionNumber}</th>
              </tr>
            </thead>
            <tbody>
              {diff.map((entry) => (
                <tr key={entry.path} className="border-t border-[#f0e7f8]">
                  <td className="px-4 py-3 font-mono text-xs text-[#25135c]">{entry.path}</td>
                  <td className="px-4 py-3 text-[#25135c]">{cell(entry.left)}</td>
                  <td className="px-4 py-3 text-[#25135c]">{cell(entry.right)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
