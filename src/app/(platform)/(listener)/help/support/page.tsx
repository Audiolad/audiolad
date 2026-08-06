import Link from "next/link";
import type { Metadata } from "next";

import HelpSupportForm from "@/components/help/HelpSupportForm";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { buildHelpSupportMetadata } from "@/lib/help/metadata";
import { helpHubHref } from "@/lib/help/paths";
import { sanitizeSupportSourceUrl } from "@/lib/help/source-url";
import { getDisplayName } from "@/lib/profile/display-name";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildHelpSupportMetadata();
}

type PageProps = {
  searchParams?: Promise<{ source?: string; author?: string }>;
};

export default async function HelpSupportPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initialName = "";
  const initialEmail = user?.email?.trim() ?? "";
  let authorId: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    initialName = getDisplayName(profile ?? null, user);

    const authorSlug = params.author?.trim() ?? "";
    if (authorSlug) {
      try {
        const workspaces = await listAuthorWorkspacesForUser(user.id, supabase);
        authorId =
          workspaces.find((workspace) => workspace.slug === authorSlug)?.id ??
          null;
      } catch (error) {
        console.error(
          "help_support_author_resolve_error",
          error instanceof Error ? error.message : "unknown",
        );
        authorId = null;
      }
    }
  }

  const sourceCandidate =
    typeof params.source === "string" && params.source.trim()
      ? params.source.trim().startsWith("/")
        ? `https://audiolad.local${params.source.trim()}`
        : params.source.trim()
      : null;
  const sourceUrl = sanitizeSupportSourceUrl(sourceCandidate);

  return (
    <div className="pb-10 pt-4">
      <nav aria-label="Хлебные крошки" className="text-sm text-[#7d70a2]">
        <Link
          href={helpHubHref()}
          className="font-medium text-[#7042c5] underline-offset-2 hover:underline"
        >
          Справочный центр
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          /
        </span>
        <span className="text-[#25135c]">Поддержка</span>
      </nav>

      <header className="mt-6 max-w-xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[#25135c] sm:text-4xl">
          Задать вопрос
        </h1>
        <p className="mt-4 text-base leading-7 text-[#4a3d73]">
          Опишите ситуацию. Ответ придёт на указанную электронную почту. Мы не
          обещаем мгновенный ответ онлайн-оператора.
        </p>
      </header>

      <HelpSupportForm
        initialName={initialName}
        initialEmail={initialEmail}
        authorId={authorId}
        sourceUrl={sourceUrl}
      />
    </div>
  );
}
