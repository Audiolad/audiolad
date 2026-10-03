import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailButton,
  renderBrandEmailHeading,
  renderBrandEmailInfoBlock,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";
import { escapeHtml } from "./escape-html";

export const MANUAL_CAMPAIGN_TEMPLATE_KEY = "manual_campaign";
export const MANUAL_CAMPAIGN_TEMPLATE_VERSION = "manual-campaign-v1-20261219";

const FIRST_NAME_TOKEN = "{{first_name}}";

export type ManualCampaignLink = {
  label: string;
  url: string;
};

export type ManualCampaignContent = {
  heading: string;
  paragraphs: string[];
  cta: ManualCampaignLink | null;
  infoBlock: { title: string; text: string } | null;
  secondaryLink: ManualCampaignLink | null;
};

export type ManualCampaignRenderInput = {
  subject: string;
  preheader?: string | null;
  content: ManualCampaignContent;
  firstName?: string | null;
  unsubscribeUrl?: string | null;
  siteOrigin?: string;
};

export type ManualCampaignRenderResult =
  | { ok: true; subject: string; html: string; text: string }
  | { ok: false; code: "invalid_payload" | "url_invalid" };

export function parseAbsoluteHttpUrl(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed || trimmed.length > 2000 || /[\s\u0000-\u001F\u007F]/.test(trimmed)) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  if (url.username || url.password) {
    return null;
  }

  return url.toString();
}

export function sanitizeEmailSubject(value: string): string | null {
  const trimmed = value.replace(/\s+/g, " ").trim();

  if (!trimmed || trimmed.length > 180) {
    return null;
  }

  if (/[\r\n\u0000-\u001F\u007F]/.test(value)) {
    return null;
  }

  return trimmed;
}

/**
 * A blank optional CTA or secondary link is absent. Whitespace-only fields
 * count as blank. A link with any text still has to pass URL checks later.
 */
export function normalizeOptionalCampaignLink(
  link: ManualCampaignLink | null | undefined,
): ManualCampaignLink | null {
  if (!link) {
    return null;
  }

  const label = link.label.trim();
  const url = link.url.trim();

  if (!label && !url) {
    return null;
  }

  return { label, url };
}

/** Replaces only the exact {{first_name}} token. No other template evaluation. */
export function applyFirstNamePlaceholder(
  text: string,
  firstName: string | null | undefined,
): string {
  if (!text.includes(FIRST_NAME_TOKEN)) {
    return text;
  }

  const name = firstName?.trim() ?? "";

  if (name) {
    return text.split(FIRST_NAME_TOKEN).join(name);
  }

  return text
    .replace(/,\s*\{\{first_name\}\}/g, "")
    .replace(/\{\{first_name\}\}\s*,?/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([!?.])/g, "$1")
    .trim();
}

function personalize(text: string, firstName: string | null | undefined): string {
  return applyFirstNamePlaceholder(text, firstName);
}

