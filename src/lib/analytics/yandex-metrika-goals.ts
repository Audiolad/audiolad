import type { PlatformAnalyticsEventName } from "@/lib/analytics/constants";
import type { PwaAnalyticsEventName } from "@/lib/pwa/analytics-events";

export const YANDEX_METRIKA_RETENTION_GOALS = [
  "first_save_retention_prompt_shown",
  "first_save_retention_prompt_library_clicked",
  "first_save_retention_prompt_dismissed",
  "first_save_retention_prompt_install_clicked",
] as const satisfies readonly PlatformAnalyticsEventName[];

export const YANDEX_METRIKA_PWA_GOALS = [
  "pwa_install_clicked",
  "pwa_ios_instructions_opened",
  "pwa_install_prompt_shown",
  "pwa_install_accepted",
  "pwa_install_dismissed",
  "pwa_installed",
  "pwa_opened_standalone",
] as const satisfies readonly PwaAnalyticsEventName[];

export const YANDEX_METRIKA_CORE_GOALS = [
  "signup_completed",
  "audio_play_started",
  "audio_completed",
  "author_application_submitted",
] as const satisfies readonly PlatformAnalyticsEventName[];

/** Guest «Атлас звучания кофеен мира» (/b/atlas-kofeen): PDF, CTA, switching, listening. */
export const YANDEX_METRIKA_BUSINESS_ATLAS_GOALS = [
  "business_atlas_pdf_opened",
  "business_atlas_pdf_downloaded",
  "business_atlas_cta_clicked",
  "business_atlas_shop_opened",
  "business_atlas_listen_clicked",
] as const;

export type YandexMetrikaBusinessAtlasGoalName =
  (typeof YANDEX_METRIKA_BUSINESS_ATLAS_GOALS)[number];

export type YandexMetrikaRetentionGoalName =
  (typeof YANDEX_METRIKA_RETENTION_GOALS)[number];

export type YandexMetrikaPwaGoalName = (typeof YANDEX_METRIKA_PWA_GOALS)[number];

export type YandexMetrikaCoreGoalName = (typeof YANDEX_METRIKA_CORE_GOALS)[number];

export type YandexMetrikaGoalName =
  | YandexMetrikaCoreGoalName
  | YandexMetrikaRetentionGoalName
  | YandexMetrikaPwaGoalName
  | YandexMetrikaBusinessAtlasGoalName;

const GOAL_NAME_SET = new Set<string>([
  ...YANDEX_METRIKA_CORE_GOALS,
  ...YANDEX_METRIKA_RETENTION_GOALS,
  ...YANDEX_METRIKA_PWA_GOALS,
  ...YANDEX_METRIKA_BUSINESS_ATLAS_GOALS,
]);

export function isYandexMetrikaGoalName(
  value: string,
): value is YandexMetrikaGoalName {
  return GOAL_NAME_SET.has(value);
}
