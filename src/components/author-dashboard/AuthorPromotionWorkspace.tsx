"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import AuthorPromoPagesClient from "@/components/author-dashboard/AuthorPromoPagesClient";
import AuthorPromotionClient from "@/components/author-dashboard/AuthorPromotionClient";
import AuthorPromotionTabs, {
  parsePromotionTab,
} from "@/components/author-dashboard/AuthorPromotionTabs";
import type { AuthorWorkspace } from "@/lib/author-products/types";

type AuthorPromotionWorkspaceProps = {
  authors: AuthorWorkspace[];
};

export default function AuthorPromotionWorkspace({
  authors,
}: AuthorPromotionWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeTab = parsePromotionTab(searchParams.get("tab"));

  const selectedAuthor = useMemo(() => {
    const slug = searchParams.get("author");
    return authors.find((author) => author.slug === slug) ?? authors[0] ?? null;
  }, [authors, searchParams]);

  function handleAuthorChange(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("author", slug);
    router.replace(`/author-dashboard/promotion?${params.toString()}`);
  }

  if (!selectedAuthor) {
    return null;
  }

  return (
    <div className="space-y-8">
      <AuthorDashboardNav authorSlug={selectedAuthor.slug} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="block flex-1">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">
            Авторское пространство
          </span>
          <select
            value={selectedAuthor.slug}
            onChange={(event) => handleAuthorChange(event.target.value)}
            className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#9a74d8]"
          >
            {authors.map((author) => (
              <option key={author.id} value={author.slug}>
                {author.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <AuthorPromotionTabs activeTab={activeTab} />

      {activeTab === "pages" ? (
        <AuthorPromoPagesClient selectedAuthor={selectedAuthor} />
      ) : (
        <AuthorPromotionClient
          authors={authors}
          shellless
          selectedAuthor={selectedAuthor}
        />
      )}
    </div>
  );
}
