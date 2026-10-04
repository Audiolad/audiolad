"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { classicaIdleState, type ClassicaActionState } from "@/lib/classica/production/action-state";
import { mapClassicaError } from "@/lib/classica/production/errors";
import { classicaCanAdmin, requireClassicaProductionAccess } from "@/lib/classica/production/access";
import {
  classicaAssetExtension,
  classicaChosenFileError,
  classicaProductionObjectPath,
  classicaPublishedObjectPath,
  classicaPublishCleanupPaths,
  type ClassicaAssetKind,
  type ClassicaPublicCopyAttempt,
} from "@/lib/classica/production/files";
import { parseRublesInput } from "@/lib/classica/production/money";
import { prepareClassicaPackaging } from "@/lib/classica/production/openai";
import {
  CLASSICA_PACKAGING_FIELDS,
  type ClassicaPackagingFacts,
} from "@/lib/classica/production/packaging";
import { getClassicaJob, getClassicaMasterPrompt } from "@/lib/classica/production/queries";
import { isClassicaSlug, slugifyClassicaName } from "@/lib/classica/production/slug";
import {
  canEditClassicaCard,
  classicaPackagingCooldownActive,
} from "@/lib/classica/production/status";
import { CLASSICA_PRODUCTION_BUCKET, CLASSICA_PUBLIC_BUCKET } from "@/lib/classica/public/paths";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

function fail(error: unknown): ClassicaActionState {
  return { error: mapClassicaError(error) };
}

async function userClient() {
  return createClient();
}

function revalidateJob(jobId: string) {
  revalidatePath("/classica/production");
  revalidatePath(`/classica/production/${jobId}`);
  revalidatePath("/classica/production/stats");
}

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function faqFromForm(formData: FormData) {
  const faq = [];
  for (let index = 1; index <= 4; index += 1) {
    const question = readText(formData, `faq_q_${index}`);
    const answer = readText(formData, `faq_a_${index}`);
    if (question || answer) {
      faq.push({ question, answer });
    }
  }
  return faq;
}

function blocksFromForm(formData: FormData) {
  const blocks = [];
  for (let index = 1; index <= 2; index += 1) {
    const heading = readText(formData, `block_h_${index}`);
    const body = readText(formData, `block_b_${index}`);
    if (heading || body) {
      blocks.push({ heading, body });
    }
  }
  return blocks;
}

function cardPatch(formData: FormData): Record<string, unknown> {
  const cost = parseRublesInput(readText(formData, "task_cost_rubles") || "0");
  const year = readText(formData, "composition_year");
  const priority = Number(readText(formData, "priority") || "3");
  return {
    composer_name: readText(formData, "composer_name"),
    title: readText(formData, "title"),
    alternative_title: readText(formData, "alternative_title"),
    catalogue_system: readText(formData, "catalogue_system"),
    catalogue_number: readText(formData, "catalogue_number"),
    musical_key: readText(formData, "musical_key"),
    movement_label: readText(formData, "movement_label"),
    composition_year: year,
    primary_query: readText(formData, "primary_query"),
    extra_queries: readText(formData, "extra_queries")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    seo_title: readText(formData, "seo_title"),
    seo_description: readText(formData, "seo_description"),
    slug: readText(formData, "slug"),
    composer_slug: readText(formData, "composer_slug"),
    score_source: readText(formData, "score_source"),
    source_url: readText(formData, "source_url"),
    source_description: readText(formData, "source_description"),
    source_type: readText(formData, "source_type"),
    rights_checked: formData.get("rights_checked") === "on",
    rights_comment: readText(formData, "rights_comment"),
    heading: readText(formData, "heading"),
    subtitle: readText(formData, "subtitle"),
    short_description: readText(formData, "short_description"),
    body: readText(formData, "body"),
    about_work: readText(formData, "about_work"),
    about_composer: readText(formData, "about_composer"),
    listening_notes: readText(formData, "listening_notes"),
    faq: faqFromForm(formData),
    extra_blocks: blocksFromForm(formData),
    priority: Number.isInteger(priority) ? priority : 3,
    complexity: readText(formData, "complexity") || "medium",
    task_cost_minor: cost ?? -1,
    due_on: readText(formData, "due_on"),
  };
}

