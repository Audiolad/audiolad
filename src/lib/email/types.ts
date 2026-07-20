export type EmailOutboxStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "cancelled"
  | "suppressed";

export type EmailContactType = "registered_user" | "lead" | "author_applicant";

export type EmailContactStatus = "active" | "unlinked" | "anonymized" | "merged";

export type EmailConsentPurpose =
  | "listener_marketing"
  | "listener_recommendations"
  | "author_education"
  | "author_marketing"
  | "product_updates"
  | "platform_news";

export type EmailConsentStatus = "granted" | "revoked";

export type EmailDigestFrequency = "immediate" | "daily" | "weekly";

export type EmailProviderResult =
  | {
      ok: true;
      providerMessageId?: string;
      smtpResponse?: string;
      envelopeFrom?: string;
    }
  | { ok: false; code: string; message: string; retryable?: boolean };

export type EmailProviderMessage = {
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  envelopeFrom?: string;
};

export interface EmailProvider {
  send(message: EmailProviderMessage): Promise<EmailProviderResult>;
}
