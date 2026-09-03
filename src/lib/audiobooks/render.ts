import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-nostdin", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code ?? "unknown"}: ${stderr}`)));
  });
}

/** Normalizes every source before concat, so mixed browser recordings upload safely. */
export async function renderAudiobookChapterToMp3(
  sourcePaths: readonly string[],
  workspace: string,
  renderId: string,
) {
  if (!sourcePaths.length) throw new Error("no_active_fragments");
  const normalized: string[] = [];
  for (const [index, source] of sourcePaths.entries()) {
    const output = join(workspace, `fragment-${index}.mp3`);
    await run(["-i", source, "-vn", "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100", "-ac", "2", "-write_xing", "0", "-y", output]);
    normalized.push(output);
  }
  const outputPath = join(workspace, `${renderId}.mp3`);
  await run(normalized.flatMap((path) => ["-i", path]).concat([
    "-filter_complex", `concat=n=${normalized.length}:v=0:a=1,aresample=44100,aformat=channel_layouts=stereo[out]`,
    "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100", "-ac", "2", "-write_xing", "0", "-y", outputPath,
  ]));
  return { outputPath, sizeBytes: (await stat(outputPath)).size };
}
