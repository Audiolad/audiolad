import { randomBytes } from "node:crypto";

export type PrivateAudioStage =
  | "auth"
  | "parse_form"
  | "validate_metadata"
  | "validate_audio"
  | "ffprobe"
  | "quota"
  | "storage_audio"
  | "storage_cover"
  | "db_insert"
  | "cleanup";

/** Short public reference code, e.g. PA-A1B2. */
export function createPrivateAudioOpId(): string {
  return `PA-${randomBytes(2).toString("hex").toUpperCase()}`;
}

export function logPrivateAudioFailure(input: {
  opId: string;
  stage: PrivateAudioStage | "unknown";
  code: string;
  status: number;
}): void {
  console.error(
    "private_audio_failure",
    JSON.stringify({
      opId: input.opId,
      stage: input.stage,
      code: input.code,
      status: input.status,
    }),
  );
}
