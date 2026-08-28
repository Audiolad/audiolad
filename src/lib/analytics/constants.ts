export const PLATFORM_ANALYTICS_EVENTS = [
  "page_view",
  "practice_view",
  "listen_page_view",
  "audio_play_started",
  "audio_progress_25",
  "audio_progress_50",
  "audio_progress_75",
  "audio_progress_90",
  "audio_completed",
  "signup_started",
  "signup_completed",
  "author_application_started",
  "author_application_submitted",
  "first_manual_library_save",
  "first_save_retention_prompt_shown",
  "first_save_retention_prompt_library_clicked",
  "first_save_retention_prompt_install_clicked",
  "first_save_retention_prompt_dismissed",
  "topic_page_viewed",
  "topic_product_clicked",
  "article_view",
  "article_audio_play",
  "article_practice_open",
  "article_practice_save",
  "article_topic_click",
  "article_related_practice_click",
  "article_toc_click",
  "article_final_audio_click",
  "buy_clicked",
  "product_promo_clicked",
  "author_page_view",
  "help_article_view",
  "help_search",
  "help_search_no_results",
  "help_support_open",
  "help_support_submit",
  "help_article_cta_click",
  "guest_studio_open",
  "guest_project_created",
  "guest_render_started",
  "guest_render_completed",
  "guest_mp3_downloaded",
  "guest_registration_gate_shown",
  "guest_auth_cta_clicked",
] as const;

export type PlatformAnalyticsEventName =
  (typeof PLATFORM_ANALYTICS_EVENTS)[number];

const EVENT_NAME_SET = new Set<string>(PLATFORM_ANALYTICS_EVENTS);

export function isPlatformAnalyticsEventName(
  value: string,
): value is PlatformAnalyticsEventName {
  return EVENT_NAME_SET.has(value);
}

export const SESSION_STORAGE_KEY = "audiolad_analytics_session_id";
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
export const PAGE_VIEW_DEDUP_MS = 5_000;
export const ANALYTICS_RPC_TIMEOUT_MS = 5_000;

export const AUDIO_PROGRESS_MILESTONES = [
  { ratio: 0.25, event: "audio_progress_25" as const },
  { ratio: 0.5, event: "audio_progress_50" as const },
  { ratio: 0.75, event: "audio_progress_75" as const },
  { ratio: 0.9, event: "audio_progress_90" as const },
] as const;

export type AudioProgressMilestoneEvent =
  (typeof AUDIO_PROGRESS_MILESTONES)[number]["event"];

export const LISTENING_SESSION_GAP_MS = 5 * 60 * 1000;