export async function createClassicaJobAction(
  _state: ClassicaActionState,
  formData: FormData,
): Promise<ClassicaActionState> {
  const cost = parseRublesInput(readText(formData, "task_cost_rubles") || "0");
  if (cost === null) {
    return { error: "Стоимость: целое число рублей, можно 0." };
  }
  const supabase = await userClient();
  const { data, error } = await supabase.rpc("classica_production_create_job", {
    p_patch: {
      composer_name: readText(formData, "composer_name"),
      title: readText(formData, "title"),
      alternative_title: readText(formData, "alternative_title"),
      catalogue_system: readText(formData, "catalogue_system"),
      catalogue_number: readText(formData, "catalogue_number"),
      primary_query: readText(formData, "primary_query"),
      priority: Number(readText(formData, "priority") || "3"),
      complexity: readText(formData, "complexity") || "medium",
      task_cost_minor: cost,
      due_on: readText(formData, "due_on"),
      composition_year: readText(formData, "composition_year"),
      musical_key: readText(formData, "musical_key"),
    },
  });
  if (error) {
    return fail(error);
  }
  const jobId = typeof data === "string" ? data : null;
  if (!jobId) {
    return { error: "Работа не создана." };
  }
  revalidatePath("/classica/production");
  redirect(`/classica/production/${jobId}`);
}

export async function saveClassicaCardAction(
  _state: ClassicaActionState,
  formData: FormData,
): Promise<ClassicaActionState> {
  const jobId = readText(formData, "job_id");
  const patch = cardPatch(formData);
  if (patch.task_cost_minor === -1) {
    return { error: "Стоимость: целое число рублей, можно 0." };
  }
  const year = String(patch.composition_year ?? "");
  if (year && (!/^\d{1,4}$/.test(year) || Number(year) < 1 || Number(year) > 2100)) {
    return { error: "Год: число от 1 до 2100 или пусто." };
  }
  const faq = patch.faq as Array<{ question: string; answer: string }>;
  if (faq.some((item) => item.question.length < 2 || item.answer.length < 2)) {
    return { error: "В FAQ заполните и вопрос, и ответ." };
  }
  const blocks = patch.extra_blocks as Array<{ heading: string; body: string }>;
  if (blocks.some((item) => item.heading.length < 2 || item.body.length < 2)) {
    return { error: "В дополнительном блоке заполните заголовок и текст." };
  }
  const supabase = await userClient();
  const { error } = await supabase.rpc("classica_production_save_card", {
    p_job_id: jobId,
    p_patch: patch,
  });
  if (error) {
    return fail(error);
  }
  revalidateJob(jobId);
  return classicaIdleState;
}

export async function takeClassicaJobAction(formData: FormData): Promise<void> {
  const jobId = readText(formData, "job_id");
  const supabase = await userClient();
  const { error } = await supabase.rpc("classica_production_take", { p_job_id: jobId });
  if (error) {
    redirect(`/classica/production/${jobId}?error=${encodeURIComponent(mapClassicaError(error))}`);
  }
  revalidateJob(jobId);
  redirect(`/classica/production/${jobId}`);
}

export async function releaseClassicaJobAction(formData: FormData): Promise<void> {
  const jobId = readText(formData, "job_id");
  const action = readText(formData, "release_action");
  const supabase = await userClient();
  const { error } = await supabase.rpc("classica_production_release", {
    p_job_id: jobId,
    p_action: action,
  });
  if (error) {
    redirect(`/classica/production/${jobId}?error=${encodeURIComponent(mapClassicaError(error))}`);
  }
  revalidateJob(jobId);
  redirect(`/classica/production/${jobId}`);
}

export async function reassignClassicaJobAction(formData: FormData): Promise<void> {
  const jobId = readText(formData, "job_id");
  const assignee = readText(formData, "assignee_id");
  const supabase = await userClient();
  const { error } = await supabase.rpc("classica_production_reassign", {
    p_job_id: jobId,
    p_assignee: assignee,
  });
  if (error) {
    redirect(`/classica/production/${jobId}?error=${encodeURIComponent(mapClassicaError(error))}`);
  }
  revalidateJob(jobId);
  redirect(`/classica/production/${jobId}`);
}

export async function markClassicaStatusAction(formData: FormData): Promise<void> {
  const jobId = readText(formData, "job_id");
  const status = readText(formData, "status");
  const supabase = await userClient();
  const { error } = await supabase.rpc("classica_production_mark_status", {
    p_job_id: jobId,
    p_status: status,
  });
  if (error) {
    redirect(`/classica/production/${jobId}?error=${encodeURIComponent(mapClassicaError(error))}`);
  }
  revalidateJob(jobId);
}

