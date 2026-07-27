import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  decryptPayoutProfilePayload,
  encryptPayoutProfilePayload,
  parsePayoutProfileEncryptedEnvelope,
  PayoutProfileEncryptionError,
  serializePayoutProfileEncryptedEnvelope,
} from "./encryption";
import { buildAuthorPayoutProfileMasks } from "./masking";
import {
  formValuesToSensitivePayload,
  listChangedSensitiveFields,
  parseSensitivePayload,
  sensitivePayloadToFormValues,
  serializeSensitivePayload,
} from "./payload";
import {
  authorCanSubmitPayoutProfileStatus,
  canAuthorTransitionPayoutProfileStatus,
  canStaffTransitionPayoutProfileStatus,
  isAuthorEditablePayoutProfileStatus,
} from "./status";
import type {
  AuthorPayoutProfileAdminDetail,
  AuthorPayoutProfileAdminListItem,
  AuthorPayoutProfileFormValues,
  AuthorPayoutProfilePublicView,
  AuthorPayoutProfileSensitivePayload,
  AuthorPayoutProfileStatus,
  AuthorPayoutRecipientType,
} from "./types";
import {
  isAuthorPayoutProfileStatus,
  isAuthorPayoutRecipientType,
} from "./types";
import {
  hasAuthorPayoutProfileFieldErrors,
  normalizeAuthorPayoutProfileFormValues,
  sanitizeStaffFacingComment,
  validateAuthorPayoutProfileFormValues,
} from "./validation";

type ProfileRow = {
  id: string;
  author_id: string;
  recipient_type: string;
  status: string;
  version: number;
  encrypted_payload: string | null;
  inn_last4: string | null;
  account_last4: string | null;
  is_npd_declared: boolean;
  npd_status_checked_at: string | null;
  npd_status_check_result: string | null;
  review_comment: string | null;
  staff_note: string | null;
  author_revision_comment: string | null;
  reviewed_by: string | null;
  submitted_at: string | null;
  review_started_at: string | null;
  verified_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
};

