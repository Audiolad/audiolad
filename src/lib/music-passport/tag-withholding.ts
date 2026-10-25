import { isWithheldTag } from "@/lib/music-analyzer-runs/features.mjs";
import researchLabels from "./research-only-labels.json";

export type TagGroup = "genres" | "styles" | "moods" | "instruments" | "sound_character";
export type TagDecision = (group: TagGroup, tag: unknown) => boolean;

// Generated from research_only=true records in docs/music-analyzer/eval-results-09d393ce.json.
// This is evidence for missing-source fallback, not an unconditional label ban.
const research = new Set(researchLabels);
export function tagIdentity(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, " ").trim().replace(/\s+/g, " ");
}
const groups: Record<string, TagGroup> = {
  genres: "genres", genre: "genres", genre_top: "genres", top_genres: "genres", genre_class: "genres",
  styles: "styles", style: "styles", style_top: "styles", top_styles: "styles", subgenre: "styles",
  moods: "moods", mood: "moods", mood_top: "moods", top_moods: "moods",
  instruments: "instruments", instrument: "instruments", instrument_top: "instruments", top_instruments: "instruments",
  sound_character: "sound_character", soundCharacter: "sound_character", sound_characters: "sound_character", sound: "sound_character",
};

/** Inspect the original payload before any materialization, normalization or top-N cut.
 * Decisions are scoped to one run and group; another track's research flag cannot ban an
 * allowed tag with the same label. Conflicting evidence in the same source fails closed.
 */
export function sourceTagDecision(normalized?: unknown): TagDecision {
  const decisions = new Map<string, boolean>();
  const add = (group: TagGroup, label: string, withheld: boolean) => {
    const key = `${group}:${tagIdentity(label)}`;
    decisions.set(key, withheld || decisions.get(key) === true);
  };
  const walk = (value: unknown, group?: TagGroup, inherited = false, depth = 0): void => {
    if (depth > 12 || value == null) return;
    if (typeof value === "string") { if (group) add(group, value, inherited); return; }
    if (Array.isArray(value)) { for (const item of value) walk(item, group, inherited, depth + 1); return; }
    if (typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    const namedGroup = row.group ?? row.kind ?? row.category ?? row.type ?? row.facet ?? row.slot;
    const ownGroup = typeof namedGroup === "string" ? groups[namedGroup] ?? group : group;
    const withheld = inherited || isWithheldTag(row);
    const label = row.label ?? row.name ?? row.tag ?? row.title ?? row.text ?? row.id ?? row.slug;
    if (ownGroup && typeof label === "string") add(ownGroup, label, withheld);
    for (const [key, child] of Object.entries(row)) {
      if (ownGroup && typeof child === "number" && !label) add(ownGroup, key, withheld);
      if (child && typeof child === "object") walk(child, groups[key] ?? ownGroup, withheld, depth + 1);
      else if (groups[key]) walk(child, groups[key], withheld, depth + 1);
    }
  };
  walk(normalized);
  return (group, tag) => {
    if (isWithheldTag(tag)) return false;
    if (!tag || typeof tag !== "object") return false;
    const label = (tag as { label?: unknown }).label;
    if (typeof label !== "string") return false;
    const identity = tagIdentity(label);
    const withheld = decisions.get(`${group}:${identity}`);
    return withheld === undefined ? !research.has(identity) : !withheld;
  };
}
