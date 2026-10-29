# Ogg audio upload audit (29.10.2026)

Initial git status was clean. No commit, push, production operation, dependency installation, secret read, dev server or migration execution was performed.

## Gates investigated

| Gate and file:line | Before -> after / finding |
| --- | --- |
| Cabinet descriptor, MIME, size, accept: `src/lib/author-products/product-audio-upload-contract.ts:23` | MP3/WAV/M4A/AAC; 300 MiB -> add OGG/OGA/OPUS and all requested MIME aliases, canonical audio/ogg; same size limit. |
| Cabinet source path and parser: `src/lib/author-products/product-audio-upload-contract.ts:91` | m4a|aac|wav -> m4a|aac|wav|ogg; extension aliases detected as ogg. |
| Cabinet ordinary and music input elements: `src/components/author-dashboard/AuthorProductForm.tsx:5526` | Music inputs at 5526/5850 accepted WAV/MP3 -> also Ogg; ordinary input at 5883 inherits shared contract. |
| Album batch filename/title recognition: `src/lib/author-products/music-album-batch.ts:19` | wav|mp3 -> also ogg|oga|opus. |
| Music upload mode: `src/lib/listen/music-delivery.ts:99` | WAV master / direct MP3 -> Ogg aliases use existing master pipeline. |
| Music descriptor and path ownership: `src/lib/author-products/music-master-upload-contract.ts:60` | WAV-only master -> WAV or Ogg; canonical .ogg path, same 300 MiB limit. |
| Music canonical signed upload MIME: `src/lib/author-products/music-master-upload-client.ts:147` | Fixed audio/wav -> canonical MIME selected by source format, including multipart File type. |
| Cabinet direct start/finalize: `src/lib/author-products/server/direct-audio-upload.ts:343` | Ordinary source contract and finalize format union -> accept Ogg; music still routes through its dedicated master endpoint. |
| Music master server: `src/lib/author-products/server/music-master-upload.ts:180` | WAV path/probe -> select Ogg source path/MIME and validate actual media with shared Ogg ffprobe policy before verification. |
| Normalize format alias: `src/lib/product-audio-normalize/contract.ts:18` | Inherits source contract; now includes ogg without a second format list. |
| Normalize worker claimed-job gate: `src/lib/product-audio-normalize/worker.ts:102` | m4a/aac/wav -> also ogg. |
| Real media validation: `src/lib/product-audio-normalize/source-validation.ts:39` | No Ogg policy -> require ogg container, Opus/Vorbis only, audio present, no video, positive duration; reject FLAC-in-Ogg. |
| Cabinet transcode and output validation: `src/lib/product-audio-normalize/ffmpeg.ts:221` | Existing autodetect ffmpeg -> MP3 192k unchanged; actual MP3 output and duration validated. |
| Cabinet activation duration: `src/lib/product-audio-normalize/worker-runtime.ts:293` | Existing activation uses probed delivery duration and canonical target MP3; unchanged. |
| Music transcode input: `src/lib/music-transcode/worker-runtime.ts:326` | master.wav temp filename -> .ogg for Ogg masters; ffmpeg function already autodetects input, MP3 stream output unchanged. |
| Music ffmpeg output: `src/lib/music-transcode/ffmpeg.ts:184` | Historical function name retained; no -f wav input restriction. Real Ogg input now tested; canonical MP3 validation unchanged. |
| Passport source and MIME mapping: `src/lib/music-passport/jazz-relax-pilot.ts:629` | Fixed WAV/MP3 mapping -> verified Ogg masters use audio/ogg and .ogg; normalized product MP3 is identified as MP3 even if original upload name is Ogg. |
| DSP/loudness/PANNs input: `src/lib/music-analyzer-runs/execute.ts:205` | Existing non-WAV -> PCM WAV via ffmpeg before analysis; unchanged and suitable for Ogg. Model inference was inspected, not executed. |
| Studio file inputs: `src/components/studio/StudioWorkspace.tsx:106` | Two file inputs add extensions and all requested MIME aliases; Russian hint updated. |
| Studio editor inputs: `src/components/studio/StudioEditorShell.tsx:2853` | Both file inputs add Ogg extensions/MIME aliases. |
| Studio local validation: `src/lib/studio/local-file-validation.ts:11` | MP3/WAV/M4A/AAC -> also OGG/OGA/OPUS; reject contradictory MIME for Ogg filename. |
| Studio canonicalization: `src/lib/studio/recording-mime.ts:35` | Add Ogg MIME aliases and empty/octet-stream extension inference; recorder choices unchanged. |
| Studio server metadata: `src/lib/studio/server/validation.ts:29` | Add canonical audio/ogg; canonical .ogg storage filename, reject contradictory MIME; existing size limits preserved. |
| Studio signed upload/retry/replace: `src/lib/studio/persistence-client.ts:764` | Initial upload already uses server MIME; retry/replace raw MIME or MP3 fallback -> shared canonical MIME. |
| Studio temp extension: `src/lib/studio/server/audio-duration.ts:15` | Add audio/ogg -> ogg; ffprobe duration detection unchanged. |
| Studio finalize and replacement validation: `src/lib/studio/server/direct-upload.ts:174` | Duration-only probing -> shared Ogg container/codec/video validation for Ogg, on both finalize paths. |
| Studio playback/import gate: `src/lib/studio/local-playback-asset.ts:85` | Original blob HTMLAudio metadata probe remains; unsupported browser can reject before upload. No derivative/proxy exists. |
| Studio playback engine: `src/components/studio/StudioAudioProvider.tsx:292` | Original HTMLAudio routed through WebAudio remains. Recorder MIME selection uses native support; recordings are not universally portable. |
| Studio render source handling: `src/lib/studio/render/worker-runtime.ts:344` | Downloads raw bytes to .audio; ffmpeg autodetects input without MIME/extension restriction. MP3 export unchanged. |
| Waveform/peaks: `src/lib/studio/server/peaks.ts:48` | ffmpeg autodetection already works with Ogg; finalizer still intentionally returns optional peaks:null, preserving fallback behavior. |
| Legacy multipart API, outside live cabinet flow: `src/app/api/author/products/[id]/audio/[audioId]/upload/route.ts:68` | Unchanged MP3-only, 50 MiB proxy path. Live UI uses signed start/finalize for sources and dedicated music masters. |
| Separate audiobook-fragment workspace, outside main Studio editor: `src/lib/audiobooks/limits.ts:4` | Unchanged independent upload contract/bucket/CHECK; Ogg was not added to this separate audiobook-fragment system. |

