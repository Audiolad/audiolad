import { notFound } from "next/navigation";

import { AccessLinkLanding } from "@/components/access/AccessLinkLanding";
import { AccessLinkError, previewPracticeAccessLink } from "@/lib/products/access-links-server";
import { buildAccessLinkPath, isValidPracticeAccessTokenFormat } from "@/lib/products/access-links";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata() {
  return {
    title: "Доступ к продукту",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function PracticeAccessLinkPage({ params }: PageProps) {
  const { token } = await params;

  if (!isValidPracticeAccessTokenFormat(token)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let preview;
  try {
    preview = await previewPracticeAccessLink({
      rawToken: token,
      userId: user?.id ?? null,
    });
  } catch (error) {
    if (error instanceof AccessLinkError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <AccessLinkLanding
      token={token}
      returnPath={buildAccessLinkPath(token)}
      preview={preview}
      isAuthenticated={Boolean(user)}
    />
  );
}
