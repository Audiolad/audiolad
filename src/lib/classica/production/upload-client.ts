import { classicaIdleState, type ClassicaActionState } from "@/lib/classica/production/action-state";
import {
  classicaAssetFileLabel,
  classicaChosenFileError,
  type ClassicaAssetKind,
} from "@/lib/classica/production/files";

export type ClassicaUploadAssetView = {
  id: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  altText: string | null;
  titleText: string | null;
  signedUrl: string | null;
};

export type ClassicaUploadRowModel = {
  key: string;
  assetId: string | null;
  name: string;
  size: number;
  previewUrl: string | null;
  altText: string | null;
  titleText: string | null;
};

export type ClassicaUploadProvisional = {
  storagePath: string;
  name: string;
  size: number;
  previewUrl: string | null;
};

export type ClassicaAssetUploadResult =
  | { status: "rejected"; fileName: string; message: string }
  | { status: "failed"; fileName: string; message: string }
  | { status: "uploaded"; fileName: string; size: number; storagePath: string };

type UploadAction = (
  state: ClassicaActionState,
  formData: FormData,
) => Promise<ClassicaActionState>;

type RemoveAction = (formData: FormData) => Promise<void>;

export async function submitClassicaAssetFile(input: {
  kind: ClassicaAssetKind;
  jobId: string;
  file: File;
  altText: string;
  titleText: string;
  replaceAssetId: string | null;
  upload: UploadAction;
  remove: RemoveAction;
}): Promise<ClassicaAssetUploadResult> {
  const problem = classicaChosenFileError(input.kind, input.file);
  if (problem) {
    return { status: "rejected", fileName: input.file.name, message: problem };
  }

  const formData = new FormData();
  formData.set("job_id", input.jobId);
  formData.set("kind", input.kind);
  formData.set("file", input.file);
  formData.set("alt_text", input.altText);
  formData.set("title_text", input.titleText);

  const result = await input.upload(classicaIdleState, formData);
  if (result.error || !result.uploadedPath) {
    return {
      status: "failed",
      fileName: input.file.name,
      message: result.error ?? "Не удалось загрузить файл.",
    };
  }

  if (input.kind === "slider" && input.replaceAssetId) {
    const removeData = new FormData();
    removeData.set("job_id", input.jobId);
    removeData.set("asset_id", input.replaceAssetId);
    await input.remove(removeData);
  }

  return {
    status: "uploaded",
    fileName: input.file.name,
    size: input.file.size,
    storagePath: result.uploadedPath,
  };
}

export function classicaUploadRows(input: {
  assets: readonly ClassicaUploadAssetView[];
  namesByPath: Readonly<Record<string, string>>;
  previewsByPath: Readonly<Record<string, string>>;
  hiddenAssetIds?: readonly string[];
  provisional?: ClassicaUploadProvisional | null;
}): ClassicaUploadRowModel[] {
  const hidden = new Set(input.hiddenAssetIds ?? []);
  const rows: ClassicaUploadRowModel[] = [];

  for (const asset of input.assets) {
    if (hidden.has(asset.id)) {
      continue;
    }
    const image = asset.mimeType.startsWith("image/");
    rows.push({
      key: asset.id,
      assetId: asset.id,
      name: input.namesByPath[asset.storagePath] || classicaAssetFileLabel(asset.storagePath),
      size: asset.byteSize,
      previewUrl: image ? asset.signedUrl || input.previewsByPath[asset.storagePath] || null : null,
      altText: asset.altText,
      titleText: asset.titleText,
    });
  }

  const provisional = input.provisional;
  if (provisional && !input.assets.some((asset) => asset.storagePath === provisional.storagePath)) {
    rows.push({
      key: provisional.storagePath,
      assetId: null,
      name: provisional.name,
      size: provisional.size,
      previewUrl: provisional.previewUrl,
      altText: null,
      titleText: null,
    });
  }

  return rows;
}
