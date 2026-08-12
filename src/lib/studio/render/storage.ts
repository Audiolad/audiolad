import { createHash } from "node:crypto";

export function renderOutputPath(jobId: string): string {
  return `jobs/${jobId}/${createHash("sha256").update(jobId).digest("hex").slice(0, 20)}.mp3`;
}