## Storage and SQL gates

- `supabase/migrations/20260711071529_create_private_practice_audio_bucket.sql:69`: initial practice bucket audio/mpeg-only. Later `20260930120000_practice_audio_bucket_300mib.sql:8` sets 300 MiB; `20261009120000_practice_audio_allow_m4a_aac_mime.sql:10` adds M4A/AAC MIME; `20261009120400_practice_audio_allow_wav_normalize.sql:13` adds WAV MIME. New forward migration appends audio/ogg.
- `supabase/migrations/20261009120100_product_audio_normalize_jobs.sql:26`: original format/path CHECKs and enqueue function. `20261009120400_practice_audio_allow_wav_normalize.sql:37` is the later widening to WAV and supersession-safe enqueue implementation. New migration preserves that full body except its format allowlist.
- `supabase/migrations/20260809150000_studio_persistence_v1.sql:103`: initial Studio bucket MIME array; `20260810160000_studio_recording_webm_assets.sql:6` adds WebM; `20260928120000_studio_longform_asset_limits.sql:7` sets 300 MiB. Later shared-source/catalog/quota migrations do not add a MIME enumeration. New migration appends audio/ogg.
- `supabase/migrations/20261007120000_music_wav_master_foundation.sql:143`: music-masters WAV MIME bucket, 300 MiB; music-streams remains MP3 delivery. Music asset table has role/bucket/size/duration/state CHECKs, no WAV-only path or MIME enumeration. New migration appends audio/ogg to masters.
- `supabase/migrations/20261217120000_music_analyzer_runs_v01.sql:44`: analyzer MIME CHECK, bucket array near line 563. Later queue guards in `20270208130000_music_analyzer_queue_guards.sql` do not widen MIME. New migration preserves all values and adds audio/ogg to CHECK and bucket.

ONE forward migration: `supabase/migrations/20270209120000_ogg_audio_upload.sql`. Guarded array append, DROP/ADD CHECK constraints, same-signature CREATE OR REPLACE enqueue and existing service_role grants. No quota changes. Prepared only, not applied.

## Playback decision