export class AuthorPayoutProfileError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;

  constructor(
    code: string,
    status = 400,
    fieldErrors?: Record<string, string>,
  ) {
    super(code);
    this.name = "AuthorPayoutProfileError";
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

function assertRecipientType(value: string): AuthorPayoutRecipientType {
  if (!isAuthorPayoutRecipientType(value)) {
    throw new AuthorPayoutProfileError("invalid_recipient_type", 400);
  }
  return value;
}

function assertStatus(value: string): AuthorPayoutProfileStatus {
  if (!isAuthorPayoutProfileStatus(value)) {
    throw new AuthorPayoutProfileError("invalid_status", 400);
  }
  return value;
}

function decryptRowFields(
  row: ProfileRow,
): AuthorPayoutProfileSensitivePayload | null {
  if (!row.encrypted_payload) {
    return null;
  }

  try {
    const envelope = parsePayoutProfileEncryptedEnvelope(row.encrypted_payload);
    const plaintext = decryptPayoutProfilePayload(envelope);
    return parseSensitivePayload(plaintext);
  } catch (error) {
    if (error instanceof PayoutProfileEncryptionError) {
      console.error("author_payout_profile_decrypt_unavailable", error.code);
      throw new AuthorPayoutProfileError("encryption_unavailable", 503);
    }
    console.error("author_payout_profile_decrypt_unavailable");
    throw new AuthorPayoutProfileError("encryption_unavailable", 503);
  }
}

function encryptFields(fields: AuthorPayoutProfileSensitivePayload): string {
  try {
    const envelope = encryptPayoutProfilePayload(
      serializeSensitivePayload(fields),
    );
    return serializePayoutProfileEncryptedEnvelope(envelope);
  } catch (error) {
    if (error instanceof PayoutProfileEncryptionError) {
      console.error("author_payout_profile_encrypt_unavailable", error.code);
      throw new AuthorPayoutProfileError("encryption_unavailable", 503);
    }
    console.error("author_payout_profile_encrypt_unavailable");
    throw new AuthorPayoutProfileError("encryption_unavailable", 503);
  }
}

async function logStatusEvent(
  supabase: SupabaseClient,
  input: {
    profileId: string;
    authorId: string;
    fromStatus: AuthorPayoutProfileStatus | null;
    toStatus: AuthorPayoutProfileStatus;
    actorUserId: string | null;
    actorRole: "author" | "staff" | "system";
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase
    .from("author_payout_profile_status_events")
    .insert({
      profile_id: input.profileId,
      author_id: input.authorId,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      actor_user_id: input.actorUserId,
      actor_role: input.actorRole,
      reason: input.reason ?? null,
      metadata: input.metadata ?? {},
    });

  if (error) {
    console.error("author_payout_profile_status_event_insert_failed");
    throw new AuthorPayoutProfileError("audit_persist_failed", 500);
  }
}

export async function getAuthorPayoutProfileRow(
  supabase: SupabaseClient,
  authorId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("author_payout_profiles")
    .select("*")
    .eq("author_id", authorId)
    .maybeSingle();

  if (error) {
    console.error("author_payout_profile_load_failed");
    throw new AuthorPayoutProfileError("load_failed", 500);
  }

  return (data as ProfileRow | null) ?? null;
}

export async function getAuthorPayoutProfileRowById(
  supabase: SupabaseClient,
  profileId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("author_payout_profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    console.error("author_payout_profile_load_failed");
    throw new AuthorPayoutProfileError("load_failed", 500);
  }

  return (data as ProfileRow | null) ?? null;
}

export function toAuthorPublicView(
  row: ProfileRow | null,
  options: { includeFields: boolean },
): AuthorPayoutProfilePublicView | null {
  if (!row) {
    return null;
  }

  const status = assertStatus(row.status);
  const fields =
    options.includeFields && isAuthorEditablePayoutProfileStatus(status)
      ? decryptRowFields(row)
      : options.includeFields && status === "verified"
        ? decryptRowFields(row)
        : null;

  return {
    id: row.id,
    author_id: row.author_id,
    recipient_type: assertRecipientType(row.recipient_type),
    status,
    version: row.version,
    inn_last4: row.inn_last4,
    account_last4: row.account_last4,
    is_npd_declared: row.is_npd_declared,
    npd_status_check_result: row.npd_status_check_result as
      | AuthorPayoutProfilePublicView["npd_status_check_result"],
    review_comment: row.review_comment,
    author_revision_comment: row.author_revision_comment,
    submitted_at: row.submitted_at,
    review_started_at: row.review_started_at,
    verified_at: row.verified_at,
    rejected_at: row.rejected_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    fields,
    can_edit: isAuthorEditablePayoutProfileStatus(status),
    can_submit: authorCanSubmitPayoutProfileStatus(status),
    can_start_edit_from_verified: status === "verified",
  };
}

export async function saveAuthorPayoutProfileDraft(input: {
  supabase: SupabaseClient;
  authorId: string;
  actorUserId: string;
  body: Record<string, unknown>;
}): Promise<AuthorPayoutProfilePublicView> {
  const values = normalizeAuthorPayoutProfileFormValues(input.body);
  const errors = validateAuthorPayoutProfileFormValues(values, {
    mode: "draft",
  });

  if (hasAuthorPayoutProfileFieldErrors(errors)) {
    throw new AuthorPayoutProfileError("validation_failed", 400, errors);
  }

  if (!values.recipient_type) {
    throw new AuthorPayoutProfileError("validation_failed", 400, {
      recipient_type: "Выберите правовой статус.",
    });
  }

  const recipientType = values.recipient_type;
  const existing = await getAuthorPayoutProfileRow(
    input.supabase,
    input.authorId,
  );

  if (existing) {
    const status = assertStatus(existing.status);
    if (!isAuthorEditablePayoutProfileStatus(status) && status !== "needs_changes") {
      throw new AuthorPayoutProfileError("profile_not_editable", 409);
    }
  }

  const previousFields = existing ? decryptRowFields(existing) : null;
  const fields = formValuesToSensitivePayload(values, recipientType);
  const encrypted = encryptFields(fields);
  const masks = buildAuthorPayoutProfileMasks(fields);
  const changedFields = listChangedSensitiveFields(previousFields, fields);

  let nextStatus: AuthorPayoutProfileStatus = "draft";
  let fromStatus: AuthorPayoutProfileStatus | null = null;

  if (existing) {
    fromStatus = assertStatus(existing.status);
    if (fromStatus === "needs_changes") {
      if (!canAuthorTransitionPayoutProfileStatus(fromStatus, "draft")) {
        throw new AuthorPayoutProfileError("transition_not_allowed", 409);
      }
      nextStatus = "draft";
    } else if (fromStatus === "draft") {
      nextStatus = "draft";
    } else {
      throw new AuthorPayoutProfileError("profile_not_editable", 409);
    }
  }

  const npdResult =
    recipientType === "self_employed" ? "needs_manual_check" : null;

  if (!existing) {
    const { data, error } = await input.supabase
      .from("author_payout_profiles")
      .insert({
        author_id: input.authorId,
        recipient_type: recipientType,
        status: "draft",
        version: 1,
        encrypted_payload: encrypted,
        inn_last4: masks.inn_last4,
        account_last4: masks.account_last4,
        is_npd_declared: values.is_npd_declared,
        npd_status_check_result: npdResult,
        author_revision_comment: values.author_revision_comment || null,
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error("author_payout_profile_insert_failed");
      throw new AuthorPayoutProfileError("save_failed", 500);
    }

    await logStatusEvent(input.supabase, {
      profileId: data.id,
      authorId: input.authorId,
      fromStatus: null,
      toStatus: "draft",
      actorUserId: input.actorUserId,
      actorRole: "author",
      reason: "draft_created",
      metadata: {
        recipient_type: recipientType,
        changed_fields: changedFields,
        version: 1,
      },
    });

    return toAuthorPublicView(data as ProfileRow, { includeFields: true })!;
  }

  const nextVersion = existing.version + 1;

  const { data, error } = await input.supabase
    .from("author_payout_profiles")
    .update({
      recipient_type: recipientType,
      status: nextStatus,
      version: nextVersion,
      encrypted_payload: encrypted,
      inn_last4: masks.inn_last4,
      account_last4: masks.account_last4,
      is_npd_declared: values.is_npd_declared,
      npd_status_check_result: npdResult,
      author_revision_comment: values.author_revision_comment || null,
      review_comment: existing.review_comment,
    })
    .eq("id", existing.id)
    .eq("status", fromStatus)
    .eq("version", existing.version)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("author_payout_profile_update_failed");
    throw new AuthorPayoutProfileError("save_failed", 500);
  }

  if (!data) {
    throw new AuthorPayoutProfileError("conflict", 409);
  }

  if (fromStatus !== nextStatus || changedFields.length > 0) {
    await logStatusEvent(input.supabase, {
      profileId: existing.id,
      authorId: input.authorId,
      fromStatus,
      toStatus: nextStatus,
      actorUserId: input.actorUserId,
      actorRole: "author",
      reason: fromStatus !== nextStatus ? "author_edit" : "draft_saved",
      metadata: {
        recipient_type: recipientType,
        changed_fields: changedFields,
        version: nextVersion,
      },
    });
  }

  return toAuthorPublicView(data as ProfileRow, { includeFields: true })!;
}

export async function submitAuthorPayoutProfile(input: {
  supabase: SupabaseClient;
  authorId: string;
  actorUserId: string;
  body: Record<string, unknown>;
}): Promise<{ profile: AuthorPayoutProfilePublicView; transitioned: boolean }> {
  const values = normalizeAuthorPayoutProfileFormValues(input.body);
  const errors = validateAuthorPayoutProfileFormValues(values, {
    mode: "submit",
  });

  if (hasAuthorPayoutProfileFieldErrors(errors)) {
    throw new AuthorPayoutProfileError("validation_failed", 400, errors);
  }

  if (!values.recipient_type) {
    throw new AuthorPayoutProfileError("validation_failed", 400, {
      recipient_type: "Выберите правовой статус.",
    });
  }

  const existing = await getAuthorPayoutProfileRow(
    input.supabase,
    input.authorId,
  );

  if (existing) {
    const current = assertStatus(existing.status);
    if (current === "submitted" || current === "in_review") {
      return {
        profile: toAuthorPublicView(existing, { includeFields: false })!,
        transitioned: false,
      };
    }
  }

  // Persist validated payload as draft (also moves needs_changes → draft).
  await saveAuthorPayoutProfileDraft({
    supabase: input.supabase,
    authorId: input.authorId,
    actorUserId: input.actorUserId,
    body: input.body,
  });

  const row = await getAuthorPayoutProfileRow(input.supabase, input.authorId);
  if (!row) {
    throw new AuthorPayoutProfileError("load_failed", 500);
  }

  const fromStatus = assertStatus(row.status);
  if (fromStatus !== "draft") {
    throw new AuthorPayoutProfileError("transition_not_allowed", 409);
  }

  if (!canAuthorTransitionPayoutProfileStatus("draft", "submitted")) {
    throw new AuthorPayoutProfileError("transition_not_allowed", 409);
  }

  const version = row.version + 1;
  const { data, error } = await input.supabase
    .from("author_payout_profiles")
    .update({
      status: "submitted",
      version,
      submitted_at: new Date().toISOString(),
      review_started_at: null,
      verified_at: null,
      rejected_at: null,
      reviewed_by: null,
    })
    .eq("id", row.id)
    .eq("status", "draft")
    .eq("version", row.version)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("author_payout_profile_submit_failed");
    throw new AuthorPayoutProfileError("submit_failed", 500);
  }

  if (!data) {
    throw new AuthorPayoutProfileError("conflict", 409);
  }

  await logStatusEvent(input.supabase, {
    profileId: row.id,
    authorId: input.authorId,
    fromStatus: "draft",
    toStatus: "submitted",
    actorUserId: input.actorUserId,
    actorRole: "author",
    reason: "submitted",
    metadata: {
      recipient_type: row.recipient_type,
      version,
    },
  });

  return {
    profile: toAuthorPublicView(data as ProfileRow, { includeFields: false })!,
    transitioned: true,
  };
}

export async function beginAuthorVerifiedPayoutProfileEdit(input: {
  supabase: SupabaseClient;
  authorId: string;
  actorUserId: string;
  confirm: boolean;
}): Promise<AuthorPayoutProfilePublicView> {
  if (!input.confirm) {
    throw new AuthorPayoutProfileError("edit_confirmation_required", 400);
  }

  const row = await getAuthorPayoutProfileRow(input.supabase, input.authorId);
  if (!row) {
    throw new AuthorPayoutProfileError("not_found", 404);
  }

  const fromStatus = assertStatus(row.status);
  if (fromStatus !== "verified") {
    throw new AuthorPayoutProfileError("transition_not_allowed", 409);
  }

  if (!canAuthorTransitionPayoutProfileStatus(fromStatus, "draft")) {
    throw new AuthorPayoutProfileError("transition_not_allowed", 409);
  }

  const nextVersion = row.version + 1;
  const { data, error } = await input.supabase
    .from("author_payout_profiles")
    .update({
      status: "draft",
      verified_at: null,
      version: nextVersion,
    })
    .eq("id", row.id)
    .eq("status", "verified")
    .eq("version", row.version)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throw new AuthorPayoutProfileError("conflict", 409);
  }

  await logStatusEvent(input.supabase, {
    profileId: row.id,
    authorId: input.authorId,
    fromStatus: "verified",
    toStatus: "draft",
    actorUserId: input.actorUserId,
    actorRole: "author",
    reason: "author_reopen_for_edit",
    metadata: { version: nextVersion },
  });

  return toAuthorPublicView(data as ProfileRow, { includeFields: true })!;
}

