export type AuthorTermsVersionRow = {
  id: string;
  version: string;
  title: string;
  published_at: string;
  effective_at: string;
  content_hash: string;
  document_key: string;
  is_current: boolean;
  created_at: string;
};

export type AuthorTermsAcceptanceRow = {
  id: string;
  author_id: string;
  terms_version_id: string;
  accepted_at: string;
  accepted_by_user_id: string;
  acceptance_text: string;
  created_at: string;
};

export type AuthorTermsStatusView = {
  currentVersion: {
    id: string;
    version: string;
    title: string;
    publishedAt: string;
    effectiveAt: string;
    contentHash: string;
    url: string;
  } | null;
  acceptedCurrent: boolean;
  acceptance: {
    acceptedAt: string;
    termsVersionId: string;
    version: string;
  } | null;
  canAccept: boolean;
  role: "owner" | "editor" | null;
};

export const AUTHOR_TERMS_ACCEPTANCE_REQUIRED = "AUTHOR_TERMS_ACCEPTANCE_REQUIRED" as const;

export const AUTHOR_TERMS_ACCEPTANCE_CHECKBOX_TEXT =
  "Я ознакомился(ась) с Авторскими условиями сотрудничества платформы «АудиоЛад» и принимаю их в полном объёме.";

export const AUTHOR_TERMS_ACCEPTANCE_CHECKBOX_TEXT_UPDATED =
  "Я ознакомился(ась) с новой редакцией Авторских условий сотрудничества и принимаю её в полном объёме.";
