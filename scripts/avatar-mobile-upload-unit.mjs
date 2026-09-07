#!/usr/bin/env node
/**
 * Universal mobile avatar upload: source formats, 20 MiB ceiling,
 * WebP-only persistence, HEIC fallback, EXIF, friendly errors.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  AVATAR_CLIENT_DIRECT_PREVIEW_MAX_BYTES,
  AVATAR_ERROR_MESSAGES,
  AVATAR_INPUT_ACCEPT,
  AVATAR_MAX_INPUT_PIXELS,
  AVATAR_MAX_SOURCE_BYTES,
  AVATAR_MAX_SOURCE_DIMENSION,
  AVATAR_PREVIEW_MAX_EDGE,
  AVATAR_UPLOAD_HINT,
} from "../src/lib/images/avatar-constants.ts";
import {
  avatarSourceBoundsError,
  peekAvatarSourceKind,
  shouldUseServerAvatarPreview,
  validateAvatarSourceFile,
  validateAvatarSourceFileMeta,
} from "../src/lib/images/avatar-source-validation.ts";
import {
  prepareAvatarSourceBuffer,
  readAvatarHeaderDimensions,
} from "../src/lib/images/avatar-source-prepare.ts";
import { convertHeicToJpegBuffer } from "../src/lib/images/heic-fallback.ts";
import { getImageProfileConfig } from "../src/lib/images/image-profiles.ts";
import {
  detectImageKindFromBytes,
  peekImageHeaderDimensions,
  readHeifIspeDimensions,
} from "../src/lib/images/image-magic.ts";
import { processImageForProfile } from "../src/lib/images/process-image.ts";
import { avatarProcessErrorMessage } from "../src/lib/images/process-avatar-image.ts";
import { processAndUploadImageSet } from "../src/lib/images/upload-image-set.ts";
import {
  detectMimeFromMagic,
  validateImageBufferForProfile,
  validateImageSourceBounds,
} from "../src/lib/images/validate-image.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const heicPath = join(root, "scripts/fixtures/avatar-source/sample.heic");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertWebpObject(buffer, label) {
  assert(buffer?.length > 12, `${label} should have bytes`);
  assert(buffer.subarray(0, 4).toString("ascii") === "RIFF", `${label} should start with RIFF`);
  assert(buffer.subarray(8, 12).toString("ascii") === "WEBP", `${label} should be real WebP`);
}

function makeFile(buffer, name, type) {
  return new File([buffer], name, { type });
}

async function createSolidJpeg(width, height, quality = 90) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 110, g: 70, b: 180 },
    },
  })
    .jpeg({ quality })
    .toBuffer();
}

async function createNoisyJpeg(width, height, quality = 92) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let index = 0; index < pixels.length; index += 1) {
    pixels[index] = (index * 37 + (index >> 3)) & 0xff;
  }

  return sharp(pixels, {
    raw: { width, height, channels: 3 },
  })
    .jpeg({ quality })
    .toBuffer();
}

async function createPng() {
  return sharp({
    create: {
      width: 320,
      height: 320,
      channels: 4,
      background: { r: 200, g: 120, b: 80, alpha: 0.8 },
    },
  })
    .png()
    .toBuffer();
}

async function createWebp() {
  return sharp({
    create: {
      width: 280,
      height: 280,
      channels: 3,
      background: { r: 40, g: 140, b: 90 },
    },
  })
    .webp({ quality: 80 })
    .toBuffer();
}

async function createAvif() {
  return sharp({
    create: {
      width: 240,
      height: 240,
      channels: 3,
      background: { r: 20, g: 90, b: 160 },
    },
  })
    .avif({ quality: 40 })
    .toBuffer();
}

async function createOrientedJpeg(orientation) {
  return sharp({
    create: {
      width: 800,
      height: 400,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .jpeg()
    .withMetadata({ orientation })
    .toBuffer();
}

function createMovStub() {
  const buffer = Buffer.alloc(32);
  buffer.writeUInt32BE(20, 0);
  buffer.write("ftyp", 4);
  buffer.write("qt  ", 8);
  buffer.writeUInt32BE(0, 12);
  buffer.write("qt  ", 16);
  return buffer;
}

function createMemoryStorage() {
  const objects = [];
  return {
    objects,
    from() {
      return {
        async upload(path, body, options) {
          objects.push({
            path,
            contentType: options.contentType,
            bytes: Buffer.from(body),
          });
          return { error: null };
        },
        async remove() {
          return {};
        },
      };
    },
  };
}

async function testPickerAndMessages() {
  assert(AVATAR_INPUT_ACCEPT.includes("image/*"), "picker includes image/*");
  assert(AVATAR_INPUT_ACCEPT.includes(".heic"), "picker includes heic");
  assert(AVATAR_INPUT_ACCEPT.includes(".heif"), "picker includes heif");
  assert(AVATAR_INPUT_ACCEPT.includes(".avif"), "picker includes avif");
  assert(!AVATAR_INPUT_ACCEPT.includes("gif"), "picker does not advertise gif");
  assert(!AVATAR_INPUT_ACCEPT.includes("svg"), "picker does not advertise svg");
  assert(!AVATAR_UPLOAD_HINT.includes("JPG"), "hint must not teach formats");
  assert(!AVATAR_UPLOAD_HINT.includes("3 МБ"), "hint must not mention 3 MB");
  assert(
    AVATAR_ERROR_MESSAGES.fileTooLarge ===
      "Фото слишком большое. Выберите изображение размером до 20 МБ.",
    "too-large copy",
  );
  assert(
    AVATAR_ERROR_MESSAGES.notImage ===
      "Не удалось распознать файл как изображение. Выберите другую фотографию.",
    "not-image copy",
  );
  assert(
    AVATAR_ERROR_MESSAGES.processFailed ===
      "Не удалось обработать фотографию. Попробуйте выбрать другое изображение.",
    "process-fail copy",
  );
  assert(
    AVATAR_ERROR_MESSAGES.choosePhoto === "Выберите фотографию из галереи",
    "live-photo/video copy",
  );
  assert(!("heicUnsupported" in AVATAR_ERROR_MESSAGES), "no HEIC unsupported string");
  assert(AVATAR_MAX_SOURCE_BYTES === 20 * 1024 * 1024, "source ceiling is 20 MiB");
  assert(AVATAR_MAX_INPUT_PIXELS >= 48_000_000, "pixel cap must allow 48MP phones");
  assert(AVATAR_MAX_INPUT_PIXELS === 64_000_000, "pixel cap stays at 64e6");
  assert(AVATAR_MAX_SOURCE_DIMENSION === 12_000, "side cap stays at 12000");
  assert(
    AVATAR_ERROR_MESSAGES.resolutionTooLarge ===
      "Фото слишком большого разрешения. Выберите другое изображение.",
    "108/200MP copy",
  );
  assert(
    avatarProcessErrorMessage("image_too_large") ===
      AVATAR_ERROR_MESSAGES.resolutionTooLarge,
    "avatar image_too_large uses resolution copy",
  );
  const hook = readFileSync(join(root, "src/components/images/useAvatarCropUpload.tsx"), "utf8");
  assert(
    hook.includes("if (!url?.trim()) {\n    return null;"),
    "appendAvatarCacheBuster returns null for blank URLs",
  );
  assert(!hook.includes("return url ?? null"), "must not return whitespace URL");
}

async function testClientMetaAndMagic() {
  const jpeg = await createSolidJpeg(64, 64);
  const png = await createPng();
  const webp = await createWebp();
  const avif = await createAvif();
  const heic = readFileSync(heicPath);
  const gif = Buffer.from("GIF89a", "ascii");
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', "utf8");
  const mov = createMovStub();
  const fakeJpg = Buffer.from("this is not an image", "utf8");

  const cases = [
    ["photo.jpg", "image/jpeg", jpeg, true],
    ["PHOTO.JPG", "", jpeg, true],
    ["shot.jpeg", "image/jpeg", jpeg, true],
    ["logo.png", "image/png", png, true],
    ["pic.webp", "image/webp", webp, true],
    ["IMG_0001.HEIC", "", heic, true],
    ["IMG_0001.heif", "image/heif", heic, true],
    ["modern.avif", "image/avif", avif, true],
    ["photo", "image/jpeg", jpeg, true],
    ["spoof.jpg", "image/gif", jpeg, true],
    ["clip.mov", "video/quicktime", mov, false],
    ["anim.gif", "image/gif", gif, false],
    ["icon.svg", "image/svg+xml", svg, false],
    ["not-image.jpg", "image/jpeg", fakeJpg, false],
  ];

  for (const [name, type, buffer, shouldPass] of cases) {
    const file = makeFile(buffer, name, type);
    const error = await validateAvatarSourceFile(file);
    assert(
      shouldPass ? error === null : Boolean(error),
      `${name} type=${JSON.stringify(type)} expected ${shouldPass ? "pass" : "reject"}, got ${error}`,
    );
  }

  const emptyType = makeFile(jpeg, "IMG_0001.JPG", "");
  assert((await peekAvatarSourceKind(emptyType)) === "image/jpeg", "empty type still sniffs jpeg");

  const spoofed = makeFile(jpeg, "photo.png", "application/octet-stream");
  assert((await validateAvatarSourceFile(spoofed)) === null, "spoofed MIME with jpeg bytes passes");

  const tooBig = { name: "big.jpg", type: "image/jpeg", size: AVATAR_MAX_SOURCE_BYTES + 1 };
  assert(
    validateAvatarSourceFileMeta(tooBig) === AVATAR_ERROR_MESSAGES.fileTooLarge,
    "20 MiB + 1 rejects",
  );

  const justOver3 = { name: "phone.jpg", type: "image/jpeg", size: Math.round(3.1 * 1024 * 1024) };
  assert(validateAvatarSourceFileMeta(justOver3) === null, "3.1 MB camera jpeg passes source check");

  const fifteen = { name: "phone.jpg", type: "", size: 15 * 1024 * 1024 };
  assert(validateAvatarSourceFileMeta(fifteen) === null, "15 MB source passes");

  const movMeta = { name: "IMG_0001.MOV", type: "", size: 1024 };
  assert(
    validateAvatarSourceFileMeta(movMeta) === AVATAR_ERROR_MESSAGES.choosePhoto,
    "Live Photo movie is rejected with gallery copy",
  );
}

async function testSourceSizesAndProcess() {
  const jpeg31 = await createNoisyJpeg(2400, 2000, 100);
  assert(jpeg31.length > 3.1 * 1024 * 1024, `3.1MB fixture too small: ${jpeg31.length}`);
  assert(
    validateAvatarSourceFileMeta({
      name: "phone.jpg",
      type: "image/jpeg",
      size: jpeg31.length,
    }) === null,
    "real 3.1+ MB jpeg passes meta",
  );

  const square31 = await sharp(jpeg31).resize(1000, 1000, { fit: "cover" }).jpeg().toBuffer();
  const processed31 = await processImageForProfile(square31, "", "user-avatar");
  assert(
    processed31.ok,
    `3.1 MB cropped jpeg should persist${processed31.ok ? "" : `: ${processed31.code}`}`,
  );

  const jpeg15 = await createNoisyJpeg(4200, 3200, 98);
  assert(jpeg15.length > 10 * 1024 * 1024, `large jpeg fixture too small: ${jpeg15.length}`);
  assert(jpeg15.length <= AVATAR_MAX_SOURCE_BYTES, "15-ish MB fixture must stay under 20 MiB");
  assert(
    validateAvatarSourceFileMeta({
      name: "IMG_PHONE.JPG",
      type: "",
      size: jpeg15.length,
    }) === null,
    "~15 MB source passes",
  );

  const oversized = Buffer.alloc(AVATAR_MAX_SOURCE_BYTES + 1, 0xff);
  oversized[0] = 0xff;
  oversized[1] = 0xd8;
  oversized[2] = 0xff;
  const rejected = validateImageBufferForProfile(oversized, "image/jpeg", "user-avatar");
  assert(!rejected.ok && rejected.code === "invalid_file_size", "20 MiB + 1 rejected on server");

  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', "utf8");
  assert(
    !validateImageBufferForProfile(svg, "image/svg+xml", "author-avatar").ok,
    "SVG rejected",
  );
  const gif = Buffer.from("GIF89a............", "ascii");
  assert(!validateImageBufferForProfile(gif, "image/gif", "user-avatar").ok, "GIF rejected");
  assert(
    !validateImageBufferForProfile(createMovStub(), "video/quicktime", "user-avatar").ok,
    "MOV rejected on server",
  );
  assert(
    !validateImageBufferForProfile(Buffer.from("not-an-image"), "image/jpeg", "user-avatar").ok,
    ".jpg that is not an image rejected",
  );
}

function assertPersistentWebp(result, label) {
  assert(result.ok, `${label} should process`);
  assert(result.data.originalBuffer.length === 0, `${label} must not keep a trusted original`);
  assert(result.data.variants.length > 0, `${label} should emit variants`);
  for (const variant of result.data.variants) {
    assert(variant.mimeType === "image/webp", `${label} ${variant.key} mime must be image/webp`);
    assertWebpObject(variant.buffer, `${label} ${variant.key}`);
  }
}

async function testWebpOnlyPersistence() {
  const jpeg = await sharp({
    create: { width: 1000, height: 1000, channels: 3, background: { r: 90, g: 40, b: 160 } },
  })
    .jpeg({ quality: 88 })
    .toBuffer();
  const png = await createPng().then((buffer) =>
    sharp(buffer).resize(1000, 1000).png().toBuffer(),
  );
  const webp = await sharp(jpeg).webp({ quality: 80 }).toBuffer();
  const avif = await sharp(jpeg).avif({ quality: 40 }).toBuffer();
  const heic = readFileSync(heicPath);
  const heicJpeg = await convertHeicToJpegBuffer(heic);

  const jpegUser = await processImageForProfile(jpeg, "image/jpeg", "user-avatar");
  const jpegAuthor = await processImageForProfile(jpeg, "", "author-avatar");
  const pngUser = await processImageForProfile(png, "image/png", "user-avatar");
  const webpUser = await processImageForProfile(webp, "image/webp", "user-avatar");
  const avifUser = await processImageForProfile(avif, "image/avif", "user-avatar");

  assertPersistentWebp(jpegUser, "user jpeg");
  assertPersistentWebp(jpegAuthor, "author jpeg");
  assertPersistentWebp(pngUser, "user png");
  assertPersistentWebp(webpUser, "user webp re-normalized");
  assertPersistentWebp(avifUser, "user avif");

  const jpegMeta = await sharp(jpegUser.data.variants[0].buffer).metadata();
  assert(jpegMeta.format === "webp", "sharp must read persisted bytes as webp");
  assert(!jpegMeta.exif, "persisted webp should not keep EXIF");

  assert(detectMimeFromMagic(heic) === "image/heif" || detectMimeFromMagic(heic) === "image/heic", "HEIC magic");
  assert(detectImageKindFromBytes(avif) === "image/avif", "AVIF magic");
  assert(heicJpeg[0] === 0xff && heicJpeg[1] === 0xd8, "HEIC fallback must emit JPEG");
}

async function testHeicFallbackAndPreviewBounds() {
  const heic = readFileSync(heicPath);
  const jpeg = await convertHeicToJpegBuffer(heic);
  const meta = await sharp(jpeg).metadata();
  assert(meta.format === "jpeg", "fallback output is jpeg");
  assert(meta.width === 1440 && meta.height === 960, "fallback keeps source size");

  const prepared = await prepareAvatarSourceBuffer(heic, "", "user-avatar");
  assert(prepared.ok, "server must prepare HEIC when sharp cannot decode HEVC");
  assert(prepared.ok && detectMimeFromMagic(prepared.buffer) === "image/jpeg", "prepared HEIC becomes JPEG");

  const authorConfig = getImageProfileConfig("author-avatar");
  const userConfig = getImageProfileConfig("user-avatar");
  assert(authorConfig.maxUploadBytes === AVATAR_MAX_SOURCE_BYTES, "author avatar source 20 MiB");
  assert(userConfig.maxUploadBytes === AVATAR_MAX_SOURCE_BYTES, "user avatar source 20 MiB");
  assert(userConfig.storesOriginal === false, "user-avatar must not store original");
  assert(authorConfig.storesOriginal === false, "author-avatar must not store original");
}

async function testExifOrientation() {
  const normal = await createOrientedJpeg(1);
  const upside = await createOrientedJpeg(3);
  const right = await createOrientedJpeg(6);
  const left = await createOrientedJpeg(8);

  const square = async (buffer) =>
    sharp(buffer).rotate().resize(1000, 1000, { fit: "cover" }).jpeg().toBuffer();

  const a = await processImageForProfile(await square(normal), "image/jpeg", "user-avatar");
  const b = await processImageForProfile(await square(upside), "image/jpeg", "user-avatar");
  const c = await processImageForProfile(await square(right), "image/jpeg", "author-avatar");
  const d = await processImageForProfile(await square(left), "image/jpeg", "author-avatar");

  assert(a.ok && b.ok && c.ok && d.ok, "EXIF 1/3/6/8 should process after rotate");
  assertPersistentWebp(c, "exif 6");
  assertPersistentWebp(d, "exif 8");

  const rawRight = await processImageForProfile(right, "image/jpeg", "product-cover", {
    skipOriginalStore: true,
  });
  const rawNormal = await processImageForProfile(normal, "image/jpeg", "product-cover", {
    skipOriginalStore: true,
  });
  assert(rawRight.ok && rawNormal.ok, "cover EXIF 6 still works");
  const normalLg = rawNormal.data.variants.find((variant) => variant.key === "lg");
  const orientedLg = rawRight.data.variants.find((variant) => variant.key === "lg");
  assert(
    normalLg &&
      orientedLg &&
      normalLg.width === orientedLg.height &&
      normalLg.height === orientedLg.width,
    "EXIF 6 should swap rendered dimensions like the cover pipeline",
  );
}

async function testStorageUploadIsWebp() {
  const jpeg = await sharp({
    create: { width: 1000, height: 1000, channels: 3, background: { r: 30, g: 80, b: 140 } },
  })
    .jpeg()
    .toBuffer();
  const rawHeic = readFileSync(heicPath);

  const jpegStorage = createMemoryStorage();
  const jpegUploaded = await processAndUploadImageSet({
    profile: "user-avatar",
    bucket: "user-avatars",
    buffer: jpeg,
    declaredMime: "image/jpeg",
    storage: jpegStorage,
    context: { userId: "11111111-1111-4111-8111-111111111111" },
  });

  assert(jpegUploaded.ok, "jpeg-user upload should succeed");
  assert(jpegStorage.objects.length > 0, "jpeg-user stored objects");
  for (const object of jpegStorage.objects) {
    assert(object.path.endsWith(".webp"), `${object.path} must end with .webp`);
    assert(object.contentType === "image/webp", `${object.path} Content-Type must be image/webp`);
    assertWebpObject(object.bytes, object.path);
    const meta = await sharp(object.bytes).metadata();
    assert(meta.format === "webp", `${object.path} sharp format must be webp`);
  }

  const heicStorage = createMemoryStorage();
  const heicUploaded = await processAndUploadImageSet({
    profile: "author-avatar",
    bucket: "author-assets",
    buffer: rawHeic,
    declaredMime: "",
    storage: heicStorage,
    context: { authorId: "22222222-2222-4222-8222-222222222222", authorKind: "avatar" },
  });

  assert(heicUploaded.ok, `raw HEIC full pipeline should succeed, got ${heicUploaded.code}`);
  assert(heicStorage.objects.length > 0, "raw HEIC stored objects");
  for (const object of heicStorage.objects) {
    assert(object.path.endsWith(".webp"), `raw HEIC ${object.path} must end with .webp`);
    assert(
      object.contentType === "image/webp",
      `raw HEIC ${object.path} Content-Type must be image/webp`,
    );
    assertWebpObject(object.bytes, `raw HEIC ${object.path}`);
    const meta = await sharp(object.bytes).metadata();
    assert(meta.format === "webp", `raw HEIC ${object.path} sharp format must be webp`);
    const kind = detectImageKindFromBytes(object.bytes);
    assert(kind !== "image/heic" && kind !== "image/heif", "HEIC must not persist");
  }
}

async function testHeicTimeoutKillsWorker() {
  const heic = readFileSync(heicPath);
  const fallbackSource = readFileSync(join(root, "src/lib/images/heic-fallback.ts"), "utf8");
  assert(fallbackSource.includes("node:child_process"), "HEIC convert uses a child process");
  assert(fallbackSource.includes('kill("SIGKILL")'), "timeout must SIGKILL the child");
  assert(
    fallbackSource.includes('serialization: "advanced"'),
    "fork must use advanced serialization for large Buffers",
  );

  const started = Date.now();
  let timedOut = false;

  try {
    await convertHeicToJpegBuffer(heic, 80, { hangForTest: true });
  } catch (error) {
    timedOut = error instanceof Error && error.message === "heic_convert_timeout";
  }

  const elapsed = Date.now() - started;
  assert(timedOut, "hanging worker must reject with heic_convert_timeout");
  assert(elapsed < 2000, `terminate must abort hang quickly, took ${elapsed}ms`);
}

async function testLargeHeicIpcTimeout() {
  const payload = Buffer.alloc(12 * 1024 * 1024, 0x5a);
  const started = Date.now();
  let timedOut = false;

  try {
    await convertHeicToJpegBuffer(payload, 120, { hangForTest: true });
  } catch (error) {
    timedOut = error instanceof Error && error.message === "heic_convert_timeout";
  }

  const elapsed = Date.now() - started;
  assert(timedOut, "12 MiB IPC hang must still timeout");
  assert(elapsed < 2500, `large Buffer IPC+kill must stay fast, took ${elapsed}ms`);
}

function createJpegWithSofDimensions(width, height) {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
  ]);
}

function patchHeicIspe(buffer, width, height) {
  const copy = Buffer.from(buffer);
  const marker = Buffer.from("ispe");
  const index = copy.indexOf(marker);
  assert(index >= 0, "sample.heic must contain ispe");
  copy.writeUInt32BE(width, index + 8);
  copy.writeUInt32BE(height, index + 12);
  return copy;
}

async function testHighResolutionBounds() {
  assert(validateImageSourceBounds(8000, 6000, "user-avatar") === null, "48MP passes");
  assert(
    validateImageSourceBounds(12_000, 9_000, "user-avatar") === "image_too_large",
    "108MP is rejected",
  );
  assert(
    validateImageSourceBounds(16_384, 12_288, "author-avatar") === "image_too_large",
    "200MP is rejected",
  );
  assert(
    avatarSourceBoundsError(12_000, 9_000) === AVATAR_ERROR_MESSAGES.resolutionTooLarge,
    "client 108MP uses resolution copy",
  );
  assert(
    avatarSourceBoundsError(16_384, 12_288) === AVATAR_ERROR_MESSAGES.resolutionTooLarge,
    "client 200MP uses resolution copy",
  );

  const oversizeJpeg = createJpegWithSofDimensions(12_000, 9_000);
  const jpegHeader = peekImageHeaderDimensions(oversizeJpeg);
  assert(jpegHeader?.width === 12_000 && jpegHeader.height === 9_000, "JPEG SOF preflight");
  const jpegPrepared = await prepareAvatarSourceBuffer(oversizeJpeg, "image/jpeg", "user-avatar");
  assert(!jpegPrepared.ok && jpegPrepared.code === "image_too_large", "108MP JPEG rejected at header");

  const rawHeic = readFileSync(heicPath);
  const oversizeHeic = patchHeicIspe(rawHeic, 12_000, 9_000);
  assert(detectImageKindFromBytes(oversizeHeic) === "image/heic" || detectImageKindFromBytes(oversizeHeic) === "image/heif", "patched fixture stays HEIC");
  const ispe = readHeifIspeDimensions(oversizeHeic);
  assert(ispe?.width === 12_000 && ispe.height === 9_000, "ispe preflight reads patched 108MP");
  const header = await readAvatarHeaderDimensions(oversizeHeic);
  assert(header?.width === 12_000 && header.height === 9_000, "header path sees 108MP without decode");

  let convertCalls = 0;
  const prepared = await prepareAvatarSourceBuffer(oversizeHeic, "", "user-avatar", {
    convertHeic: async () => {
      convertCalls += 1;
      throw new Error("convert must not run for over-limit HEIC");
    },
  });
  assert(!prepared.ok && prepared.code === "image_too_large", "over-limit HEIC rejected before WASM");
  assert(convertCalls === 0, "convertHeicToJpegBuffer must not be called for 108MP HEIC");
}

async function testFortyEightMpPreviewPath() {
  assert(AVATAR_PREVIEW_MAX_EDGE === 4096, "crop preview stays at 4096");
  assert(
    AVATAR_CLIENT_DIRECT_PREVIEW_MAX_BYTES === 2 * 1024 * 1024,
    "direct client preview stays under 2 MiB",
  );
  assert(
    shouldUseServerAvatarPreview({ name: "IMG_0001.HEIC", type: "", size: 400_000 }),
    "HEIC always uses server preview",
  );
  assert(
    shouldUseServerAvatarPreview({
      name: "IMG_PHONE.JPG",
      type: "image/jpeg",
      size: 8 * 1024 * 1024,
    }),
    "8 MB phone JPEG uses server preview",
  );
  assert(
    shouldUseServerAvatarPreview(
      { name: "wide.jpg", type: "image/jpeg", size: 400_000 },
      { width: 8000, height: 6000 },
    ),
    "48MP header uses server preview even if file is small",
  );
  assert(
    !shouldUseServerAvatarPreview({
      name: "tiny.jpg",
      type: "image/jpeg",
      size: 80_000,
    }),
    "small jpeg can stay on the fast path",
  );

  const hook = readFileSync(join(root, "src/components/images/useAvatarCropUpload.tsx"), "utf8");
  assert(hook.includes("shouldUseServerAvatarPreview"), "hook routes heavy sources to server preview");
  assert(hook.includes("setSourceFile(previewSource)"), "crop sourceBlob is the bounded preview");
  const validation = readFileSync(join(root, "src/lib/images/avatar-source-validation.ts"), "utf8");
  assert(
    validation.includes("AvatarSourceNeedsBoundedPreview"),
    "client must refuse a canvas larger than preview max edge",
  );
  assert(
    validation.includes("AVATAR_PREVIEW_MAX_EDGE"),
    "client canvas is capped at preview max edge",
  );
}

async function testAuthorApiMessageContract() {
  const route = readFileSync(join(root, "src/app/api/author/profile/[kind]/route.ts"), "utf8");
  assert(route.includes("AVATAR_ERROR_MESSAGES.fileTooLarge"), "author avatar size returns message");
  assert(route.includes("AVATAR_MAX_SOURCE_BYTES"), "author avatar uses 20 MiB source cap");
  const hook = readFileSync(join(root, "src/components/images/useAvatarCropUpload.tsx"), "utf8");
  assert(hook.includes("/api/images/avatar-preview"), "browser decode failure uses server preview");
  assert(!hook.includes("heicUnsupported"), "hook has no HEIC unsupported path");
}

async function main() {
  await testPickerAndMessages();
  await testClientMetaAndMagic();
  await testSourceSizesAndProcess();
  await testWebpOnlyPersistence();
  await testHeicFallbackAndPreviewBounds();
  await testHeicTimeoutKillsWorker();
  await testLargeHeicIpcTimeout();
  await testHighResolutionBounds();
  await testFortyEightMpPreviewPath();
  await testExifOrientation();
  await testStorageUploadIsWebp();
  await testAuthorApiMessageContract();
  console.log("avatar-mobile-upload-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