export async function submitClassicaJobAction(formData: FormData): Promise<void> {
  const jobId = readText(formData, "job_id");
  const supabase = await userClient();
  const { error } = await supabase.rpc("classica_production_submit", { p_job_id: jobId });
  if (error) {
    redirect(`/classica/production/${jobId}?error=${encodeURIComponent(mapClassicaError(error))}`);
  }
  revalidateJob(jobId);
  redirect(`/classica/production/${jobId}`);
}

export async function reviewClassicaJobAction(formData: FormData): Promise<void> {
  const jobId = readText(formData, "job_id");
  const supabase = await userClient();
  const { error } = await supabase.rpc("classica_production_review", {
    p_job_id: jobId,
    p_decision: readText(formData, "decision"),
    p_reason: readText(formData, "reason"),
    p_comment: readText(formData, "comment"),
  });
  if (error) {
    redirect(`/classica/production/${jobId}?error=${encodeURIComponent(mapClassicaError(error))}`);
  }
  revalidateJob(jobId);
  redirect(`/classica/production/${jobId}`);
}

export async function confirmClassicaPlaybackAction(
  _state: ClassicaActionState,
  formData: FormData,
): Promise<ClassicaActionState> {
  const jobId = readText(formData, "job_id");
  const duration = Number(readText(formData, "duration_seconds"));
  if (!Number.isFinite(duration) || duration <= 0) {
    return { error: "Сначала дождитесь, пока плеер покажет длительность, и нажмите воспроизведение." };
  }
  const supabase = await userClient();
  const { error } = await supabase.rpc("classica_production_confirm_playback", {
    p_job_id: jobId,
    p_duration: duration,
  });
  if (error) {
    return fail(error);
  }
  revalidateJob(jobId);
  return classicaIdleState;
}

export async function uploadClassicaAssetAction(
  _state: ClassicaActionState,
  formData: FormData,
): Promise<ClassicaActionState> {
  const jobId = readText(formData, "job_id");
  const kind = readText(formData, "kind") as ClassicaAssetKind;
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Выберите файл." };
  }
  const chosenError = classicaChosenFileError(kind, file);
  if (chosenError) {
    return { error: chosenError };
  }
  const extension = classicaAssetExtension(file.type);
  if (!extension) {
    return { error: "Не удалось определить расширение файла." };
  }

  const assetId = crypto.randomUUID();
  const path = classicaProductionObjectPath(jobId, kind, assetId, extension);
  const supabase = await userClient();
  const uploaded = await supabase.storage
    .from(CLASSICA_PRODUCTION_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploaded.error) {
    return { error: "Не удалось загрузить файл." };
  }

  const { data, error } = await supabase.rpc("classica_production_register_asset", {
    p_job_id: jobId,
    p_kind: kind,
    p_bucket: CLASSICA_PRODUCTION_BUCKET,
    p_path: path,
    p_mime: file.type,
    p_bytes: file.size,
    p_alt: readText(formData, "alt_text"),
    p_title: readText(formData, "title_text"),
    p_sort: Number(readText(formData, "sort_order") || "0"),
  });
  if (error) {
    await supabase.storage.from(CLASSICA_PRODUCTION_BUCKET).remove([path]);
    return fail(error);
  }
  const replaced = Array.isArray(data) ? data.filter((item): item is string => typeof item === "string") : [];
  if (replaced.length > 0) {
    await supabase.storage.from(CLASSICA_PRODUCTION_BUCKET).remove(replaced);
  }
  revalidateJob(jobId);
  return { error: null, uploadedPath: path };
}

export async function removeClassicaAssetAction(formData: FormData): Promise<void> {
  const jobId = readText(formData, "job_id");
  const assetId = readText(formData, "asset_id");
  const supabase = await userClient();
  const { data, error } = await supabase.rpc("classica_production_remove_asset", {
    p_asset_id: assetId,
  });
  if (error) {
    redirect(`/classica/production/${jobId}?error=${encodeURIComponent(mapClassicaError(error))}`);
  }
  if (typeof data === "string" && data) {
    await supabase.storage.from(CLASSICA_PRODUCTION_BUCKET).remove([data]);
  }
  revalidateJob(jobId);
}

