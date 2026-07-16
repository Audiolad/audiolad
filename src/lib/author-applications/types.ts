export const AUTHOR_APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "needs_changes",
  "approved",
  "rejected",
  "withdrawn",
] as const;

export type AuthorApplicationStatus = (typeof AUTHOR_APPLICATION_STATUSES)[number];

export type AuthorApplicationRow = {
  id: string;
  user_id: string;
  status: AuthorApplicationStatus;
  display_name: string;
  contact: string | null;
  direction: string;
  experience: string | null;
  about: string;
  planned_content: string;
  links: string | null;
  has_ready_materials: boolean;
  consent_personal_data: boolean;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_comment: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthorApplicationFormValues = {
  displayName: string;
  direction: string;
  about: string;
  plannedContent: string;
  links: string;
  contact: string;
  hasReadyMaterials: boolean;
  consentPersonalData: boolean;
};

export type AuthorApplicationFieldErrors = Partial<
  Record<
    | keyof AuthorApplicationFormValues
    | "form"
    | "auth"
    | "conflict"
    | "submit",
    string
  >
>;

export type AuthorApplicationFormState = {
  ok: boolean;
  errors: AuthorApplicationFieldErrors;
  values?: AuthorApplicationFormValues;
};

export type BecomeAuthorAudience =
  | "guest"
  | "listener"
  | "author"
  | "application";

export type BecomeAuthorPageView = {
  audience: BecomeAuthorAudience;
  application: AuthorApplicationRow | null;
  workspaceCount: number;
  userEmail: string | null;
  showSubmittedBanner: boolean;
};

export type ProfileApplicationVariant =
  | "none"
  | "draft"
  | "submitted"
  | "in_review"
  | "needs_changes"
  | "approved_pending_access"
  | "rejected";
