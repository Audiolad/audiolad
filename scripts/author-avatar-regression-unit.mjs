#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { AVATAR_UPLOAD_HINT } from "../src/lib/images/avatar-constants.ts";
function assert(c,m){if(!c)throw new Error(m)}
function read(p){return readFileSync(p,"utf8")}
const profile=read("src/components/author-dashboard/AuthorProfileClient.tsx");
assert(profile.includes('import AuthorAvatarUploadBlock from "./AuthorAvatarUploadBlock"'),"imports avatar block");
assert(profile.includes("<AuthorAvatarUploadBlock"),"renders avatar block");
assert(!profile.includes("Квадратное изображение"),"no legacy hint");
const avatar=read("src/components/author-dashboard/AuthorAvatarUploadBlock.tsx");
assert(avatar.includes("useAvatarCropUpload"),"avatar uses crop hook");
assert(avatar.includes("AVATAR_UPLOAD_HINT"),"avatar uses shared hint");
assert(!avatar.includes("validateCoverFile"),"avatar no cover validation");
assert(AVATAR_UPLOAD_HINT.includes("вы сможете выбрать нужную область"),"hint mentions crop");
const hook=read("src/components/author-dashboard/useAuthorAssetUpload.ts");
assert(!hook.includes('kind: "avatar"'),"hook banner-only kind");
assert(!hook.includes("validateCoverFile"),"hook no cover validation");
assert(hook.includes("validateAuthorBannerFile"),"hook keeps banner validation");
assert(hook.includes('"/api/author/profile/banner"'),"hook banner endpoint");
assert(!hook.includes("handleAvatarFileChange"),"no avatar handler");
const cover=read("src/components/author-dashboard/useCoverUpload.ts");
assert(cover.includes("validateCoverFile"),"product cover keeps validation");
console.log("author-avatar-regression-unit: ok");
