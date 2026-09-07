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
  AVATAR_ERROR_MESSAGES,
  AVATAR_INPUT_ACCEPT,
  AVATAR_MAX_INPUT_PIXELS,
  AVATAR_MAX_SOURCE_BYTES,
  AVATAR_UPLOAD_HINT,
} from "../src/lib/images/avatar-constants.ts";
import {
  peekAvatarSourceKind,
  validateAvatarSourceFile,
  validateAvatarSourceFileMeta,
} from "../src/lib/images/avatar-source-validation.ts";
import { prepareAvatarSourceBuffer } from "../src/lib/images/avatar-source-prepare.ts";
import { convertHeicToJpegBuffer } from "../src/lib/images/heic-fallback.ts";
import { getImageProfileConfig } from "../src/lib/images/image-profiles.ts";
import { detectImageKindFromBytes } from "../src/lib/images/image-magic.ts";
import { processImageForProfile } from "../src/lib/images/process-image.ts";
import { processAndUploadImageSet } from "../src/lib/images/upload-image-set.ts";
import {
  detectMimeFromMagic,
  validateImageBufferForProfile,
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
  assert(processed31.ok, "3.1 MB cropped jpeg should persist");

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
  const heicSquare = await sharp(heicJpeg).resize(1000, 1000, { fit: "cover" }).jpeg().toBuffer();

  const jpegUser = await processImageForProfile(jpeg, "image/jpeg", "user-avatar");
  const jpegAuthor = await processImageForProfile(jpeg, "", "author-avatar");
  const pngUser = await processImageForProfile(png, "image/png", "user-avatar");
  const webpUser = await processImageForProfile(webp, "image/webp", "user-avatar");
  const avifUser = await processImageForProfile(avif, "image/avif", "user-avatar");
  const heicPrepared = await processImageForProfile(heicSquare, "image/jpeg", "author-avatar");
  const heicDirect = await processImageForProfile(heicSquare, null, "user-avatar");

  assertPersistentWebp(jpegUser, "user jpeg");
  assertPersistentWebp(jpegAuthor, "author jpeg");
  assertPersistentWebp(pngUser, "user png");
  assertPersistentWebp(webpUser, "user webp re-normalized");
  assertPersistentWebp(avifUser, "user avif");
  assertPersistentWebp(heicPrepared, "heic fallback jpeg");
  assertPersistentWebp(heicDirect, "heic via sharp then jpeg");

  const jpegMeta = await sharp(jpegUser.data.variants[0].buffer).metadata();
  assert(jpegMeta.format === "webp", "sharp must read persisted bytes as webp");
  assert(!jpegMeta.exif, "persisted webp should not keep EXIF");

  assert(detectMimeFromMagic(heic) === "image/heif" || detectMimeFromMagic(heic) === "image/heic", "HEIC magic");
  assert(detectImageKindFromBytes(avif) === "image/avif", "AVIF magic");
  assert(heicJpeg[0] === 0xff && heicJpeg[1] === 0xd8, "HEIC fallback must emit JPEG");

  const heicSharp = await processImageForProfile(
    await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer(),
    "image/heic",
    "user-avatar",
  );
  assertPersistentWebp(heicSharp, "declared heic on jpeg bytes");
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
  const heic = readFileSync(heicPath);
  const heicSquare = await sharp(await convertHeicToJpegBuffer(heic))
    .resize(1000, 1000, { fit: "cover" })
    .jpeg()
    .toBuffer();

  for (const [label, buffer, profile, context] of [
    [
      "jpeg-user",
      jpeg,
      "user-avatar",
      { userId: "11111111-1111-4111-8111-111111111111" },
    ],
    [
      "heic-author",
      heicSquare,
      "author-avatar",
      { authorId: "22222222-2222-4222-8222-222222222222", authorKind: "avatar" },
    ],
  ]) {
    const storage = createMemoryStorage();
    const uploaded = await processAndUploadImageSet({
      profile,
      bucket: profile === "user-avatar" ? "user-avatars" : "author-assets",
      buffer,
      declaredMime: "image/jpeg",
      storage,
      context,
    });

    assert(uploaded.ok, `${label} upload should succeed`);
    assert(storage.objects.length > 0, `${label} stored objects`);
    for (const object of storage.objects) {
      assert(object.path.endsWith(".webp"), `${label} ${object.path} must end with .webp`);
      assert(
        object.contentType === "image/webp",
        `${label} ${object.path} Content-Type must be image/webp`,
      );
      assertWebpObject(object.bytes, `${label} ${object.path}`);
    }
  }
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
  await testExifOrientation();
  await testStorageUploadIsWebp();
  await testAuthorApiMessageContract();
  console.log("avatar-mobile-upload-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
