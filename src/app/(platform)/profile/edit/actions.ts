"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const fullName = `${firstName} ${lastName}`.trim();

  if (!fullName) {
    redirect("/profile/edit?error=empty_name");
  }

  const { data: updatedProfile, error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();

  if (profileError) {
    redirect("/profile/edit?error=profile_update_failed");
  }

  if (!updatedProfile?.id) {
    redirect("/profile/edit?error=profile_not_found");
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
    },
  });

  if (metadataError) {
    redirect("/profile/edit?error=metadata_update_failed");
  }

  redirect("/profile?updated=1");
}
