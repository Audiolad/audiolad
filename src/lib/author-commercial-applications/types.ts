export const AUTHOR_COMMERCIAL_APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "needs_changes",
  "approved",
  "rejected",
  "withdrawn",
] as const;

export type AuthorCommercialApplicationStatus =
  (typeof AUTHOR_COMMERCIAL_APPLICATION_STATUSES)[number];

export const FORMAT_PLAN_OPTIONS = [
  "Отдельные практики",
  "Программы",
  "Курсы",
  "Другие аудиоматериалы",
] as const;

export type FormatPlanOption = (typeof FORMAT_PLAN_OPTIONS)[number];

export type AuthorCommercialApplicationRow = {
  id: string;
  author_id: string;
  created_by: string;
  status: AuthorCommercialApplicationStatus;
  planned_products: string;
  topics: string;
  format_plan: string;
  rights_confirmation: boolean;
  team_comment: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_comment: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthorCommercialApplicationStatusEventRow = {
  id: string;
  application_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  staff_comment: string | null;
  applicant_comment: string | null;
  created_at: string;
};

export type AuthorCommercialApplicationFormValues = {
  plannedProducts: string;
  topics: string;
  formatPlan: string;
  rightsConfirmation: boolean;
  teamComment: string;
};

export type AuthorCommercialApplicationFieldErrors = Partial<
  Record<
    | keyof AuthorCommercialApplicationFormValues
    | "form"
    | "auth"
    | "conflict"
    | "submit"
    | "draft",
    string
  >
>;

export type AdminAuthorCommercialApplicationDetail =
  AuthorCommercialApplicationRow & {
    authorName: string | null;
    authorSlug: string | null;
    accessStatus: string | null;
    creatorEmail: string | null;
    creatorDisplayName: string | null;
    applicationEvents: AuthorCommercialApplicationStatusEventRow[];
  };
