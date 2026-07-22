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
  contact_email: string | null;
  contact_details: string | null;
  direction: string;
  experience: string | null;
  about: string;
  planned_content: string;
  links: string | null;
  has_ready_materials: boolean;
  wants_training: boolean;
  interested_in_school: boolean;
  consent_personal_data: boolean;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_comment: string | null;
  admin_note: string | null;
  author_id: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthorApplicationStatusEventRow = {
  id: string;
  application_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  staff_comment: string | null;
  applicant_comment: string | null;
  created_at: string;
};

export type AuthorAccessStatusEventRow = {
  id: string;
  author_id: string;
  application_id: string | null;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
};

export type AdminAuthorApplicationDetail = AuthorApplicationRow & {
  userEmail: string | null;
  userDisplayName: string | null;
  linkedAuthor: {
    id: string;
    name: string;
    slug: string;
    accessStatus: string;
  } | null;
  accessGrantedEmailDelivery: {
    status: "pending" | "sent" | "failed";
    sentAt: string | null;
    lastError: string | null;
    attemptCount: number;
    lastAttemptAt: string | null;
  } | null;
  applicationEvents: AuthorApplicationStatusEventRow[];
  accessEvents: AuthorAccessStatusEventRow[];
};

export type AuthorApplicationFormValues = {
  displayName: string;
  selectedDirections: string[];
  directionOther: string;
  direction: string;
  about: string;
  contactEmail: string;
  contactDetails: string;
  hasReadyMaterials: boolean;
  wantsTraining: boolean;
  interestedInSchool: boolean;
  consentPersonalData: boolean;
};

export type AuthorApplicationSubmittedContacts = {
  contactEmail: string;
  contactDetails: string;
};

export type AuthorApplicationFieldErrors = Partial<
  Record<
    | keyof AuthorApplicationFormValues
    | "readiness"
    | "form"
    | "auth"
    | "conflict"
    | "submit",
    string
  >
>;

export type AuthorApplicationFormState = {
  ok: boolean;
  submitted?: boolean;
  submittedContacts?: AuthorApplicationSubmittedContacts;
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
