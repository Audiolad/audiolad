export type RightsholderEvidenceKind = "generation" | "paid_period";

export type RightsholderExample = {
  kind: RightsholderEvidenceKind;
  label: string;
  title: string;
  /** Real redacted screenshot (Suno only). Text examples have no image — never invent screenshots. */
  src?: string;
  width?: number;
  height?: number;
  alt?: string;
  /** Text example lines, shown instead of a screenshot (MusicGPT / other service). */
  textExample?: string[];
  hint: string;
};

/** Real, redacted screenshots of Sergey's own Suno track and Suno Pro receipt. */
export const RIGHTSHOLDER_EXAMPLES: Record<RightsholderEvidenceKind, RightsholderExample> = {
  generation: {
    kind: "generation",
    label: "Скриншот генерации",
    title: "Пример: страница трека в Suno",
    src: "/business/rightsholder-examples/suno-generation.webp",
    width: 506,
    height: 1068,
    alt: "Пример: страница трека в Suno с блоком Styles и датой создания",
    hint: "Откройте трек в Suno, раскройте блок Styles (Show more) так, чтобы была видна дата создания, и сделайте скриншот. Ссылку возьмите через Share → Copy link.",
  },
  paid_period: {
    kind: "paid_period",
    label: "Квитанция о подписке",
    title: "Пример: квитанция Suno Pro",
    src: "/business/rightsholder-examples/suno-pro-receipt.webp",
    width: 1204,
    height: 1682,
    alt: "Пример: квитанция Suno Pro за месяц, номер и данные карты скрыты",
    hint: "Suno → Account → Billing → квитанция (Receipt) за месяц, в котором создан трек. Номер квитанции и данные карты можно скрыть.",
  },
};

export const RIGHTSHOLDER_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const RIGHTSHOLDER_EVIDENCE_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const SUNO_LINK_RE = /^https:\/\/suno\.com\/(s|song)\/[A-Za-z0-9_-]+\/?$/;

export function validateEvidenceFile(file: File | null): string | null {
  if (!file) return "Добавьте файл";
  if (!(RIGHTSHOLDER_EVIDENCE_MIME as readonly string[]).includes(file.type)) {
    return "Подойдёт PNG, JPG, WEBP или PDF";
  }
  if (file.size > RIGHTSHOLDER_EVIDENCE_MAX_BYTES) return "Файл больше 10 МБ – сожмите его или сделайте скриншот";
  if (file.size === 0) return "Файл пустой";
  return null;
}

export const VERIFICATION_STATUS_TEXT: Record<string, string> = {
  draft: "Черновик",
  submitted: "Заявка на проверке у модератора",
  needs_info: "Модератор просит уточнить",
  rejected: "Заявка отклонена – исправьте и отправьте снова",
  verified: "Пример проверен модератором",
  restricted: "Участие ограничено модератором",
  revoked: "Подтверждение отозвано модератором",
};
