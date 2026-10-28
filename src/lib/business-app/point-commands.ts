export const POINT_COMMAND_TYPES = ["pause", "resume", "next_track"] as const;

export type PointCommandType = (typeof POINT_COMMAND_TYPES)[number];

const COMMAND_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPointCommandType(value: unknown): value is PointCommandType {
  return typeof value === "string" && (POINT_COMMAND_TYPES as readonly string[]).includes(value);
}

export function isPointCommandId(value: unknown): value is string {
  return typeof value === "string" && COMMAND_ID_RE.test(value);
}

/** What the venue device does with one command. Already-correct playback is a no-op. */
export function pointCommandAction(
  status: string,
  type: PointCommandType,
): "toggle" | "next" | "none" {
  if (type === "next_track") return "next";
  const playing = status === "playing" || status === "loading";
  if (type === "pause") return playing ? "toggle" : "none";
  return playing ? "none" : "toggle";
}
