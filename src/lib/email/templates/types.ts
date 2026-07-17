export type EmailTemplateRenderInput = {
  templateKey: string;
  templateVersion: string;
  payload: Record<string, unknown>;
  locale?: string;
};

export type EmailTemplateRenderResult =
  | {
      ok: true;
      subject: string;
      html: string;
      text?: string;
    }
  | { ok: false; code: "template_not_found" | "invalid_payload" };

export interface EmailTemplateRenderer {
  render(input: EmailTemplateRenderInput): Promise<EmailTemplateRenderResult>;
}
