export const TEST_USER_RESET_BLOCK_CODES = {
  wrong_email_target: "wrong_email_target",
  platform_owner_target: "platform_owner_target",
  platform_admin_target: "platform_admin_target",
  orders: "orders",
  payments: "payments",
  refunds: "refunds",
  author_membership: "author_membership",
  author_applications: "author_applications",
  personal_materials: "personal_materials",
  promotion_campaigns: "promotion_campaigns",
  personal_material_templates: "personal_material_templates",
  author_workspace_references: "author_workspace_references",
  self_reset: "self_reset",
} as const;

export type TestUserResetBlockCode =
  (typeof TEST_USER_RESET_BLOCK_CODES)[keyof typeof TEST_USER_RESET_BLOCK_CODES];

export type TestUserResetBlocker = {
  code: TestUserResetBlockCode;
  message: string;
};

export type TestUserResetPreflightCounts = {
  userPractices: number;
  practiceAudioProgress: number;
  playlists: number;
  playlistItems: number;
  emailContacts: number;
  emailPreferences: number;
  emailConsents: number;
  emailOutbox: number;
  emailDeliveryEvents: number;
  analyticsSessions: number;
  analyticsEvents: number;
  orders: number;
  payments: number;
  refundedOrders: number;
  personalMaterialsCreated: number;
  personalMaterialsClaimed: number;
  authorMembers: number;
  authorApplications: number;
  promotionCampaigns: number;
  personalMaterialTemplates: number;
};

export type TestUserResetPreflight = {
  allowlistedEmail: string;
  authUserFound: boolean;
  authUserId: string | null;
  profileFound: boolean;
  profileRole: string | null;
  profileDisplayName: string | null;
  emailContactIds: string[];
  anonymousIds: string[];
  analyticsSessionIds: string[];
  counts: TestUserResetPreflightCounts;
  blockers: TestUserResetBlocker[];
  canReset: boolean;
};

export type TestUserResetDeletedCounts = {
  emailDeliveryEvents: number;
  emailOutbox: number;
  emailConsents: number;
  emailPreferences: number;
  emailContacts: number;
  analyticsEvents: number;
  analyticsSessions: number;
  avatarRemoved: boolean;
  authUserDeleted: boolean;
};

export type TestUserResetStatus = "success" | "partial" | "failed";

export type TestUserResetResult = {
  status: TestUserResetStatus;
  authUserId: string | null;
  deletedCounts: TestUserResetDeletedCounts;
  notDeleted: string[];
  blockers?: TestUserResetBlocker[];
  errorCode?: string;
  message?: string;
  browserHint: string;
  alreadyReset?: boolean;
};

export type AdminOperationLogStatus = TestUserResetStatus;