export async function prepareClassicaPackagingAction(formData: FormData): Promise<void> {
  const jobId = readText(formData, "job_id");
  const session = await requireClassicaProductionAccess();
  const job = await getClassicaJob(session.supabase, jobId);
  if (!job) {
    redirect("/classica/production?error=not-found");
  }
  const canEdit = canEditClassicaCard(job.status, {
    isAssignee: job.assigneeId === session.userId,
    isAdmin: classicaCanAdmin(session.access),
  });
  if (!canEdit) {
    redirect(
      `/classica/production/${jobId}?error=${encodeURIComponent("Недостаточно прав для этого действия.")}`,
    );
  }
  if (classicaPackagingCooldownActive(job.packagingPreparedAt, new Date())) {
    redirect(
      `/classica/production/${jobId}?error=${encodeURIComponent("Повторная подготовка оформления для этой работы пока недоступна. Подождите пару минут.")}`,
    );
  }
  let masterPrompt = "";
  try {
    masterPrompt = await getClassicaMasterPrompt(createServiceRoleClient());
  } catch {
    redirect(`/classica/production/${jobId}?error=${encodeURIComponent("Мастер-промпт не найден.")}`);
  }
  const facts: ClassicaPackagingFacts = {
    composer: job.composerName,
    title: job.title,
    alternativeTitle: job.alternativeTitle,
    catalogueSystem: job.catalogueSystem,
    catalogueNumber: job.catalogueNumber,
    musicalKey: job.musicalKey,
    movement: job.movementLabel,
    year: job.compositionYear,
    primaryQuery: job.primaryQuery,
    extraQueries: job.extraQueries,
    scoreSource: job.scoreSource,
    sourceType: job.sourceType,
    rightsChecked: job.rightsChecked,
    durationSeconds: job.durationSeconds,
  };
  const prepared = await prepareClassicaPackaging({ masterPrompt, facts });
  if (!prepared.ok) {
    redirect(`/classica/production/${jobId}?error=${encodeURIComponent(prepared.error)}`);
  }
  const fields = Object.fromEntries(
    CLASSICA_PACKAGING_FIELDS.map((field) => [field, prepared.draft[field].text]),
  );
  const { error } = await session.supabase.rpc("classica_production_apply_packaging", {
    p_job_id: jobId,
    p_fields: fields,
    p_flags: prepared.flags,
  });
  if (error) {
    redirect(`/classica/production/${jobId}?error=${encodeURIComponent(mapClassicaError(error))}`);
  }
  revalidateJob(jobId);
  redirect(`/classica/production/${jobId}`);
}