Cabinet ordinary products produce canonical MP3 at audio_items.audio_path; music uses the existing verified master -> MP3 stream pipeline. Upload does not require browser metadata decoding. Main Studio retains original sources, matching existing WebM persistence. A browser unable to decode Ogg can fail local metadata before upload or fail playback of an imported project. No new per-track Safari derivative/proxy was built. Details: STUDIO_RENDER_EXPORT.md.

## Validation results

- Passed: product normalize SQL/contract/worker/retry-race/real ffmpeg tests; new real Ogg Opus and Vorbis processing test; Studio MIME/local metadata validation, longform and recorder tests; music master foundation, album batch, delivery, transcode worker/ffmpeg; jazz-relax passport tests.
- New test synthesizes temporary audio, probes and validates Ogg, normalizes with real product and music ffmpeg functions, validates MP3 and approximately two-second duration, and rejects MP3 bytes renamed to .ogg. No binary fixture is tracked. Missing ffmpeg/ffprobe gives an explicit skip.
- Registered in test:product-audio-normalize and new test:ogg-audio-upload; PR Repository Validation invokes test:ogg-audio-upload.
- Migration planner pure tests passed with the original repository paths and CLI subprocess checks omitted in a temporary sandbox runner. Full original planner invocation stalled in CLI subprocess checks and was interrupted; expectation arrays and counts were updated.
- TypeScript with 6144 MiB heap: no errors in changed files; project-wide command exits 2 because of an existing unavailable dependency outside this change.
- ESLint on changed scripts/TS/TSX: no errors; existing AuthorProductForm useEffect dependency warning remains. git diff --check and added-line U+2014 scan pass.
- Build could not start: this environment has Node 18.19.1, Next requires >=20.9.0. No dependencies were installed.
- Legacy author direct-upload unit suite cannot run unmodified on Node 18 (File global missing); with temporary File polyfill it fails an existing multipart assertion. This suite and its multipart helper were not changed.
- Browser/manual Safari testing, isolated SQL execution and full ML/PANNs inference were not performed; no dev server or database changes were authorized for this session.

## Changed files

- `.github/workflows/pr-repository-validation.yml`
- `docs/DATABASE.md`
- `docs/OGG_AUDIO_UPLOAD.md`
- `docs/STUDIO_RENDER_EXPORT.md`
- `package.json`
- `scripts/database-migrations-plan-unit.mjs`
- `scripts/jazz-relax-music-passport-unit.mts`
- `scripts/music-album-batch-unit.mts`
- `scripts/music-wav-master-foundation-unit.mts`
- `scripts/ogg-audio-processing-unit.mts`
- `scripts/product-audio-normalize-contract-unit.mts`
- `scripts/product-audio-normalize-sql-unit.mjs`
- `scripts/product-audio-normalize-worker-unit.mts`
- `scripts/studio-music-persist-mime-unit.mts`
- `src/components/author-dashboard/AuthorProductForm.tsx`
- `src/components/studio/StudioEditorShell.tsx`
- `src/components/studio/StudioWorkspace.tsx`
- `src/lib/author-products/music-album-batch.ts`
- `src/lib/author-products/music-master-upload-client.ts`
- `src/lib/author-products/music-master-upload-contract.ts`
- `src/lib/author-products/product-audio-upload-contract.ts`
- `src/lib/author-products/server/direct-audio-upload.ts`
- `src/lib/author-products/server/music-master-upload.ts`
- `src/lib/listen/music-delivery.ts`
- `src/lib/music-passport/jazz-relax-pilot.ts`
- `src/lib/music-transcode/worker-runtime.ts`
- `src/lib/product-audio-normalize/source-validation.ts`
- `src/lib/product-audio-normalize/worker.ts`
- `src/lib/studio/local-file-validation.ts`
- `src/lib/studio/persistence-client.ts`
- `src/lib/studio/recording-mime.ts`
- `src/lib/studio/server/audio-duration.ts`
- `src/lib/studio/server/direct-upload.ts`
- `src/lib/studio/server/validation.ts`
- `supabase/migrations/20270209120000_ogg_audio_upload.sql`

## Continuation

Review the diff and prepared migration. In a Node >=20.9 environment with the intended dependencies, rerun the registered tests, full typecheck/build and migration planner CLI checks. Then perform browser upload/retry/replace/playback checks in main Studio and cabinet, including affected Safari/iOS. Apply the migration and deploy updated workers only in a separately authorized deployment.
