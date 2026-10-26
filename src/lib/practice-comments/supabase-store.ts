import type { SupabaseClient } from "@supabase/supabase-js";

import { getPracticeByAuthorAndSlug } from "@/lib/products/lookup";
import { buildPracticePublicPath } from "@/lib/products/paths";
import { LISTENER_COMMENT_AUTHOR_PUBLIC_NAME } from "@/lib/practice-comments/copy";
import type { ListenerCommentPracticeGate } from "@/lib/practice-comments/policy";
import type { CommentCursor, CommentSort } from "@/lib/practice-comments/pagination";
import type { CommentStore, FeedCommentRow } from "@/lib/practice-comments/store";
import { deriveDefaultPublicName } from "@/lib/practice-comments/text";
import type {
  CommentNoticeRow,
  CommentReportRow,
  ListenerCommentRow,
  ModerationEventRow,
  ReportReason,
} from "@/lib/practice-comments/types";

export class CommentStoreUnavailable extends Error {
  constructor() {
    super("listener_comments_unavailable");
    this.name = "CommentStoreUnavailable";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value == null) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /practice_listener_comment/.test(message) &&
      /(schema cache|does not exist|Could not find)/i.test(message)
  );
}

function throwIfUnavailable(error: { code?: string; message?: string } | null): void {
  if (isMissingRelation(error)) throw new CommentStoreUnavailable();
}

