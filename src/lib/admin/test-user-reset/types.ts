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
  foreign_membership: "foreign_membership",
  other_members_on_owned_authors: "other_members_on_owned_authors",
  test_as_referrer: "test_as_referrer",
  royalty: "royalty",
  partner_reward: "partner_reward",
  payout: "payout",
  payout_profile: "payout_profile",
  owned_author_content: "owned_author_content",
  foreign_attribution: "foreign_attribution",
  pending_referrer_attribution: "pending_referrer_attribution",
  capacity_grants: "capacity_grants",
  protected_author: "protected_author",
  foreign_terms: "foreign_terms",
  db_reset_blocked: "db_reset_blocked",
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
  practiceListenStats: number;
  practiceRatings: number;
  practiceRatingEvents: number;
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
  privateAudioItems: number;
  authorMembers: number;
  authorApplications: number;
  promotionCampaigns: number;
  personalMaterialTemplates: number;
  inviteeReferrals: number;
  attributions: number;
  ownedAuthors: number;
  partnerBonus: number;
  capacityGrants: number;
  foreignAuthorMemberships: number;
  otherMembersOnOwnedAuthors: number;
  referrerReferrals: number;
  foreignAttributions: number;
  pendingReferrerAttributions: number;
  authorLedgerEntries: number;
  partnerRewardLedgerEntries: number;
  authorPayouts: number;
  authorPayoutProfiles: number;
  ownedAuthorContent: number;
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
  privateAudioItemsRemoved: number;
  inviteeReferrals: number;
  attributions: number;
  ownedAuthors: number;
  authorMembersRemoved: number;
  authorApplicationsRemoved: number;
  capacityGrants: number;
  partnerBonusCleared: number;
  dbCleanupCompleted: boolean;
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
