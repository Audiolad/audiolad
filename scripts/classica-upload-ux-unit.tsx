import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ComponentProps } from "react";

import { renderToStaticMarkup } from "react-dom/server";

import ClassicaUploadPanel from "../src/components/classica/ClassicaUploadPanel";
import { classicaUploadRows, submitClassicaAssetFile } from "../src/lib/classica/production/upload-client";
import type { ClassicaActionState } from "../src/lib/classica/production/action-state";

const jobId = "11111111-1111-4111-8111-111111111111";

async function main() {

function file(name: string, type: string, size = 32): File {
  return new File([new Uint8Array(size)], name, { type });
}

const calls: string[] = [];

async function uploadOk(_state: ClassicaActionState, formData: FormData): Promise<ClassicaActionState> {
  calls.push(`upload:${String(formData.get("kind"))}:${String(formData.get("alt_text"))}`);
  const kind = String(formData.get("kind"));
  return { error: null, uploadedPath: `${jobId}/${kind}/new.bin` };
}

async function removeOk(formData: FormData): Promise<void> {
  calls.push(`remove:${String(formData.get("asset_id"))}`);
}

const rejected = await submitClassicaAssetFile({
  kind: "final_audio",
  jobId,
  file: file("cover.png", "image/png"),
  altText: "",
  titleText: "",
  replaceAssetId: null,
  upload: async () => {
    throw new Error("upload must not run for a rejected file");
  },
  remove: async () => {
    throw new Error("remove must not run for a rejected file");
  },
});
assert.equal(rejected.status, "rejected");
if (rejected.status === "rejected") {
  assert.equal(rejected.fileName, "cover.png");
  assert.equal(rejected.message, "Этот тип файла для выбранного поля не подходит.");
}

const tooBig = await submitClassicaAssetFile({
  kind: "cover",
  jobId,
  file: file("huge.png", "image/png", 9 * 1024 * 1024),
  altText: "обложка",
  titleText: "",
  replaceAssetId: null,
  upload: async () => {
    throw new Error("upload must not run for a file that is too large");
  },
  remove: async () => {
    throw new Error("remove must not run for a file that is too large");
  },
});
assert.equal(tooBig.status, "rejected");
if (tooBig.status === "rejected") {
  assert.equal(tooBig.fileName, "huge.png");
  assert.equal(tooBig.message, "Файл больше допустимого размера.");
}

calls.length = 0;
const audio = await submitClassicaAssetFile({
  kind: "final_audio",
  jobId,
  file: file("master.mp3", "audio/mpeg"),
  altText: "",
  titleText: "",
  replaceAssetId: "old-audio",
  upload: uploadOk,
  remove: removeOk,
});
assert.deepEqual(calls, ["upload:final_audio:"]);
assert.equal(audio.status, "uploaded");
if (audio.status === "uploaded") {
  assert.equal(audio.fileName, "master.mp3");
  assert.equal(audio.storagePath, `${jobId}/final_audio/new.bin`);
}

calls.length = 0;
const slider = await submitClassicaAssetFile({
  kind: "slider",
  jobId,
  file: file("slide.webp", "image/webp"),
  altText: "сохранить",
  titleText: "кадр",
  replaceAssetId: "slide-1",
  upload: uploadOk,
  remove: removeOk,
});
assert.deepEqual(calls, ["upload:slider:сохранить", "remove:slide-1"]);
assert.equal(slider.status, "uploaded");

calls.length = 0;
const failed = await submitClassicaAssetFile({
  kind: "source_file",
  jobId,
  file: file("score.pdf", "application/pdf"),
  altText: "",
  titleText: "",
  replaceAssetId: null,
  upload: async () => ({ error: "Не удалось загрузить файл." }),
  remove: async () => {
    throw new Error("remove must not run after a failed upload");
  },
});
assert.equal(failed.status, "failed");

const asset = {
  id: "asset-1",
  storagePath: `${jobId}/cover/asset-1.jpg`,
  mimeType: "image/jpeg",
  byteSize: 2048,
  altText: "Ноты",
  titleText: "Обложка",
  signedUrl: "https://cdn.example/cover.jpg",
};

const named = classicaUploadRows({
  assets: [asset],
  namesByPath: { [asset.storagePath]: "chosen-cover.jpg" },
  previewsByPath: {},
});
assert.equal(named[0]?.name, "chosen-cover.jpg");
assert.equal(named[0]?.previewUrl, "https://cdn.example/cover.jpg");
assert.equal(named[0]?.assetId, "asset-1");

const storedName = classicaUploadRows({
  assets: [{ ...asset, mimeType: "audio/mpeg", signedUrl: "https://cdn.example/audio.mp3" }],
  namesByPath: {},
  previewsByPath: {},
});
assert.equal(storedName[0]?.name, "asset-1.jpg");
assert.equal(storedName[0]?.previewUrl, null);

const provisional = classicaUploadRows({
  assets: [],
  namesByPath: {},
  previewsByPath: {},
  provisional: {
    storagePath: `${jobId}/final_audio/new.mp3`,
    name: "master.mp3",
    size: 4096,
    previewUrl: null,
  },
});
assert.equal(provisional.length, 1);
assert.equal(provisional[0]?.name, "master.mp3");
assert.equal(provisional[0]?.assetId, null);

const hidden = classicaUploadRows({
  assets: [asset],
  namesByPath: {},
  previewsByPath: {},
  hiddenAssetIds: [asset.id],
});
assert.equal(hidden.length, 0);

function render(props: Partial<ComponentProps<typeof ClassicaUploadPanel>> = {}) {
  return renderToStaticMarkup(
    <ClassicaUploadPanel
      jobId={jobId}
      kind="final_audio"
      label="Итоговое аудио"
      accept="audio/*"
      showText={false}
      assets={[]}
      altText=""
      titleText=""
      onAltTextChange={() => undefined}
      onTitleTextChange={() => undefined}
      uploading={false}
      hiddenAssetIds={[]}
      namesByPath={{}}
      previewsByPath={{}}
      provisional={null}
      error={null}
      onFile={() => undefined}
      removeAction={() => undefined}
      {...props}
    />,
  );
}

const empty = render();
assert.match(empty, /Загрузить файл/);
assert.doesNotMatch(empty, /Файл не выбран/);
assert.doesNotMatch(empty, /type="submit"/);
assert.match(empty, /class="sr-only"/);
assert.match(empty, /type="file"/);
assert.doesNotMatch(empty, /Загружено/);

const uploading = render({ uploading: true });
assert.match(uploading, /Загрузка…/);
assert.doesNotMatch(uploading, /Загрузить файл/);

const uploaded = render({
  kind: "cover",
  label: "Обложка",
  showText: true,
  accept: "image/jpeg,image/png,image/webp",
  assets: [asset],
  namesByPath: { [asset.storagePath]: "chosen-cover.jpg" },
  altText: "Ноты",
  titleText: "Обложка",
});
assert.match(uploaded, /chosen-cover\.jpg/);
assert.match(uploaded, /Загружено/);
assert.match(uploaded, /Заменить/);
assert.match(uploaded, /Удалить/);
assert.match(uploaded, /name="asset_id" value="asset-1"/);
assert.match(uploaded, /https:\/\/cdn\.example\/cover\.jpg/);
assert.match(uploaded, /Альтернативный текст/);
assert.doesNotMatch(uploaded, /Загрузить файл/);
assert.doesNotMatch(uploaded, /Файл не выбран/);

const sliderMarkup = render({
  kind: "slider",
  label: "Изображение для слайдера",
  showText: true,
  accept: "image/jpeg,image/png,image/webp",
  assets: [asset, { ...asset, id: "asset-2", storagePath: `${jobId}/slider/asset-2.webp` }],
});
assert.match(sliderMarkup, /Загрузить файл/);
assert.equal(sliderMarkup.match(/Удалить/g)?.length, 2);

const mimeError = render({
  error: { fileName: "notes.txt", message: "Этот тип файла для выбранного поля не подходит." },
});
assert.match(mimeError, /notes\.txt: Этот тип файла для выбранного поля не подходит\./);

const page = readFileSync(
  new URL("../src/app/(platform)/classica/production/[jobId]/page.tsx", import.meta.url),
  "utf8",
);
for (const kind of ["final_audio", "source_render", "source_file", "cover", "slider"]) {
  assert.match(page, new RegExp(`kind="${kind}"`));
}
assert.doesNotMatch(page, /removeClassicaAssetAction/);
assert.match(page, /ClassicaUploadForm/);

const form = readFileSync(new URL("../src/components/classica/ClassicaUploadForm.tsx", import.meta.url), "utf8");
assert.match(form, /submitClassicaAssetFile/);
assert.match(form, /uploadClassicaAssetAction/);
assert.match(form, /removeClassicaAssetAction/);
assert.doesNotMatch(form, /type="submit"/);
assert.doesNotMatch(form, />\s*Загрузить\s*</);

console.log("classica upload ux unit ok");
}

void main();
