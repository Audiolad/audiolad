"use client";

import { useEffect, useRef, useState } from "react";

import ClassicaUploadPanel from "@/components/classica/ClassicaUploadPanel";
import { classicaChosenFileError, type ClassicaAssetKind } from "@/lib/classica/production/files";
import { removeClassicaAssetAction, uploadClassicaAssetAction } from "@/lib/classica/production/actions";
import {
  submitClassicaAssetFile,
  type ClassicaUploadAssetView,
  type ClassicaUploadProvisional,
} from "@/lib/classica/production/upload-client";

function dropKeys(record: Record<string, string>, keys: readonly string[]): Record<string, string> {
  let changed = false;
  const next = { ...record };
  for (const key of keys) {
    if (key in next) {
      delete next[key];
      changed = true;
    }
  }
  return changed ? next : record;
}

type ClassicaUploadFormProps = {
  jobId: string;
  kind: ClassicaAssetKind;
  label: string;
  accept: string;
  showText?: boolean;
  assets?: readonly ClassicaUploadAssetView[];
};

export default function ClassicaUploadForm({
  jobId,
  kind,
  label,
  accept,
  showText = false,
  assets = [],
}: ClassicaUploadFormProps) {
  const initial = kind === "slider" ? null : assets[0];
  const [altText, setAltText] = useState(initial?.altText ?? "");
  const [titleText, setTitleText] = useState(initial?.titleText ?? "");
  const [uploading, setUploading] = useState(false);
  const [hiddenAssetIds, setHiddenAssetIds] = useState<string[]>([]);
  const [uploadBaselineIds, setUploadBaselineIds] = useState<string[] | null>(null);
  const [namesByPath, setNamesByPath] = useState<Record<string, string>>({});
  const [previewsByPath, setPreviewsByPath] = useState<Record<string, string>>({});
  const [provisional, setProvisional] = useState<ClassicaUploadProvisional | null>(null);
  const [suppressAssetId, setSuppressAssetId] = useState<string | null>(null);
  const [error, setError] = useState<{ fileName: string; message: string } | null>(null);
  const previewUrls = useRef<string[]>([]);
  const assetSignature = assets.map((asset) => `${asset.id}\t${asset.storagePath}`).join("\n");
  const [trackedSignature, setTrackedSignature] = useState(assetSignature);

  if (assetSignature !== trackedSignature) {
    const previous = trackedSignature
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const tab = line.indexOf("\t");
        return { id: line.slice(0, tab), storagePath: line.slice(tab + 1) };
      });
    const currentIds = new Set(assets.map((asset) => asset.id));
    const currentPaths = new Set(assets.map((asset) => asset.storagePath));
    const removedPaths = previous
      .filter((asset) => !currentPaths.has(asset.storagePath))
      .map((asset) => asset.storagePath);
    setTrackedSignature(assetSignature);
    if (suppressAssetId && !currentIds.has(suppressAssetId)) {
      setSuppressAssetId(null);
    }
    if (removedPaths.length > 0) {
      setNamesByPath((current) => dropKeys(current, removedPaths));
      setPreviewsByPath((current) => dropKeys(current, removedPaths));
      setProvisional((current) =>
        current && removedPaths.includes(current.storagePath) ? null : current,
      );
    }
  }

  const displayAssets =
    kind !== "slider" && provisional
      ? assets.filter((asset) => asset.storagePath === provisional.storagePath)
      : assets;

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  async function onFile(file: File, replaceAssetId: string | null) {
    const problem = classicaChosenFileError(kind, file);
    if (problem) {
      setError({ fileName: file.name, message: problem });
      return;
    }

    const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    if (previewUrl) {
      previewUrls.current.push(previewUrl);
    }
    const replaced = replaceAssetId ? assets.find((asset) => asset.id === replaceAssetId) : null;
    const preservingSlider = kind === "slider" && replaced;
    setError(null);
    setUploading(true);
    setUploadBaselineIds(assets.map((asset) => asset.id));
    if (preservingSlider && replaceAssetId) {
      setSuppressAssetId(replaceAssetId);
    }
    setHiddenAssetIds(
      kind === "slider" ? (replaceAssetId ? [replaceAssetId] : []) : assets.map((asset) => asset.id),
    );

    try {
      const result = await submitClassicaAssetFile({
        kind,
        jobId,
        file,
        altText: preservingSlider ? (replaced.altText ?? "") : altText,
        titleText: preservingSlider ? (replaced.titleText ?? "") : titleText,
        replaceAssetId,
        upload: uploadClassicaAssetAction,
        remove: removeClassicaAssetAction,
      });
      if (result.status !== "uploaded") {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
        setError({ fileName: result.fileName, message: result.message });
        return;
      }
      setNamesByPath((current) => ({ ...current, [result.storagePath]: result.fileName }));
      if (previewUrl) {
        setPreviewsByPath((current) => ({ ...current, [result.storagePath]: previewUrl }));
      }
      setProvisional({
        storagePath: result.storagePath,
        name: result.fileName,
        size: result.size,
        previewUrl,
      });
    } finally {
      setUploading(false);
      setHiddenAssetIds([]);
      setUploadBaselineIds(null);
    }
  }

  return (
    <ClassicaUploadPanel
      jobId={jobId}
      kind={kind}
      label={label}
      accept={accept}
      showText={showText}
      assets={displayAssets}
      altText={altText}
      titleText={titleText}
      onAltTextChange={setAltText}
      onTitleTextChange={setTitleText}
      uploading={uploading}
      hiddenAssetIds={
        uploading
          ? [
              ...hiddenAssetIds,
              ...assets
                .filter((asset) => uploadBaselineIds != null && !uploadBaselineIds.includes(asset.id))
                .map((asset) => asset.id),
            ]
          : suppressAssetId
            ? [suppressAssetId]
            : []
      }
      namesByPath={namesByPath}
      previewsByPath={previewsByPath}
      provisional={provisional}
      error={error}
      onFile={onFile}
      removeAction={removeClassicaAssetAction}
    />
  );
}