function mapRaw(value: unknown): ListenerCommentRow | null {
  const row = asRecord(value);
  if (!row || typeof row.id !== "string" || typeof row.practice_id !== "string") return null;
  const kind = row.kind === "author_reply" ? "author_reply" : "impression";
  const status =
    row.status === "hidden" || row.status === "deleted" ? row.status : "published";
  return {
    id: row.id,
    practiceId: row.practice_id,
    userId: text(row.user_id) ?? "",
    parentId: text(row.parent_id),
    kind,
    body: text(row.body) ?? "",
    publicName: text(row.public_name) ?? "",
    status,
    clientRequestId: text(row.client_request_id),
    bodyFingerprint: text(row.body_fingerprint) ?? "",
    hiddenReason: text(row.hidden_reason),
    createdAt: text(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: text(row.updated_at) ?? text(row.created_at) ?? new Date(0).toISOString(),
    editedAt: text(row.edited_at),
    deletedAt: text(row.deleted_at),
  };
}

function mapFeed(value: unknown): FeedCommentRow | null {
  const row = asRecord(value);
  if (!row || typeof row.id !== "string") return null;
  const status = row.status === "hidden" ? "hidden" : "published";
  return {
    id: row.id,
    practiceId: text(row.practice_id) ?? "",
    parentId: text(row.parent_id),
    kind: row.kind === "author_reply" ? "author_reply" : "impression",
    body: text(row.body) ?? "",
    publicName: text(row.public_name) ?? "",
    status,
    createdAt: text(row.created_at) ?? new Date(0).toISOString(),
    editedAt: text(row.edited_at),
    mine: row.mine === true,
  };
}

function cursorFilter(sort: CommentSort, cursor: CommentCursor): string {
  const createdAt = `"${cursor.createdAt}"`;
  const id = `"${cursor.id}"`;
  if (sort === "old") {
    return `created_at.gt.${createdAt},and(created_at.eq.${createdAt},id.gt.${id})`;
  }
  return `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`;
}

export function createSupabaseCommentStore(input: {
  reader: SupabaseClient;
  writer: SupabaseClient;
}): CommentStore {
  const { reader, writer } = input;

  return {
    async getGateBySlug(authorSlug, productSlug) {
      const { practice, error } = await getPracticeByAuthorAndSlug(reader, authorSlug, productSlug);
      if (error) throw new Error("practice_lookup_failed");
      if (!practice) return null;
      const author = Array.isArray(practice.authors) ? practice.authors[0] : practice.authors;
      return {
        practiceId: practice.id,
        authorId: practice.author_id,
        title: practice.title,
        authorSlug: author?.slug ?? authorSlug,
        productSlug: practice.slug,
        authorName: author?.name ?? null,
        productKind: practice.product_kind ?? null,
        catalogSection: practice.catalog_section ?? null,
        status: practice.status,
        publishedAt: practice.published_at ?? null,
        scheduledPublishAt: practice.scheduled_publish_at ?? null,
        deletedAt: practice.deleted_at ?? null,
      } satisfies ListenerCommentPracticeGate;
    },
    async getPracticeContext(practiceId) {
      const { data, error } = await reader
        .from("practices")
        .select("id, title, slug, authors!practices_author_id_fkey(slug)")
        .eq("id", practiceId)
        .maybeSingle();
      throwIfUnavailable(error);
      if (error || !data) return null;
      const authors = (data as { authors?: { slug?: string } | { slug?: string }[] }).authors;
      const author = Array.isArray(authors) ? authors[0] : authors;
      const authorSlug = author?.slug ?? "";
      const productSlug = (data as { slug?: string }).slug ?? "";
      if (!authorSlug || !productSlug) return null;
      return {
        id: practiceId,
        title: (data as { title?: string }).title ?? "Практика",
        authorSlug,
        productSlug,
      };
    },
    async suggestPublicName(userId) {
      const { data, error } = await reader
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();
      if (error) return deriveDefaultPublicName(null);
      return deriveDefaultPublicName((data as { full_name?: string | null } | null)?.full_name);
    },
    async authorDisplayName(practiceId) {
      const { data } = await reader
        .from("practices")
        .select("authors!practices_author_id_fkey(name)")
        .eq("id", practiceId)
        .maybeSingle();
      const authors = (data as { authors?: { name?: string } | { name?: string }[] } | null)?.authors;
      const author = Array.isArray(authors) ? authors[0] : authors;
      const name = author?.name?.trim();
      return name || LISTENER_COMMENT_AUTHOR_PUBLIC_NAME;
    },
    async isAuthorMember(userId, practiceId) {
      const { data: practice } = await reader
        .from("practices")
        .select("author_id")
        .eq("id", practiceId)
        .maybeSingle();
      const authorId = (practice as { author_id?: string } | null)?.author_id;
      if (!authorId) return false;
      const { data } = await reader
        .from("author_members")
        .select("id")
        .eq("author_id", authorId)
        .eq("user_id", userId)
        .maybeSingle();
      return Boolean((data as { id?: string } | null)?.id);
    },
    async authorRecipientIds(practiceId) {
      const { data: practice, error } = await writer
        .from("practices")
        .select("author_id")
        .eq("id", practiceId)
        .maybeSingle();
      throwIfUnavailable(error);
      const authorId = (practice as { author_id?: string } | null)?.author_id;
      if (!authorId) return [];
      const { data: members, error: memberError } = await writer
        .from("author_members")
        .select("user_id")
        .eq("author_id", authorId);
      throwIfUnavailable(memberError);
      return (members ?? [])
        .map((row) => (row as { user_id?: string }).user_id)
        .filter((id): id is string => typeof id === "string");
    },
    async listAuthorPracticeIds(userId, authorId) {
      let membership = reader.from("author_members").select("author_id").eq("user_id", userId);
      if (authorId) membership = membership.eq("author_id", authorId);
      const { data: members, error } = await membership;
      if (error) throw new Error("author_membership_lookup_failed");
      const authorIds = (members ?? [])
        .map((row) => (row as { author_id?: string }).author_id)
        .filter((id): id is string => typeof id === "string");
      if (authorIds.length === 0) return [];
      const { data: practices, error: practiceError } = await reader
        .from("practices")
        .select("id")
        .in("author_id", authorIds);
      if (practiceError) throw new Error("author_practice_lookup_failed");
      return (practices ?? [])
        .map((row) => (row as { id?: string }).id)
        .filter((id): id is string => typeof id === "string");
    },
    async listFeed(query) {
      let request = reader
        .from("practice_listener_comment_feed")
        .select("id, practice_id, parent_id, kind, body, public_name, status, created_at, edited_at, mine")
        .eq("practice_id", query.practiceId)
        .is("parent_id", null)
        .order("created_at", { ascending: query.sort === "old" })
        .order("id", { ascending: query.sort === "old" })
        .limit(query.limit);
      if (query.cursor) request = request.or(cursorFilter(query.sort, query.cursor));
      const { data, error } = await request;
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_feed_failed");
      return (data ?? []).map(mapFeed).filter((row): row is FeedCommentRow => row != null);
    },
    async listReplies(query) {
      if (query.parentIds.length === 0) return [];
      const { data, error } = await reader
        .from("practice_listener_comment_feed")
        .select("id, practice_id, parent_id, kind, body, public_name, status, created_at, edited_at, mine")
        .eq("practice_id", query.practiceId)
        .in("parent_id", query.parentIds);
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_replies_failed");
      return (data ?? []).map(mapFeed).filter((row): row is FeedCommentRow => row != null);
    },
    async getRaw(id) {
      const { data, error } = await writer
        .from("practice_listener_comments")
        .select(
          "id, practice_id, user_id, parent_id, kind, body, public_name, status, client_request_id, body_fingerprint, hidden_reason, created_at, updated_at, edited_at, deleted_at",
        )
        .eq("id", id)
        .maybeSingle();
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_load_failed");
      return mapRaw(data);
    },
    async findByRequest(userId, requestId) {
      const { data, error } = await writer
        .from("practice_listener_comments")
        .select(
          "id, practice_id, user_id, parent_id, kind, body, public_name, status, client_request_id, body_fingerprint, hidden_reason, created_at, updated_at, edited_at, deleted_at",
        )
        .eq("user_id", userId)
        .eq("client_request_id", requestId)
        .maybeSingle();
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_request_lookup_failed");
      return mapRaw(data);
    },
    async countRecentImpressions(userId, sinceIso) {
      const { count, error } = await writer
        .from("practice_listener_comments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("kind", "impression")
        .neq("status", "deleted")
        .gte("created_at", sinceIso);
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_rate_failed");
      return count ?? 0;
    },
    async countRecentReplies(userId, sinceIso) {
      const { count, error } = await writer
        .from("practice_listener_comments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("kind", "author_reply")
        .gte("created_at", sinceIso);
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_reply_rate_failed");
      return count ?? 0;
    },
    async countRecentEdits(userId, sinceIso) {
      const { count, error } = await writer
        .from("practice_listener_comment_edits")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", sinceIso);
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_edit_rate_failed");
      return count ?? 0;
    },
    async recordEdit(row) {
      const { error } = await writer.from("practice_listener_comment_edits").insert({
        id: row.id,
        comment_id: row.commentId,
        user_id: row.userId,
        created_at: row.createdAt,
      });
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_edit_log_failed");
    },
    async insertCommentLimited(row, claim) {
      const { data, error } = await writer.rpc("practice_listener_comment_insert_limited", {
        p_id: row.id,
        p_practice_id: row.practiceId,
        p_user_id: row.userId,
        p_parent_id: row.parentId,
        p_kind: row.kind,
        p_body: row.body,
        p_public_name: row.publicName,
        p_status: row.status,
        p_client_request_id: row.clientRequestId,
        p_body_fingerprint: row.bodyFingerprint,
        p_created_at: row.createdAt,
        p_since: claim.sinceIso,
        p_limit: claim.limit,
      });
      throwIfUnavailable(error);
      if (error) throw error;
      if (data === "rate_limited") return "rate_limited";
      if (data !== "created") throw new Error("listener_comment_insert_failed");
      return row;
    },
    async commitEditLimited(id, patch, edit, claim) {
      if (!patch.body || !patch.publicName || !patch.bodyFingerprint || !patch.updatedAt) {
        throw new Error("listener_comment_update_failed");
      }
      const { data, error } = await writer.rpc("practice_listener_comment_edit_limited", {
        p_comment_id: id,
        p_user_id: edit.userId,
        p_edit_id: edit.id,
        p_body: patch.body,
        p_public_name: patch.publicName,
        p_body_fingerprint: patch.bodyFingerprint,
        p_updated_at: patch.updatedAt,
        p_since: claim.sinceIso,
        p_limit: claim.limit,
      });
      throwIfUnavailable(error);
      if (error) throw error;
      if (data === "rate_limited") return "rate_limited";
      if (data !== "updated") throw new Error("listener_comment_update_failed");
      const updated = await this.getRaw(id);
      if (!updated) throw new Error("listener_comment_update_failed");
      return updated;
    },
    async insertReportLimited(row, claim) {
      const { data, error } = await writer.rpc("practice_listener_comment_report_limited", {
        p_id: row.id,
        p_comment_id: row.commentId,
        p_reporter_user_id: row.reporterUserId,
        p_reason: row.reason,
        p_details: row.details,
        p_created_at: row.createdAt,
        p_since: claim.sinceIso,
        p_limit: claim.limit,
      });
      throwIfUnavailable(error);
      if (error) throw error;
      if (data === "created" || data === "duplicate" || data === "rate_limited") return data;
      throw new Error("listener_comment_report_failed");
    },
    async findRecentDuplicate(query) {
      let request = writer
        .from("practice_listener_comments")
        .select(
          "id, practice_id, user_id, parent_id, kind, body, public_name, status, client_request_id, body_fingerprint, hidden_reason, created_at, updated_at, edited_at, deleted_at",
        )
        .eq("user_id", query.userId)
        .eq("practice_id", query.practiceId)
        .eq("kind", "impression")
        .eq("body_fingerprint", query.fingerprint)
        .neq("status", "deleted")
        .gte("created_at", query.sinceIso)
        .limit(1);
      if (query.exceptId) request = request.neq("id", query.exceptId);
      const { data, error } = await request;
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_duplicate_failed");
      return mapRaw(data?.[0]);
    },
    async insertComment(row) {
      const { error } = await writer.from("practice_listener_comments").insert({
        id: row.id,
        practice_id: row.practiceId,
        user_id: row.userId,
        parent_id: row.parentId,
        kind: row.kind,
        body: row.body,
        public_name: row.publicName,
        status: row.status,
        client_request_id: row.clientRequestId,
        body_fingerprint: row.bodyFingerprint,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      });
      throwIfUnavailable(error);
      if (error) throw error;
      return row;
    },
    async updateComment(id, patch) {
      const update: Record<string, unknown> = {};
      if (patch.body != null) update.body = patch.body;
      if (patch.publicName != null) update.public_name = patch.publicName;
      if (patch.bodyFingerprint != null) update.body_fingerprint = patch.bodyFingerprint;
      if (patch.status != null) update.status = patch.status;
      if (patch.updatedAt != null) update.updated_at = patch.updatedAt;
      if (patch.editedAt !== undefined) update.edited_at = patch.editedAt;
      if (patch.deletedAt !== undefined) update.deleted_at = patch.deletedAt;
      if (patch.hiddenReason !== undefined) update.hidden_reason = patch.hiddenReason;
      if (patch.hiddenBy !== undefined) update.hidden_by = patch.hiddenBy;
      if (patch.hiddenAt !== undefined) update.hidden_at = patch.hiddenAt;
      const { data, error } = await writer
        .from("practice_listener_comments")
        .update(update)
        .eq("id", id)
        .select(
          "id, practice_id, user_id, parent_id, kind, body, public_name, status, client_request_id, body_fingerprint, hidden_reason, created_at, updated_at, edited_at, deleted_at",
        )
        .maybeSingle();
      throwIfUnavailable(error);
      if (error || !data) throw new Error("listener_comment_update_failed");
      return mapRaw(data) as ListenerCommentRow;
    },
    async insertNotice(row) {
      const { error } = await writer.from("practice_listener_comment_notices").insert({
        id: row.id,
        recipient_user_id: row.recipientUserId,
        comment_id: row.commentId,
        practice_id: row.practiceId,
        kind: row.kind,
        created_at: row.createdAt,
      });
      if (error && (error as { code?: string }).code === "23505") return;
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_notice_failed");
    },
    async listNotices(userId) {
      const { data, error } = await reader
        .from("practice_listener_comment_notices")
        .select("id, recipient_user_id, comment_id, practice_id, kind, read_at, created_at")
        .eq("recipient_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_notices_failed");
      const notices = (data ?? []).map((item) => {
        const row = item as Record<string, unknown>;
        return {
          id: String(row.id),
          recipientUserId: String(row.recipient_user_id),
          commentId: String(row.comment_id),
          practiceId: String(row.practice_id),
          kind: row.kind === "author_reply" ? "author_reply" : "new_impression",
          readAt: text(row.read_at),
          createdAt: text(row.created_at) ?? new Date(0).toISOString(),
        } satisfies CommentNoticeRow;
      });
      return Promise.all(
        notices.map(async (notice) => {
          const context = await this.getPracticeContext(notice.practiceId);
          const { data: comment } = await reader
            .from("practice_listener_comment_feed")
            .select("body")
            .eq("id", notice.commentId)
            .maybeSingle();
          return {
            ...notice,
            practiceTitle: context?.title ?? "Практика",
            practiceHref: context
              ? `${buildPracticePublicPath(context.authorSlug, context.productSlug)}#listener-impressions`
              : "/catalog",
            preview: text((comment as { body?: string } | null)?.body)?.slice(0, 140) ?? "",
          };
        }),
      );
    },
    async markNoticeRead(userId, noticeId, readAt) {
      const { data, error } = await writer
        .from("practice_listener_comment_notices")
        .update({ read_at: readAt })
        .eq("id", noticeId)
        .eq("recipient_user_id", userId)
        .select("id")
        .maybeSingle();
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_notice_read_failed");
      return Boolean(data);
    },
    async insertReport(row) {
      const { error } = await writer.from("practice_listener_comment_reports").insert({
        id: row.id,
        comment_id: row.commentId,
        reporter_user_id: row.reporterUserId,
        reason: row.reason,
        details: row.details,
        created_at: row.createdAt,
      });
      if (error && (error as { code?: string }).code === "23505") return "duplicate";
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_report_failed");
      return "created";
    },
    async countRecentReports(userId, sinceIso) {
      const { count, error } = await writer
        .from("practice_listener_comment_reports")
        .select("id", { count: "exact", head: true })
        .eq("reporter_user_id", userId)
        .gte("created_at", sinceIso);
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_report_rate_failed");
      return count ?? 0;
    },
    async listReports(commentId) {
      const { data, error } = await writer
        .from("practice_listener_comment_reports")
        .select("id, comment_id, reporter_user_id, reason, details, created_at")
        .eq("comment_id", commentId);
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_reports_failed");
      return (data ?? []).map((item) => {
        const row = item as Record<string, unknown>;
        return {
          id: String(row.id),
          commentId: String(row.comment_id),
          reporterUserId: String(row.reporter_user_id),
          reason: row.reason as ReportReason,
          details: text(row.details),
          createdAt: text(row.created_at) ?? new Date(0).toISOString(),
        } satisfies CommentReportRow;
      });
    },
    async insertModerationEvent(row) {
      const { error } = await writer.from("practice_listener_comment_moderation_events").insert({
        id: row.id,
        comment_id: row.commentId,
        actor_user_id: row.actorUserId,
        action: row.action,
        reason: row.reason,
        created_at: row.createdAt,
      });
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_moderation_event_failed");
    },
    async listModerationEvents(commentId) {
      const { data, error } = await writer
        .from("practice_listener_comment_moderation_events")
        .select("id, comment_id, actor_user_id, action, reason, created_at")
        .eq("comment_id", commentId)
        .order("created_at", { ascending: true });
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_moderation_events_failed");
      return (data ?? []).map((item) => {
        const row = item as Record<string, unknown>;
        const action = row.action === "hide" ? "hide" : "report";
        return {
          id: String(row.id),
          commentId: String(row.comment_id),
          actorUserId: String(row.actor_user_id),
          action,
          reason: text(row.reason),
          createdAt: text(row.created_at) ?? new Date(0).toISOString(),
        } satisfies ModerationEventRow;
      });
    },
    async listModerationQueue(query) {
      const columns =
        "id, practice_id, user_id, parent_id, kind, body, public_name, status, client_request_id, body_fingerprint, hidden_reason, created_at, updated_at, edited_at, deleted_at";
      // Reports: inner join keeps only comments that already have a report,
      // then limit and cursor apply to that set. Limiting published rows first
      // drops an older report behind a page of newer unreported comments.
      const select =
        query.queue === "reports"
          ? `${columns}, practice_listener_comment_reports!inner(id)`
          : columns;
      let request = writer
        .from("practice_listener_comments")
        .select(select)
        .neq("status", "deleted")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(query.limit);
      request =
        query.queue === "hidden" ? request.eq("status", "hidden") : request.eq("status", "published");
      if (query.cursor) request = request.or(cursorFilter("new", query.cursor));
      const { data, error } = await request;
      throwIfUnavailable(error);
      if (error) throw new Error("listener_comment_moderation_queue_failed");
      return (data ?? []).map(mapRaw).filter((row): row is ListenerCommentRow => row != null);
    },
  };
}