export async function publishClassicaJobAction(formData: FormData): Promise<void> {
  const jobId = readText(formData, "job_id");
  const supabase = await userClient();
  const job = await getClassicaJob(supabase, jobId);
  if (!job) {
    redirect("/classica/production");
  }
  const composerSlug = job.composerSlug || slugifyClassicaName(job.composerName);
  if (!isClassicaSlug(composerSlug) || !job.slug) {
    redirect(
      `/classica/production/${jobId}?error=${encodeURIComponent("Перед публикацией заполните slug произведения и, если нужно, slug композитора.")}`,
    );
  }
  const audio = job.assets.find((asset) => asset.kind === "final_audio");
  const cover = job.assets.find((asset) => asset.kind === "cover");
  if (!audio || !cover) {
    redirect(
      `/classica/production/${jobId}?error=${encodeURIComponent("Для публикации нужны итоговое аудио и обложка.")}`,
    );
  }

  const copiedThisAttempt: ClassicaPublicCopyAttempt[] = [];

  async function removeFilesCopiedThisAttempt() {
    const paths = classicaPublishCleanupPaths(copiedThisAttempt);
    if (paths.length === 0) {
      return;
    }
    await supabase.storage.from(CLASSICA_PUBLIC_BUCKET).remove(paths);
  }

  function objectAlreadyExists(error: { message?: string; statusCode?: string | number; status?: number }) {
    const message = `${error.message ?? ""}`.toLowerCase();
    const status = `${error.statusCode ?? error.status ?? ""}`;
    return status === "409" || message.includes("already exists") || message.includes("duplicate");
  }

  async function copyAsset(sourcePath: string, targetPath: string, mime: string) {
    const slash = targetPath.lastIndexOf("/");
    const folder = targetPath.slice(0, slash);
    const name = targetPath.slice(slash + 1);
    const listed = await supabase.storage.from(CLASSICA_PUBLIC_BUCKET).list(folder, {
      limit: 1000,
      search: name,
    });
    const existedBefore = listed.error
      ? null
      : (listed.data ?? []).some((item) => item.name === name);
    if (existedBefore === true) {
      copiedThisAttempt.push({ path: targetPath, existedBefore: true });
      return;
    }
    const downloaded = await supabase.storage.from(CLASSICA_PRODUCTION_BUCKET).download(sourcePath);
    if (downloaded.error || !downloaded.data) {
      throw new Error("classica_publish_incomplete");
    }
    const uploaded = await supabase.storage.from(CLASSICA_PUBLIC_BUCKET).upload(targetPath, downloaded.data, {
      contentType: mime,
      upsert: false,
    });
    if (uploaded.error) {
      if (objectAlreadyExists(uploaded.error)) {
        copiedThisAttempt.push({ path: targetPath, existedBefore: true });
        return;
      }
      throw new Error("classica_publish_incomplete");
    }
    copiedThisAttempt.push({ path: targetPath, existedBefore: false });
  }

  const audioName = audio.storagePath.split("/").pop() ?? "audio.bin";
  const coverName = cover.storagePath.split("/").pop() ?? "cover.bin";
  const audioPath = classicaPublishedObjectPath(jobId, "audio", audioName);
  const coverPath = classicaPublishedObjectPath(jobId, "cover", coverName);
  const images = [];
  try {
    await copyAsset(audio.storagePath, audioPath, audio.mimeType);
    await copyAsset(cover.storagePath, coverPath, cover.mimeType);
    for (const image of job.assets.filter((asset) => asset.kind === "slider")) {
      const name = image.storagePath.split("/").pop() ?? "image.bin";
      const target = classicaPublishedObjectPath(jobId, "slider", name);
      await copyAsset(image.storagePath, target, image.mimeType);
      images.push({
        path: target,
        alt: image.altText ?? "",
        title: image.titleText ?? "",
      });
    }
  } catch (error) {
    await removeFilesCopiedThisAttempt();
    redirect(`/classica/production/${jobId}?error=${encodeURIComponent(mapClassicaError(error))}`);
  }

  const { error } = await supabase.rpc("classica_production_publish", {
    p_job_id: jobId,
    p_composer_slug: composerSlug,
    p_audio_path: audioPath,
    p_cover_path: coverPath,
    p_images: images,
  });
  if (error) {
    await removeFilesCopiedThisAttempt();
    redirect(`/classica/production/${jobId}?error=${encodeURIComponent(mapClassicaError(error))}`);
  }
  revalidateJob(jobId);
  revalidatePath("/classica");
  revalidatePath(`/classica/${composerSlug}/${job.slug}`);
  redirect(`/classica/${composerSlug}/${job.slug}`);
}

export async function saveClassicaPromptAction(formData: FormData): Promise<void> {
  const supabase = await userClient();
  const { error } = await supabase.rpc("classica_production_save_prompt", {
    p_body: readText(formData, "body"),
  });
  if (error) {
    redirect(`/classica/production/prompt?error=${encodeURIComponent(mapClassicaError(error))}`);
  }
  revalidatePath("/classica/production/prompt");
  redirect("/classica/production/prompt");
}

export async function grantClassicaRoleAction(
  _state: ClassicaActionState,
  formData: FormData,
): Promise<ClassicaActionState> {
  const supabase = await userClient();
  const { error } = await supabase.rpc("classica_production_grant_role", {
    p_email: readText(formData, "email"),
    p_role: readText(formData, "role"),
  });
  if (error) {
    return fail(error);
  }
  revalidatePath("/classica/production/team");
  return classicaIdleState;
}

export async function revokeClassicaRoleAction(formData: FormData): Promise<void> {
  const supabase = await userClient();
  const { error } = await supabase.rpc("classica_production_revoke_role", {
    p_user_id: readText(formData, "user_id"),
    p_role: readText(formData, "role"),
  });
  if (error) {
    redirect(`/classica/production/team?error=${encodeURIComponent(mapClassicaError(error))}`);
  }
  revalidatePath("/classica/production/team");
}
