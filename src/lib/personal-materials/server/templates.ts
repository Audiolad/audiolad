import type { SupabaseClient } from "@supabase/supabase-js";

import { PERSONAL_MATERIAL_LIMITS } from "@/lib/personal-materials/types";
import {
  validateReturnButtonLabel,
  validateReturnUrl,
} from "@/lib/personal-materials/return-url";

import { PersonalMaterialApiError } from "./errors";

export type PersonalMaterialTemplateRow = {
  id: string;
  author_id: string;
  created_by: string;
  internal_name: string;
  title: string | null;
  description: string | null;
  personal_recommendation: string | null;
  return_url: string | null;
  return_button_label: string | null;
  created_at: string;
  updated_at: string;
};

export type SafePersonalMaterialTemplateDto = {
  id: string;
  authorId: string;
  internalName: string;
  title: string | null;
  description: string | null;
  personalRecommendation: string | null;
  returnUrl: string | null;
  returnButtonLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

const TEMPLATE_SELECT =
  "id, author_id, created_by, internal_name, title, description, personal_recommendation, return_url, return_button_label, created_at, updated_at";

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > maxLength) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  return trimmed;
}

function requireInternalName(value: unknown): string {
  if (typeof value !== "string") {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > 120) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  return trimmed;
}

export function toSafePersonalMaterialTemplateDto(
  row: PersonalMaterialTemplateRow,
): SafePersonalMaterialTemplateDto {
  return {
    id: row.id,
    authorId: row.author_id,
    internalName: row.internal_name,
    title: row.title,
    description: row.description,
    personalRecommendation: row.personal_recommendation,
    returnUrl: row.return_url,
    returnButtonLabel: row.return_button_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseTemplateBody(body: unknown) {
  if (typeof body !== "object" || body === null) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  const record = body as Record<string, unknown>;
  const returnUrlParsed = validateReturnUrl(
    record.returnUrl === undefined ? null : (record.returnUrl as string | null),
  );
  const returnLabelParsed = validateReturnButtonLabel(
    record.returnButtonLabel === undefined
      ? null
      : (record.returnButtonLabel as string | null),
  );

  if (!returnUrlParsed.valid || !returnLabelParsed.valid) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  return {
    internalName: requireInternalName(record.internalName),
    title: normalizeOptionalText(record.title, PERSONAL_MATERIAL_LIMITS.titleMaxLength),
    description: normalizeOptionalText(
      record.description,
      PERSONAL_MATERIAL_LIMITS.descriptionMaxLength,
    ),
    personalRecommendation: normalizeOptionalText(
      record.personalRecommendation,
      PERSONAL_MATERIAL_LIMITS.recommendationMaxLength,
    ),
    returnUrl: returnUrlParsed.normalized,
    returnButtonLabel: returnLabelParsed.normalized,
  };
}

export async function listPersonalMaterialTemplates(
  supabase: SupabaseClient,
  authorId: string,
): Promise<PersonalMaterialTemplateRow[]> {
  const { data, error } = await supabase
    .from("personal_material_templates")
    .select(TEMPLATE_SELECT)
    .eq("author_id", authorId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("personal_material_template_list_error", error.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return (data ?? []) as PersonalMaterialTemplateRow[];
}

export async function getPersonalMaterialTemplateById(
  supabase: SupabaseClient,
  templateId: string,
): Promise<PersonalMaterialTemplateRow | null> {
  const { data, error } = await supabase
    .from("personal_material_templates")
    .select(TEMPLATE_SELECT)
    .eq("id", templateId)
    .maybeSingle();

  if (error) {
    console.error("personal_material_template_get_error", error.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return (data as PersonalMaterialTemplateRow | null) ?? null;
}

export async function createPersonalMaterialTemplate(
  supabase: SupabaseClient,
  input: {
    authorId: string;
    userId: string;
    internalName: string;
    title: string | null;
    description: string | null;
    personalRecommendation: string | null;
    returnUrl: string | null;
    returnButtonLabel: string | null;
  },
): Promise<PersonalMaterialTemplateRow> {
  const { data, error } = await supabase
    .from("personal_material_templates")
    .insert({
      author_id: input.authorId,
      created_by: input.userId,
      internal_name: input.internalName,
      title: input.title,
      description: input.description,
      personal_recommendation: input.personalRecommendation,
      return_url: input.returnUrl,
      return_button_label: input.returnButtonLabel,
    })
    .select(TEMPLATE_SELECT)
    .single();

  if (error || !data) {
    console.error("personal_material_template_create_error", error?.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return data as PersonalMaterialTemplateRow;
}

export async function updatePersonalMaterialTemplate(
  supabase: SupabaseClient,
  templateId: string,
  input: {
    internalName: string;
    title: string | null;
    description: string | null;
    personalRecommendation: string | null;
    returnUrl: string | null;
    returnButtonLabel: string | null;
  },
): Promise<PersonalMaterialTemplateRow> {
  const { data, error } = await supabase
    .from("personal_material_templates")
    .update({
      internal_name: input.internalName,
      title: input.title,
      description: input.description,
      personal_recommendation: input.personalRecommendation,
      return_url: input.returnUrl,
      return_button_label: input.returnButtonLabel,
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId)
    .select(TEMPLATE_SELECT)
    .single();

  if (error || !data) {
    console.error("personal_material_template_update_error", error?.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return data as PersonalMaterialTemplateRow;
}

export async function deletePersonalMaterialTemplate(
  supabase: SupabaseClient,
  templateId: string,
): Promise<void> {
  const { error } = await supabase
    .from("personal_material_templates")
    .delete()
    .eq("id", templateId);

  if (error) {
    console.error("personal_material_template_delete_error", error.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }
}

export async function duplicatePersonalMaterialTemplate(
  supabase: SupabaseClient,
  template: PersonalMaterialTemplateRow,
  userId: string,
): Promise<PersonalMaterialTemplateRow> {
  return createPersonalMaterialTemplate(supabase, {
    authorId: template.author_id,
    userId,
    internalName: `${template.internal_name} (копия)`.slice(0, 120),
    title: template.title,
    description: template.description,
    personalRecommendation: template.personal_recommendation,
    returnUrl: template.return_url,
    returnButtonLabel: template.return_button_label,
  });
}