export async function listAdminPayoutProfiles(
  supabase: SupabaseClient,
  filters?: { status?: AuthorPayoutProfileStatus | "all" },
): Promise<AuthorPayoutProfileAdminListItem[]> {
  let query = supabase
    .from("author_payout_profiles")
    .select(
      "id, author_id, recipient_type, status, version, inn_last4, account_last4, submitted_at, updated_at, authors!inner(name, slug)",
    )
    .order("updated_at", { ascending: false })
    .limit(200);

  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  } else {
    query = query.in("status", [
      "submitted",
      "in_review",
      "needs_changes",
      "verified",
      "rejected",
    ]);
  }

  const { data, error } = await query;

  if (error) {
    console.error("author_payout_profile_admin_list_failed");
    throw new AuthorPayoutProfileError("load_failed", 500);
  }

  return (data ?? []).map((row) => {
    const authors = row.authors as unknown as
      | { name: string; slug: string | null }
      | { name: string; slug: string | null }[]
      | null;
    const author = Array.isArray(authors) ? authors[0] : authors;

    return {
      id: row.id as string,
      author_id: row.author_id as string,
      author_name: author?.name ?? "Автор",
      author_slug: author?.slug ?? null,
      recipient_type: assertRecipientType(row.recipient_type as string),
      status: assertStatus(row.status as string),
      version: row.version as number,
      inn_last4: (row.inn_last4 as string | null) ?? null,
      account_last4: (row.account_last4 as string | null) ?? null,
      submitted_at: (row.submitted_at as string | null) ?? null,
      updated_at: row.updated_at as string,
    };
  });
}