export function renderManualCampaignEmail(
  input: ManualCampaignRenderInput,
): ManualCampaignRenderResult {
  const subject = sanitizeEmailSubject(input.subject);
  const heading = personalize(input.content.heading, input.firstName).trim();
  const paragraphs = input.content.paragraphs
    .map((paragraph) => personalize(paragraph, input.firstName).trim())
    .filter(Boolean);

  if (!subject || !heading || paragraphs.length === 0) {
    return { ok: false, code: "invalid_payload" };
  }

  const cta = normalizeOptionalCampaignLink(input.content.cta);
  const secondaryLink = normalizeOptionalCampaignLink(input.content.secondaryLink);
  const ctaUrl = cta ? parseAbsoluteHttpUrl(cta.url) : null;
  if (cta && (!ctaUrl || !cta.label)) {
    return { ok: false, code: "url_invalid" };
  }

  const secondaryUrl = secondaryLink ? parseAbsoluteHttpUrl(secondaryLink.url) : null;
  if (secondaryLink && (!secondaryUrl || !secondaryLink.label)) {
    return { ok: false, code: "url_invalid" };
  }

  const unsubscribeUrl = input.unsubscribeUrl
    ? parseAbsoluteHttpUrl(input.unsubscribeUrl)
    : null;
  if (input.unsubscribeUrl && !unsubscribeUrl) {
    return { ok: false, code: "url_invalid" };
  }

  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;
  const preheader =
    input.preheader?.trim() ||
    paragraphs[0]?.slice(0, 140) ||
    heading;

  const blocks: string[] = [
    renderBrandEmailHeading(heading),
    ...paragraphs.map((paragraph, index) =>
      renderBrandEmailParagraph(
        escapeHtml(paragraph),
        index === 0 ? "email-greeting" : "email-body",
        index === paragraphs.length - 1 ? "0 0 24px" : "0 0 10px",
      ),
    ),
  ];

  if (cta && ctaUrl) {
    blocks.push(renderBrandEmailButton(ctaUrl, cta.label, { msoWidth: 360 }));
  }

  if (input.content.infoBlock?.text.trim()) {
    const infoParts = [
      input.content.infoBlock.title.trim()
        ? renderBrandEmailParagraph(
            `<strong>${escapeHtml(input.content.infoBlock.title.trim())}</strong>`,
            "email-body",
            "0 0 10px",
          )
        : "",
      renderBrandEmailParagraph(
        escapeHtml(personalize(input.content.infoBlock.text, input.firstName).trim()),
        "email-body",
        "0",
      ),
    ].filter(Boolean);
    blocks.push(renderBrandEmailInfoBlock(infoParts.join("\n")));
  }

  if (secondaryLink && secondaryUrl) {
    blocks.push(
      renderBrandEmailParagraph(
        `<a href="${escapeHtml(secondaryUrl)}" style="color:#5e2ca5;text-decoration:underline;">${escapeHtml(secondaryLink.label)}</a>`,
        "email-body",
        "0 0 8px",
      ),
    );
  }

  blocks.push(renderBrandEmailParagraph("С заботой,", "email-body", "24px 0 0"));
  blocks.push(
    renderBrandEmailParagraph("<strong>команда АудиоЛада</strong>", "email-body", "0"),
  );

  const footerExtraHtml = unsubscribeUrl
    ? `<p class="email-footer" style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#756b88;text-align:center;">
        <a href="${escapeHtml(unsubscribeUrl)}" style="color:#5e2ca5;text-decoration:underline;">Отписаться от информационных писем</a>
      </p>`
    : "";

  const html = renderBrandEmailShell({
    title: subject,
    preheader,
    logoUrl,
    bodyHtml: blocks.join("\n"),
    footerLines: [
      escapeHtml("© АудиоЛад, 2026. Все права защищены."),
      escapeHtml("Вы получили это письмо как автор АудиоЛада."),
    ],
    footerExtraHtml,
    versionComment: `AUDIOLAD_MANUAL_CAMPAIGN ${MANUAL_CAMPAIGN_TEMPLATE_VERSION}`,
  });

  const text = [
    subject,
    "",
    heading,
    "",
    ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
    cta && ctaUrl ? `${cta.label}: ${ctaUrl}` : "",
    input.content.infoBlock?.text.trim()
      ? [
          input.content.infoBlock.title.trim(),
          personalize(input.content.infoBlock.text, input.firstName).trim(),
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    secondaryLink && secondaryUrl ? `${secondaryLink.label}: ${secondaryUrl}` : "",
    "",
    "С заботой,",
    "команда АудиоЛада",
    "",
    "© АудиоЛад, 2026. Все права защищены.",
    "Вы получили это письмо как автор АудиоЛада.",
    unsubscribeUrl ? `Отписаться от информационных писем: ${unsubscribeUrl}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { ok: true, subject, html, text };
}
