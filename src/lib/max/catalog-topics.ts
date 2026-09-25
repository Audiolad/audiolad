import "server-only";

import { listTopicsWithCatalogCountsSafe } from "@/lib/topics/queries";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type MaxCatalogTopic = {
  key: string;
  title: string;
};

export type MaxCatalogTopicsResult =
  | { ok: true; topics: MaxCatalogTopic[] }
  | { ok: false; reason: "storage_unavailable" };

export async function listMaxCatalogTopics(input?: {
  listTopics?: typeof listTopicsWithCatalogCountsSafe;
  getServiceClient?: typeof createServiceRoleClient;
}): Promise<MaxCatalogTopicsResult> {
  try {
    const topics = await (input?.listTopics ?? listTopicsWithCatalogCountsSafe)(
      (input?.getServiceClient ?? createServiceRoleClient)(),
    );

    return {
      ok: true,
      topics: topics
        .filter((topic) => topic.catalogProductCount > 0)
        .map((topic) => ({
          key: topic.key,
          title: topic.title,
        })),
    };
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
}

let listTopicsImpl: () => Promise<MaxCatalogTopicsResult> = () =>
  listMaxCatalogTopics();

export async function loadMaxCatalogTopics(): Promise<MaxCatalogTopicsResult> {
  return listTopicsImpl();
}

export function setListMaxCatalogTopicsForTests(
  fn: (() => Promise<MaxCatalogTopicsResult>) | null,
): void {
  listTopicsImpl = fn ?? (() => listMaxCatalogTopics());
}