export async function getAdminPayoutProfileDetail(
  supabase: SupabaseClient,
  profileId: string,
): Promise<AuthorPayoutProfileAdminDetail> {
  const { data, error } = await supabase
    .from("author_payout_profiles")
    .select(
      "*, authors!inner(name, slug)",
    )
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    console.error("author_payout_profile_admin_detail_failed");
    throw new AuthorPayoutProfileError("load_failed", 500);
  }

  if (!data) {
    throw new AuthorPayoutProfileError("not_found", 404);
  }

  const row = data as ProfileRow & {
    authors:
      | { name: string; slug: string | null }
      | { name: string; slug: string | null }[];
  };
  const author = Array.isArray(row.authors) ? row.authors[0] : row.authors;
  const fields = decryptRowFields(row);

  if (!fields) {
    throw new AuthorPayoutProfileError("encryption_envelope_invalid", 500);
  }

  return {
    id: row.id,
    author_id: row.author_id,
    author_name: author?.name ?? "Автор",
    author_slug: author?.slug ?? null,
    recipient_type: assertRecipientType(row.recipient_type),
    status: assertStatus(row.status),
    version: row.version,
    inn_last4: row.inn_last4,
    account_last4: row.account_last4,
    submitted_at: row.submitted_at,
    updated_at: row.updated_at,
    is_npd_declared: row.is_npd_declared,
    npd_status_checked_at: row.npd_status_checked_at,
    npd_status_check_result: row.npd_status_check_result as
      | AuthorPayoutProfileAdminDetail["npd_status_check_result"],
    review_comment: row.review_comment,
    staff_note: row.staff_note,
    author_revision_comment: row.author_revision_comment,
    reviewed_by: row.reviewed_by,
    review_started_at: row.review_started_at,
    verified_at: row.verified_at,
    rejected_at: row.rejected_at,
    created_at: row.created_at,
    fields,
  };
}

