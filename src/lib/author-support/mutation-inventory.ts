export type AuthorSupportMutationDisposition = "allowed_audited" | "blocked";

export type AuthorSupportMutationInventoryItem = {
  key: string;
  group: "product" | "studio" | "cabinet" | "blocked";
  disposition: AuthorSupportMutationDisposition;
  action?: string;
  routePatterns: string[];
};

/**
 * Exhaustive support-mode mutation inventory.
 * Every mutating author/studio route must be A (allowed + audited) or B (blocked).
 */
export const AUTHOR_SUPPORT_MUTATION_INVENTORY: AuthorSupportMutationInventoryItem[] =
  [
    {
      key: "product_create",
      group: "product",
      disposition: "allowed_audited",
      action: "product_created",
      routePatterns: ["src/app/api/author/products/route.ts"],
    },
    {
      key: "product_update",
      group: "product",
      disposition: "allowed_audited",
      action: "product_updated",
      routePatterns: ["src/app/api/author/products/[id]/route.ts"],
    },
    {
      key: "product_topics",
      group: "product",
      disposition: "allowed_audited",
      action: "product_topics_updated",
      routePatterns: ["src/app/api/author/products/[id]/topics/route.ts"],
    },
    {
      key: "product_cover",
      group: "product",
      disposition: "allowed_audited",
      action: "product_cover_updated",
      routePatterns: ["src/app/api/author/products/[id]/cover/route.ts"],
    },
    {
      key: "product_audio_upload",
      group: "product",
      disposition: "allowed_audited",
      action: "product_track_updated",
      routePatterns: [
        "src/app/api/author/products/[id]/audio/route.ts",
        "src/app/api/author/products/[id]/audio/[audioId]/upload/route.ts",
      ],
    },
    {
      key: "product_audio_replace_delete",
      group: "product",
      disposition: "allowed_audited",
      action: "product_track_updated",
      routePatterns: [
        "src/app/api/author/products/[id]/audio/[audioId]/route.ts",
        "src/app/api/author/products/[id]/audio/[audioId]/file/route.ts",
        "src/app/api/author/products/[id]/audio/[audioId]/cover/route.ts",
        "src/app/api/author/products/[id]/audio/reorder/route.ts",
      ],
    },
    {
      key: "product_course",
      group: "product",
      disposition: "allowed_audited",
      action: "product_course_updated",
      routePatterns: [
        "src/app/api/author/products/[id]/course/lessons/route.ts",
        "src/app/api/author/products/[id]/course/lessons/reorder/route.ts",
        "src/app/api/author/products/[id]/course/lessons/[lessonId]/route.ts",
        "src/app/api/author/products/[id]/course/lessons/[lessonId]/blocks/route.ts",
        "src/app/api/author/products/[id]/course/lessons/[lessonId]/blocks/reorder/route.ts",
        "src/app/api/author/products/[id]/course/lessons/[lessonId]/blocks/[blockId]/route.ts",
        "src/app/api/author/products/[id]/course/files/[fileId]/route.ts",
        "src/app/api/author/products/[id]/course/completion-cta/route.ts",
      ],
    },
    {
      key: "product_gallery",
      group: "product",
      disposition: "allowed_audited",
      action: "product_gallery_updated",
      routePatterns: [
        "src/app/api/author/products/[id]/gallery/route.ts",
        "src/app/api/author/products/[id]/gallery/reorder/route.ts",
        "src/app/api/author/products/[id]/gallery/[slideId]/route.ts",
      ],
    },
    {
      key: "product_visibility_users",
      group: "product",
      disposition: "allowed_audited",
      action: "product_visibility_updated",
      routePatterns: [
        "src/app/api/author/products/[id]/visibility-users/route.ts",
        "src/app/api/author/products/[id]/visibility-users/lookup/route.ts",
      ],
    },
    {
      key: "product_price_promotions",
      group: "product",
      disposition: "allowed_audited",
      action: "product_price_promotion_updated",
      routePatterns: [
        "src/app/api/author/products/[id]/price-promotions/route.ts",
        "src/app/api/author/products/[id]/price-promotions/[promotionId]/route.ts",
      ],
    },
    {
      key: "product_submit",
      group: "product",
      disposition: "allowed_audited",
      action: "product_submitted_for_moderation",
      routePatterns: [
        "src/app/api/author/products/[id]/submit-for-moderation/route.ts",
      ],
    },
    {
      key: "product_withdraw",
      group: "product",
      disposition: "allowed_audited",
      action: "product_withdrawn_from_moderation",
      routePatterns: [
        "src/app/api/author/products/[id]/withdraw-from-moderation/route.ts",
      ],
    },
    {
      key: "product_publish",
      group: "product",
      disposition: "allowed_audited",
      action: "product_published",
      routePatterns: ["src/app/api/author/products/[id]/publish/route.ts"],
    },
    {
      key: "product_unpublish",
      group: "product",
      disposition: "allowed_audited",
      action: "product_unpublished",
      routePatterns: ["src/app/api/author/products/[id]/unpublish/route.ts"],
    },
    {
      key: "product_start_editing",
      group: "product",
      disposition: "allowed_audited",
      action: "product_editing_started",
      routePatterns: ["src/app/api/author/products/[id]/start-editing/route.ts"],
    },
    {
      key: "product_soft_delete",
      group: "product",
      disposition: "allowed_audited",
      action: "product_soft_deleted",
      routePatterns: ["src/app/api/author/products/[id]/route.ts"],
    },
    {
      key: "product_archive_restore",
      group: "product",
      disposition: "allowed_audited",
      action: "product_updated",
      routePatterns: [
        "src/app/api/author/products/[id]/archive/route.ts",
        "src/app/api/author/products/[id]/restore-from-archive/route.ts",
      ],
    },
    {
      key: "author_profile",
      group: "cabinet",
      disposition: "allowed_audited",
      action: "author_profile_updated",
      routePatterns: [
        "src/app/api/author/profile/route.ts",
        "src/app/api/author/profile/[kind]/route.ts",
        "src/app/api/author/profile/contact-icon/route.ts",
        "src/app/api/author/profile/banner-position/route.ts",
      ],
    },
    {
      key: "studio_project_create",
      group: "studio",
      disposition: "allowed_audited",
      action: "studio_project_created",
      routePatterns: ["src/app/api/studio/projects/route.ts"],
    },
    {
      key: "studio_project_update",
      group: "studio",
      disposition: "allowed_audited",
      action: "studio_project_updated",
      routePatterns: ["src/app/api/studio/projects/[projectId]/route.ts"],
    },
    {
      key: "studio_project_delete",
      group: "studio",
      disposition: "allowed_audited",
      action: "studio_project_deleted",
      routePatterns: ["src/app/api/studio/projects/[projectId]/route.ts"],
    },
    {
      key: "studio_asset_upload",
      group: "studio",
      disposition: "allowed_audited",
      action: "studio_asset_uploaded",
      routePatterns: ["src/app/api/studio/projects/[projectId]/assets/route.ts"],
    },
    {
      key: "studio_asset_replace_delete",
      group: "studio",
      disposition: "allowed_audited",
      action: "studio_asset_replaced",
      routePatterns: [
        "src/app/api/studio/projects/[projectId]/assets/[assetId]/route.ts",
      ],
    },
    {
      key: "studio_render",
      group: "studio",
      disposition: "allowed_audited",
      action: "studio_render_queued",
      routePatterns: [
        "src/app/api/studio/projects/[projectId]/render/route.ts",
      ],
    },
    {
      key: "studio_guest_handoff",
      group: "blocked",
      disposition: "blocked",
      routePatterns: ["src/app/api/studio/guest/handoff/route.ts"],
    },
    {
      key: "finance_payout",
      group: "blocked",
      disposition: "blocked",
      routePatterns: [
        "src/app/api/author/payout-profile/route.ts",
        "src/app/api/author/finance/terms/route.ts",
        "src/app/api/author/finance/summary/route.ts",
        "src/app/api/author/finance/sales/route.ts",
        "src/app/api/author/finance/sales/[id]/route.ts",
        "src/app/api/author/finance/payouts/route.ts",
        "src/app/api/author/finance/payouts/[id]/route.ts",
        "src/app/api/author/finance/ledger/route.ts",
        "src/app/api/author/finance/ledger/[id]/route.ts",
        "src/app/api/author/finance/export/route.ts",
      ],
    },
    {
      key: "personal_materials",
      group: "blocked",
      disposition: "blocked",
      routePatterns: [
        "src/app/api/author/personal-materials/route.ts",
        "src/app/api/author/personal-materials/settings/route.ts",
        "src/app/api/author/personal-materials/[id]/route.ts",
        "src/app/api/author/personal-materials/[id]/rotate/route.ts",
        "src/app/api/author/personal-materials/[id]/revoke/route.ts",
        "src/app/api/author/personal-materials/[id]/pdf/route.ts",
        "src/app/api/author/personal-materials/[id]/audio/route.ts",
        "src/app/api/author/personal-materials/[id]/activate/route.ts",
        "src/app/api/author/personal-material-templates/route.ts",
        "src/app/api/author/personal-material-templates/[id]/route.ts",
        "src/app/api/author/personal-material-templates/[id]/instantiate/route.ts",
        "src/app/api/author/personal-material-templates/[id]/duplicate/route.ts",
      ],
    },
    {
      key: "promotion_module",
      group: "blocked",
      disposition: "blocked",
      routePatterns: [
        "src/app/api/author/promotion/pages/route.ts",
        "src/app/api/author/promotion/pages/[id]/route.ts",
        "src/app/api/author/promotion/pages/[id]/publish/route.ts",
        "src/app/api/author/promotion/pages/[id]/unpublish/route.ts",
        "src/app/api/author/promotion/offers/route.ts",
        "src/app/api/author/promotion/offers/[id]/route.ts",
        "src/app/api/author/promotion/offers/[id]/publish/route.ts",
        "src/app/api/author/promotion/offers/[id]/unpublish/route.ts",
        "src/app/api/author/promotion/offers/[id]/materials/route.ts",
        "src/app/api/author/promotion/offers/[id]/materials/reorder/route.ts",
        "src/app/api/author/promotion/offers/[id]/materials/[materialId]/route.ts",
        "src/app/api/author/promotion/offers/[id]/materials/[materialId]/image/route.ts",
        "src/app/api/author/promotion/offers/[id]/hero/route.ts",
        "src/app/api/author/promotion/campaigns/route.ts",
        "src/app/api/author/promotion/campaigns/[id]/route.ts",
        "src/app/api/author/promotion/campaigns/[id]/channels/route.ts",
        "src/app/api/author/promotion/campaigns/[id]/channels/[channelId]/route.ts",
      ],
    },
    {
      key: "terms_commercial_projects",
      group: "blocked",
      disposition: "blocked",
      routePatterns: [
        "src/app/api/author/terms/accept/route.ts",
        "src/app/api/author/commercial-application/route.ts",
        "src/app/api/author/projects/route.ts",
        "src/app/api/author/onboarding/route.ts",
      ],
    },
  ];

export function listAuthorSupportAllowedMutationActions(): string[] {
  return AUTHOR_SUPPORT_MUTATION_INVENTORY.filter(
    (item) => item.disposition === "allowed_audited" && item.action,
  ).map((item) => item.action as string);
}

export function listAuthorSupportInventoryRoutePatterns(): string[] {
  return AUTHOR_SUPPORT_MUTATION_INVENTORY.flatMap((item) => item.routePatterns);
}
