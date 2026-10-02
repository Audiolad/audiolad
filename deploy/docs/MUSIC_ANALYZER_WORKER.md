# Music Analyzer worker (Phase 2A)

Automated runs live beside the human listening lab. The Next.js app enqueues
`music_analyzer_runs`. A PM2 fork on the **same Timeweb VPS as audiolad.ru**
claims a run and executes the pinned Python analyzer. This is not Company Core
and not a laptop process.

The page for Sergey, after an explicit production deploy, is:

```text
https://audiolad.ru/music-analyzer/runs
```

Owner and admin only, same gate as `/music-analyzer`. The human hub stays.

## What the app does

1. The browser uploads WAV or MP3 (up to 100 MB) into the private bucket
   `music-analyzer-runs` with a signed upload URL.
2. The server hashes the stored object and inserts a new `queued` row.
   The same SHA256 again is a new `version_number`. Rows are not deleted.
   A succeeded or failed row cannot be updated.
3. `audiolad-music-analyzer-worker` claims the row, downloads the object,
   converts MP3 to WAV with ffmpeg when the bytes are not a WAV, then runs:

```text
.venv-v03-clap/bin/python analyze_track.py <wav> --output-dir <dir> --device cpu
```

Working directory is the pinned checkout. No extra instrument-strategy flag
is passed. Environment variables that name Candidate A or an instrument
strategy are removed before spawn. Musical fields are whatever JSON the
script writes. Missing taxonomy or prompt version stays empty.

4. The worker seals `raw_json`, `normalized_json`, and provenance only when
   `git rev-parse HEAD` starts with `932c4ce` and `3750f3b` is an ancestor.
   The checkpoint file must be `music_audioset_epoch_15_esc_90.14.pt`.

## Ops bootstrap (on the audiolad.ru VPS)

Do this on the machine that serves audiolad.ru. Do not use `64.188.59.113`.
These steps are not run by the Next deploy and are not a claim that they
already happened.

```bash
sudo mkdir -p /var/lib/audiolad/music-analyzer
sudo chown deploy:deploy /var/lib/audiolad/music-analyzer
git clone --branch cursor/benchmark-harness-v01 https://github.com/Audiolad/music-analyzer.git /var/lib/audiolad/music-analyzer
git -C /var/lib/audiolad/music-analyzer checkout 932c4ce
git -C /var/lib/audiolad/music-analyzer rev-parse HEAD
git -C /var/lib/audiolad/music-analyzer merge-base --is-ancestor 3750f3b HEAD
```

`HEAD` must start with `932c4ce`. `3750f3b` must be an ancestor (analyzer
content). Create the venv inside that checkout:

```bash
python3 -m venv /var/lib/audiolad/music-analyzer/.venv-v03-clap
/var/lib/audiolad/music-analyzer/.venv-v03-clap/bin/pip install -r /var/lib/audiolad/music-analyzer/requirements.txt
```

Use the install instructions from the pinned checkout if the requirements
file has a different name. Place the CLAP checkpoint next to the checkout,
outside the Next release tree:

```text
/var/lib/audiolad/music-analyzer/music_audioset_epoch_15_esc_90.14.pt
```

ffmpeg must be on `PATH` (the music transcode worker already uses it).
Do not export a Candidate A or instrument-strategy variable for this process.

Optional overrides, still on this VPS only:

```text
MUSIC_ANALYZER_ROOT=/var/lib/audiolad/music-analyzer
MUSIC_ANALYZER_CHECKPOINT=/var/lib/audiolad/music-analyzer/music_audioset_epoch_15_esc_90.14.pt
```

The Python path is always `$MUSIC_ANALYZER_ROOT/.venv-v03-clap/bin/python`.

## How production starts the worker

`deploy/scripts/deploy.sh` applies pending migrations from the candidate
release, then after cutover runs:

```text
deploy/scripts/ensure-music-analyzer-worker.sh
```

That starts PM2 app `audiolad-music-analyzer-worker` from
`deploy/music-analyzer-worker.ecosystem.config.cjs` with
`cwd=/var/www/audiolad-deploy/current`. The process loads `.env.production`
from the release. It does not install Python and does not copy the checkpoint
into the release.

If the checkout or checkpoint is missing, the PM2 process can still be online.
Each job then fails closed (`analyzer_runtime_missing` or `checkpoint_missing`)
and does not invent musical fields. A later upload of the same file creates
a new run.

## Deploy path

Merging this change does not cut over production. Production Deploy is
manual: GitHub Actions workflow `production-deploy.yml`, input `confirm=DEPLOY`,
after an explicit «деплоим». Empty `commit_sha` deploys the `origin/main` tip.
The migration `20261217120000_music_analyzer_runs_v01.sql` is applied by
`deploy.sh` only as part of that deploy. Do not apply it by hand from a laptop.

After that deploy, Sergey checks `https://audiolad.ru/music-analyzer/runs`.
Analysis succeeds only after the bootstrap above is on the VPS.