export async function staffTransitionPayoutProfile(input: {
  supabase: SupabaseClient;
  profileId: string;
  actorUserId: string;
  toStatus: AuthorPayoutProfileStatus;
  reviewComment?: string | null;
  staffNote?: string | null;
}): Promise<{ detail: AuthorPayoutProfileAdminDetail; transitioned: boolean }> {
  const row = await getAuthorPayoutProfileRowById(
    input.supabase,
    input.profileId,
  );
  if (!row) {
    throw new AuthorPayoutProfileError("not_found", 404);
  }

  const fromStatus = assertStatus(row.status);
  if (fromStatus === input.toStatus) {
    return {
      detail: await getAdminPayoutProfileDetail(
        input.supabase,
        input.profileId,
      ),
      transitioned: false,
    };
  }

  if (!canStaffTransitionPayoutProfileStatus(fromStatus, input.toStatus)) {
    throw new AuthorPayoutProfileError("transition_not_allowed", 409);
  }

  const reviewComment = sanitizeStaffFacingComment(
    input.reviewComment ?? "",
  );
  const staffNote = sanitizeStaffFacingComment(input.staffNote ?? "");

  if (
    (input.toStatus === "needs_changes" || input.toStatus === "rejected") &&
    !reviewComment
  ) {
    throw new AuthorPayoutProfileError("review_comment_required", 400);
  }

  const patch: Record<string, unknown> = {
    status: input.toStatus,
    reviewed_by: input.actorUserId,
  };

  if (staffNote) {
    patch.staff_note = staffNote;
  }

  if (input.toStatus === "in_review") {
    patch.review_started_at = new Date().toISOString();
  }

  if (input.toStatus === "needs_changes") {
    patch.review_comment = reviewComment;
  }

  if (input.toStatus === "rejected") {
    patch.review_comment = reviewComment;
    patch.rejected_at = new Date().toISOString();
  }

  if (input.toStatus === "verified") {
    patch.verified_at = new Date().toISOString();
    patch.rejected_at = null;
  }

  const nextVersion = row.version + 1;
  patch.version = nextVersion;

  const { data, error } = await input.supabase
    .from("author_payout_profiles")
    .update(patch)
    .eq("id", row.id)
    .eq("status", fromStatus)
    .eq("version", row.version)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new AuthorPayoutProfileError("conflict", 409);
  }

  await logStatusEvent(input.supabase, {
    profileId: row.id,
    authorId: row.author_id,
    fromStatus,
    toStatus: input.toStatus,
    actorUserId: input.actorUserId,
    actorRole: "staff",
    reason: `staff_${input.toStatus}`,
    metadata: {
      version: nextVersion,
      recipient_type: row.recipient_type,
      has_review_comment: Boolean(reviewComment),
      has_staff_note: Boolean(staffNote),
    },
  });

  return {
    detail: await getAdminPayoutProfileDetail(input.supabase, input.profileId),
    transitioned: true,
  };
}

export function profileRowToFormValues(
  row: ProfileRow,
): AuthorPayoutProfileFormValues | null {
  const fields = decryptRowFields(row);
  if (!fields) {
    return null;
  }

  return sensitivePayloadToFormValues(
    assertRecipientType(row.recipient_type),
    fields,
    {
      is_npd_declared: row.is_npd_declared,
      author_revision_comment: row.author_revision_comment,
    },
  );
}
