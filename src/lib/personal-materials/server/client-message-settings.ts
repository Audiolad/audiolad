import type { SupabaseClient } from "@supabase/supabase-js";

import {
  normalizeStoredClientMessageTemplate,
  validateClientMessageTemplate,
} from "@/lib/personal-materials/client-message-template";

import { PersonalMaterialApiError } from "./errors";

export type AuthorClientMessageSettings = {
  clientMessageTemplate: string | null;
};

export async function getAuthorClientMessageSettings(
  supabase: SupabaseClient,
  authorId: string,
): Promise<AuthorClientMessageSettings> {
  const { data, error } = await supabase
    .from("authors")
    .select("client_message_template")
    .eq("id", authorId)
    .maybeSingle();

  if (error) {
    console.error("author_client_message_settings_get_error", error.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  if (!data) {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  return {
    clientMessageTemplate:
      typeof data.client_message_template === "string"
        ? data.client_message_template
        : null,
  };
}

export async function updateAuthorClientMessageSettings(
  supabase: SupabaseClient,
  authorId: string,
  clientMessageTemplate: string | null | undefined,
): Promise<AuthorClientMessageSettings> {
  const normalized = normalizeStoredClientMessageTemplate(clientMessageTemplate);
  const validationError = normalized ? validateClientMessageTemplate(normalized) : null;

  if (validationError) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  const { data, error } = await supabase
    .from("authors")
    .update({ client_message_template: normalized })
    .eq("id", authorId)
    .select("client_message_template")
    .maybeSingle();

  if (error) {
    console.error("author_client_message_settings_update_error", error.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  if (!data) {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  return {
    clientMessageTemplate:
      typeof data.client_message_template === "string"
        ? data.client_message_template
        : null,
  };
}
