import { parseAbsoluteHttpUrl, sanitizeEmailSubject } from "@/lib/email/templates/manual-campaign";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const AUTHOR_CAMPAIGN_FILTER_KINDS = [
  "all_authors",
  "specific_authors",
  "published_products",
  "no_published_products",
  "commercial_authors",
] as const;

export type AuthorCampaignFilterKind = (typeof AUTHOR_CAMPAIGN_FILTER_KINDS)[number];

export type AuthorCampaignFilter =
  | { version: 1; kind: "all_authors" }
  | { version: 1; kind: "specific_authors"; authorIds: string[] }
  | { version: 1; kind: "published_products" }
  | { version: 1; kind: "no_published_products" }
  | { version: 1; kind: "commercial_authors" };

export type ManualCampaignContentInput = {
  heading: string;
  paragraphs: string[];
  cta: { label: string; url: string } | null;
  infoBlock: { title: string; text: string } | null;
  secondaryLink: { label: string; url: string } | null;
};

export type CampaignDraftInput = {
  name?: string | null;
  audienceType: string;
  messageType: string;
  senderIdentity: string;
  subject: string;
  preheader?: string | null;
  content: ManualCampaignContentInput;
  filter: AuthorCampaignFilter;
};

export type CampaignValidationError =
  | "subject_required"
  | "subject_invalid"
  | "heading_required"
  | "paragraphs_required"
  | "url_invalid"
  | "cta_incomplete"
  | "link_incomplete"
  | "audience_not_supported"
  | "sender_not_supported"
  | "filter_invalid"
  | "message_type_invalid"
  | "content_too_long";

export type ValidatedCampaignDraft = {
  name: string | null;
  audienceType: "authors";
  messageType: "author_operational" | "author_marketing";
  senderIdentity: "authors";
  subject: string;
  preheader: string | null;
  content: ManualCampaignContentInput;
  filter: AuthorCampaignFilter;
};

function cleanText(value: string, max: number): string | null {
  const trimmed = value.replace(/\r\n/g, "\n").trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function parseOptionalLink(
  link: { label: string; url: string } | null,
): { ok: true; value: { label: string; url: string } | null } | { ok: false; code: CampaignValidationError } {
  if (!link) {
    return { ok: true, value: null };
  }

  const label = link.label.trim();
  const url = link.url.trim();

  if (!label && !url) {
    return { ok: true, value: null };
  }

  if (!label || !url) {
    return { ok: false, code: "link_incomplete" };
  }

  const absolute = parseAbsoluteHttpUrl(url);

  if (!absolute || label.length > 80) {
    return { ok: false, code: "url_invalid" };
  }

  return { ok: true, value: { label, url: absolute } };
}

export function parseAuthorCampaignFilter(value: unknown): AuthorCampaignFilter | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const kind = record.kind;

  if (kind === "all_authors") {
    return { version: 1, kind: "all_authors" };
  }

  if (kind === "published_products") {
    return { version: 1, kind: "published_products" };
  }

  if (kind === "no_published_products") {
    return { version: 1, kind: "no_published_products" };
  }

  if (kind === "commercial_authors") {
    return { version: 1, kind: "commercial_authors" };
  }

  if (kind === "specific_authors") {
    const authorIdsRaw = record.authorIds;
    if (!Array.isArray(authorIdsRaw) || authorIdsRaw.length === 0 || authorIdsRaw.length > 500) {
      return null;
    }

    const authorIds: string[] = [];
    for (const item of authorIdsRaw) {
      if (typeof item !== "string" || !UUID_RE.test(item)) {
        return null;
      }
      const normalized = item.toLowerCase();
      if (!authorIds.includes(normalized)) {
        authorIds.push(normalized);
      }
    }

    return { version: 1, kind: "specific_authors", authorIds };
  }

  return null;
}

export function validateCampaignDraft(
  input: CampaignDraftInput,
): { ok: true; value: ValidatedCampaignDraft } | { ok: false; code: CampaignValidationError } {
  if (input.audienceType !== "authors") {
    return { ok: false, code: "audience_not_supported" };
  }

  if (input.senderIdentity !== "authors") {
    return { ok: false, code: "sender_not_supported" };
  }

  if (input.messageType !== "author_operational" && input.messageType !== "author_marketing") {
    return { ok: false, code: "message_type_invalid" };
  }

  const subject = sanitizeEmailSubject(input.subject);
  if (!input.subject.trim()) {
    return { ok: false, code: "subject_required" };
  }
  if (!subject) {
    return { ok: false, code: "subject_invalid" };
  }

  const heading = cleanText(input.content.heading, 200);
  if (!heading) {
    return { ok: false, code: "heading_required" };
  }

  if (input.content.paragraphs.length === 0 || input.content.paragraphs.length > 12) {
    return { ok: false, code: "paragraphs_required" };
  }

  const paragraphs: string[] = [];
  for (const paragraph of input.content.paragraphs) {
    const cleaned = cleanText(paragraph, 4000);
    if (!cleaned) {
      return { ok: false, code: "paragraphs_required" };
    }
    paragraphs.push(cleaned);
  }

  const preheaderRaw = input.preheader?.trim() ?? "";
  const preheader = preheaderRaw ? cleanText(preheaderRaw, 180) : null;
  if (preheaderRaw && !preheader) {
    return { ok: false, code: "content_too_long" };
  }

  if (input.content.cta && (!input.content.cta.label.trim() || !input.content.cta.url.trim())) {
    return { ok: false, code: "cta_incomplete" };
  }

  const cta = parseOptionalLink(input.content.cta);
  if (!cta.ok) {
    return cta.code === "link_incomplete"
      ? { ok: false, code: "cta_incomplete" }
      : cta;
  }

  const secondary = parseOptionalLink(input.content.secondaryLink);
  if (!secondary.ok) {
    return secondary;
  }

  let infoBlock: ManualCampaignContentInput["infoBlock"] = null;
  if (input.content.infoBlock) {
    const text = cleanText(input.content.infoBlock.text, 2000);
    const titleRaw = input.content.infoBlock.title.trim();
    const title = titleRaw ? cleanText(titleRaw, 120) : "";
    if (input.content.infoBlock.text.trim() && !text) {
      return { ok: false, code: "content_too_long" };
    }
    if (titleRaw && title === null) {
      return { ok: false, code: "content_too_long" };
    }
    if (text) {
      infoBlock = { title: title ?? "", text };
    }
  }

  const filter = parseAuthorCampaignFilter(input.filter);
  if (!filter) {
    return { ok: false, code: "filter_invalid" };
  }

  const name = input.name?.trim() ? cleanText(input.name, 160) : null;
  if (input.name?.trim() && !name) {
    return { ok: false, code: "content_too_long" };
  }

  return {
    ok: true,
    value: {
      name,
      audienceType: "authors",
      messageType: input.messageType,
      senderIdentity: "authors",
      subject,
      preheader,
      content: {
        heading,
        paragraphs,
        cta: cta.value,
        infoBlock,
        secondaryLink: secondary.value,
      },
      filter,
    },
  };
}
