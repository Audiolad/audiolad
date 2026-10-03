import { CLASSICA_REVIEW_PLACEHOLDER } from "@/lib/classica/production/packaging";
import { CLASSICA_SLUG_PATTERN } from "@/lib/classica/production/slug";

export const CLASSICA_CHECKLIST_IDS = [
  "audio",
  "playback",
  "composer",
  "title",
  "score",
  "rights",
  "seo_title",
  "seo_description",
  "body",
  "cover",
  "slug",
] as const;

export type ClassicaChecklistId = (typeof CLASSICA_CHECKLIST_IDS)[number];

export const CLASSICA_CHECKLIST_LABELS: Record<ClassicaChecklistId, string> = {
  audio: "Загружено итоговое аудио",
  playback: "Аудио воспроизводится",
  composer: "Указан композитор",
  title: "Заполнено точное название",
  score: "Указан источник партитуры",
  rights: "Права проверены",
  seo_title: "Заполнен SEO title",
  seo_description: "Заполнено SEO description",
  body: "Заполнен основной текст",
  cover: "Загружена обложка",
  slug: "Заполнен slug",
};

export type ClassicaChecklistInput = {
  hasFinalAudio: boolean;
  audioPlaybackConfirmed: boolean;
  durationSeconds: number | null;
  composerName: string | null;
  title: string | null;
  scoreSource: string | null;
  rightsChecked: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  body: string | null;
  hasCover: boolean;
  slug: string | null;
};

export type ClassicaChecklistItem = {
  id: ClassicaChecklistId;
  label: string;
  passed: boolean;
};

const SEO_TITLE_MAX = 140;
const SEO_DESCRIPTION_MAX = 300;

function trimmed(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function evaluateClassicaChecklist(
  input: ClassicaChecklistInput,
): { items: ClassicaChecklistItem[]; ready: boolean; gaps: ClassicaChecklistId[] } {
  const seoTitle = trimmed(input.seoTitle);
  const seoDescription = trimmed(input.seoDescription);
  const slug = trimmed(input.slug);
  const passed: Record<ClassicaChecklistId, boolean> = {
    audio: input.hasFinalAudio,
    playback:
      input.hasFinalAudio &&
      input.audioPlaybackConfirmed &&
      typeof input.durationSeconds === "number" &&
      input.durationSeconds > 0,
    composer: trimmed(input.composerName).length >= 2,
    title: trimmed(input.title).length >= 2,
    score: trimmed(input.scoreSource).length >= 2,
    rights: input.rightsChecked,
    seo_title:
      seoTitle.length >= 1 &&
      seoTitle.length <= SEO_TITLE_MAX &&
      seoTitle !== CLASSICA_REVIEW_PLACEHOLDER,
    seo_description:
      seoDescription.length >= 1 &&
      seoDescription.length <= SEO_DESCRIPTION_MAX &&
      seoDescription !== CLASSICA_REVIEW_PLACEHOLDER,
    body:
      trimmed(input.body).length >= 20 &&
      trimmed(input.body) !== CLASSICA_REVIEW_PLACEHOLDER,
    cover: input.hasCover,
    slug: CLASSICA_SLUG_PATTERN.test(slug),
  };

  const items = CLASSICA_CHECKLIST_IDS.map((id) => ({
    id,
    label: CLASSICA_CHECKLIST_LABELS[id],
    passed: passed[id],
  }));
  const gaps = items.filter((item) => !item.passed).map((item) => item.id);

  return { items, ready: gaps.length === 0, gaps };
}
