import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
import {
  getGuestHomeData,
  getPersonalHomeData,
} from "@/lib/home/data";
import {
  loadGuestHomeDataSafe,
  loadPersonalHomeDataSafe,
} from "@/lib/home/load-safe";
import { loadHomeTopicsSafe } from "@/lib/home/topic-navigation";
import { logHomeSectionError } from "@/lib/home/safe";
import type { GuestHomeData, PersonalHomeData } from "@/lib/home/types";

import GuestHome from "@/components/home/GuestHome";
import HomeCriticalFallback from "@/components/home/HomeCriticalFallback";
import PersonalHome from "@/components/home/PersonalHome";
import JsonLd from "@/components/seo/JsonLd";
import { buildHomeJsonLd } from "@/lib/seo/json-ld";
import { buildHomeMetadata } from "@/lib/seo/public-page-metadata";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildHomeMetadata();
}

type HomeRenderState =
  | { kind: "guest"; data: GuestHomeData }
  | { kind: "personal"; data: PersonalHomeData }
  | { kind: "critical" };

async function resolveHomeRenderState(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<HomeRenderState> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const personalData = await loadPersonalHomeDataSafe(() =>
        getPersonalHomeData(supabase, user.id, user.user_metadata),
      );

      return { kind: "personal", data: personalData };
    }

    const guestData = await loadGuestHomeDataSafe(() =>
      getGuestHomeData(supabase),
    );

    return { kind: "guest", data: guestData };
  } catch (error) {
    logHomeSectionError("home_route", error);
    return { kind: "critical" };
  }
}

export default async function Home() {
  const supabase = await createClient();

  const [state, homeTopics] = await Promise.all([
    resolveHomeRenderState(supabase),
    loadHomeTopicsSafe(supabase),
  ]);

  if (state.kind === "critical") {
    return (
      <>
        <JsonLd data={buildHomeJsonLd()} />
        <HomeCriticalFallback />
      </>
    );
  }

  if (state.kind === "personal") {
    return (
      <>
        <JsonLd data={buildHomeJsonLd()} />
        <PersonalHome data={state.data} homeTopics={homeTopics} />
      </>
    );
  }

  return (
    <>
      <JsonLd data={buildHomeJsonLd()} />
      <GuestHome data={state.data} homeTopics={homeTopics} />
    </>
  );
}
